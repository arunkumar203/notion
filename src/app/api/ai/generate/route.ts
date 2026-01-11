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
    // Preserve existing custom suffix behavior if present previously
    const basePrompt: string = (body?.prompt || '').toString();
    if (!basePrompt) return jsonError(400, 'Missing prompt');
    const prompt = basePrompt + 'give in detail';

    // Read user's AI settings from RTDB
    const snap = await admin.database().ref(`users/${uid}/settings/ai`).get();
    const settings = (snap.exists() ? snap.val() : {}) as { apiKey?: string; model?: string; speed?: string };
    const apiKey = (settings.apiKey || '').trim();
    const model = (settings.model || 'gemini-2.5-pro').trim();
    const speed = ((settings.speed || 'normal') as string) === 'slow' ? 'slow' : 'normal';
    if (!apiKey) return jsonError(400, 'Missing Google AI Studio API key in Account > Details');

    const textEncoder = new TextEncoder();
    const ai = new GoogleGenAI({ apiKey });
    const tools = [{ googleSearch: {} }];
    const config: any = { tools };
    if (model.includes('pro')) config.thinkingConfig = { thinkingBudget: -1 };

    // Up-front validation: ensure API key and model are usable before starting the stream
    // This prevents returning a 200 with an empty/aborted stream when the key is invalid or lacks access.
    try {
      // Do a tiny non-streaming probe with minimal output to validate the key/model without consuming tokens materially.
      // If the library throws (401/403/404/429/etc.), catch and convert into a clear error for the client.
      await (ai as any).models.generateContent({
        model,
        config,
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
      });
    } catch (e: any) {
      // Extract the actual error message from Google's API response
      let errorMessage = 'AI service error';

      try {
        const errorStr = (e?.message || '').toString();

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
        errorMessage = (e?.message || 'Unknown error').toString();
      }

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

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          let yielded = false;
          // Stream using @google/genai
          try {
            const result: any = await (ai as any).models.generateContentStream({
              model,
              config,
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
            });
            const streamIter: AsyncIterable<any> = (result && result.stream) ? result.stream : (result as any);
            for await (const chunk of streamIter as any) {
              const t = typeof (chunk as any)?.text === 'function' ? (chunk as any).text() : ((chunk as any)?.text ?? '');
              const s = (t ?? '').toString();
              if (s) {
                controller.enqueue(textEncoder.encode(s));
                yielded = true;
              }
            }
          } catch {
            // fall through to non-streaming fallback
          }

          // Final fallback: non-streaming single response via @google/genai
          if (!yielded) {
            try {
              const res3: any = await (ai as any).models.generateContent({
                model,
                config,
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
              });
              const txt = (res3?.response?.text || res3?.text || '').toString();
              if (txt) { controller.enqueue(textEncoder.encode(txt)); yielded = true; }
            } catch {
              // still nothing
            }
          }
        } catch (_e: any) {
          // Close gracefully on error/abort
        } finally {
          try { controller.close(); } catch { }
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
        // Inform client to use classy animation when user selected slow mode
        'X-Mode': speed === 'slow' ? 'classy' : 'normal',
      },
    });
  } catch (e) {
    return jsonError(500, 'Unexpected server error');
  }
}
