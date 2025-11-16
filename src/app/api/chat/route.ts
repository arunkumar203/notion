import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import admin, { auth as adminAuth } from '@/lib/firebase-admin';
import { GoogleGenAI } from '@google/genai';

const jsonError = (status: number, message: string) => NextResponse.json({ error: message }, { status });

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    if (!adminAuth) return jsonError(500, 'Server not ready');
    
    const cookieStore = await cookies();
    const session = cookieStore.get('session')?.value || '';
    if (!session) return jsonError(401, 'Not authenticated');
    
    let decoded: any;
    try {
      decoded = await adminAuth.verifySessionCookie(session, true);
    } catch {
      return jsonError(401, 'Invalid session');
    }

    const uid = decoded?.uid as string;
    const body = await req.json().catch(() => ({}));
    const messages = body?.messages as Array<{ role: string; content: string }> | undefined;
    const requestedModel = body?.model as string | undefined;
    const includeThoughts = body?.includeThoughts !== false; // default true
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return jsonError(400, 'Missing messages');
    }

    // Read user's AI settings from RTDB
    const snap = await admin.database().ref(`users/${uid}/settings/ai`).get();
    const settings = (snap.exists() ? snap.val() : {}) as { apiKey?: string };
    const apiKey = (settings.apiKey || '').trim();
    
    // Use requested model or default to flash
    const model = requestedModel || 'gemini-2.5-flash';
    
    if (!apiKey) return jsonError(400, 'Missing Google AI Studio API key in Account > Details');

    const textEncoder = new TextEncoder();
    const ai = new GoogleGenAI({ apiKey });
    const tools = [{ googleSearch: {} }];
    
    // Validate API key before streaming
    try {
      await (ai as any).models.generateContent({
        model,
        config: { tools },
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
      });
    } catch (e: any) {
      // Extract the actual error message from Google's API response
      let errorMessage = 'AI service error';
      
      try {
        const errorStr = (e?.message || '').toString();
        console.log('Chat API - raw error:', errorStr);
        
        // Try to parse JSON error object from the message
        if (errorStr.includes('{') && errorStr.includes('error')) {
          // Find the JSON part
          const jsonStart = errorStr.indexOf('{');
          const jsonStr = errorStr.substring(jsonStart);
          const parsed = JSON.parse(jsonStr);
          
          // Extract the message from nested error object
          if (parsed?.error?.message) {
            errorMessage = parsed.error.message;
          } else if (parsed?.message) {
            errorMessage = parsed.message;
          }
        } else if (errorStr) {
          errorMessage = errorStr;
        }
      } catch (parseErr) {
        console.log('Chat API - parse error:', parseErr);
        errorMessage = (e?.message || 'Unknown error').toString();
      }
      
      console.log('Chat API - extracted error:', errorMessage);
      
      // Return the actual error message to the user
      const msg = errorMessage.toLowerCase();
      
      if (msg.includes('api key not valid') || msg.includes('api_key_invalid') || msg.includes('invalid_argument')) {
        return jsonError(400, errorMessage);
      }
      if (msg.includes('permission') || msg.includes('forbidden')) {
        return jsonError(403, errorMessage);
      }
      if (msg.includes('quota') || msg.includes('rate') || msg.includes('429')) {
        return jsonError(429, errorMessage);
      }
      if (msg.includes('model') && (msg.includes('not found') || msg.includes('unavailable'))) {
        return jsonError(400, errorMessage);
      }
      
      return jsonError(502, errorMessage);
    }
    
    // Configure thinking based on model and user preference
    const config: any = { tools };
    
    if (model.includes('pro')) {
      // Pro model: always include thinking with dynamic budget
      config.thinkingConfig = {
        includeThoughts: true,
        thinkingBudget: -1, // dynamic
      };
    } else if (model.includes('flash')) {
      // Flash model: optional thinking
      if (includeThoughts) {
        config.thinkingConfig = {
          includeThoughts: true,
          thinkingBudget: 1024,
        };
      } else {
        config.thinkingConfig = {
          includeThoughts: false,
          thinkingBudget: 0,
        };
      }
    }

    // Convert messages to Gemini format with conversation history
    const contents = messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          let yielded = false;
          
          try {
            const result: any = await (ai as any).models.generateContentStream({
              model,
              config,
              contents,
            });
            
            const streamIter: AsyncIterable<any> = (result && result.stream) ? result.stream : (result as any);
            
            for await (const chunk of streamIter as any) {
              // Extract parts from the chunk
              const candidates = chunk?.candidates || [];
              for (const candidate of candidates) {
                const content = candidate?.content;
                if (content?.parts) {
                  for (const part of content.parts) {
                    // Check if this part is a thought (p.thought is boolean marker)
                    if (part.thought === true && part.text) {
                      const thinkText = typeof part.text === 'string' ? part.text : '';
                      if (thinkText) {
                        controller.enqueue(textEncoder.encode('__THINKING_START__'));
                        controller.enqueue(textEncoder.encode(thinkText));
                        controller.enqueue(textEncoder.encode('__THINKING_END__'));
                        yielded = true;
                      }
                    }
                    // Regular text content (not a thought)
                    else if (part.text && !part.thought) {
                      const textContent = typeof part.text === 'string' ? part.text : '';
                      if (textContent) {
                        controller.enqueue(textEncoder.encode(textContent));
                        yielded = true;
                      }
                    }
                  }
                }
              }
            }
          } catch {
            // fall through to non-streaming fallback
          }

          // Fallback: non-streaming
          if (!yielded) {
            try {
              const res3: any = await (ai as any).models.generateContent({
                model,
                config,
                contents,
              });
              const txt = (res3?.response?.text || res3?.text || '').toString();
              if (txt) {
                controller.enqueue(textEncoder.encode(txt));
                yielded = true;
              }
            } catch {
              // still nothing
            }
          }
        } catch (_e: any) {
          // Close gracefully on error/abort
        } finally {
          try {
            controller.close();
          } catch {}
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (e) {
    return jsonError(500, 'Unexpected server error');
  }
}
