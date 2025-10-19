'use client';

import './chat.css';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { rtdb } from '@/lib/firebase';
import { ref, push, set, onValue, update, remove, get } from 'firebase/database';
import {
  FiPlus,
  FiSend,
  FiTrash2,
  FiMenu,
  FiX,
  FiEdit2,
  FiMessageSquare,
  FiCopy,
  FiCheck,
  FiArrowLeft,
  FiDatabase,
} from 'react-icons/fi';
import Loader from '@/components/Loader';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import RAGInterface from '@/components/Chat/RAGInterface';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  thinking?: string; // Model's thought process (only for pro models)
  ragResponse?: any; // RAG response data
  isRAGQuery?: boolean; // Whether this was a RAG query (RAG provided final answer)
  isRAGNotFound?: boolean; // Whether this is a RAG "not found" indicator message
  isSearchingRAG?: boolean; // Indicates the AI is currently searching RAG
}

interface Chat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

export default function ChatPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [forceLoaded, setForceLoaded] = useState(false);

  // Backup timeout to prevent infinite loading
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (authLoading) {
        console.warn('Chat page loading timeout - forcing load');
        setForceLoaded(true);
      }
    }, 8000); // 8 second timeout

    return () => clearTimeout(timeout);
  }, [authLoading]);

  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSearchingRAG, setIsSearchingRAG] = useState(false); // This will track RAG search specifically
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedModel, setSelectedModel] =
    useState<'gemini-2.5-flash' | 'gemini-2.5-pro'>('gemini-2.5-flash');
  const [thinkingEnabled, setThinkingEnabled] = useState(true);
  const [ragEnabled, setRAGEnabled] = useState(false);
  const [ragStatus, setRAGStatus] = useState<any>(null);
  const [ragAutoEnabled, setRAGAutoEnabled] = useState(false);

  // Auto-enable RAG when it becomes ready (only once)
  useEffect(() => {
    if (ragStatus?.status === 'ready' && !ragEnabled && !ragAutoEnabled) {
      setRAGEnabled(true);
      setRAGAutoEnabled(true);
    }
  }, [ragStatus?.status, ragEnabled, ragAutoEnabled]);

  // Trigger RAG rebuild
  const triggerRebuild = async () => {
    try {
      const response = await fetch('/api/rag/build', {
        method: 'POST',
        credentials: 'include'
      });

      if (!response.ok) {
        console.error('Failed to start RAG rebuild');
      }
    } catch (error) {
      console.error('Error starting RAG rebuild:', error);
    }
  };

  // Auto-enable thinking when model is changed to pro
  useEffect(() => {
    if (selectedModel === 'gemini-2.5-pro') {
      setThinkingEnabled(true);
    }
  }, [selectedModel]);
  const [thinkingDropdownOpen, setThinkingDropdownOpen] = useState<number | null>(null);
  const userToggledDropdownRef = useRef(false);
  const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null);
  const [hasApiKey, setHasApiKey] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  // Scroll to bottom button state
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isUserScrolling, setIsUserScrolling] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if ((!authLoading || forceLoaded) && !user) {
      router.push('/');
    }
  }, [user, authLoading, forceLoaded, router]);

  // Check if user has API key
  useEffect(() => {
    if (!user) return;

    const checkApiKey = async () => {
      try {
        const snap = await get(ref(rtdb, `users/${user.uid}/settings/ai/apiKey`));
        setHasApiKey(snap.exists() && !!snap.val());
      } catch {
        setHasApiKey(false);
      }
    };

    checkApiKey();
  }, [user]);

  // Load chats from Firebase
  useEffect(() => {
    if (!user) return;

    const chatsRef = ref(rtdb, `users/${user.uid}/chats`);
    const unsubscribe = onValue(chatsRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setChats([]);
        return;
      }

      const chatList: Chat[] = Object.entries<any>(data).map(([id, chat]) => ({
        id,
        title: chat.title || 'New Chat',
        createdAt: chat.createdAt || 0,
        updatedAt: chat.updatedAt || 0,
        messages: chat.messages || [],
      }));

      chatList.sort((a, b) => b.updatedAt - a.updatedAt);
      setChats(chatList);
    });

    return () => unsubscribe();
  }, [user]);

  // Load messages when chat is selected (don’t overwrite while generating)
  useEffect(() => {
    if (!selectedChatId) {
      setMessages([]);
      return;
    }
    if (isGenerating) return;

    const selectedChat = chats.find((c) => c.id === selectedChatId);
    if (selectedChat) {
      setMessages(selectedChat.messages || []);
    }
  }, [selectedChatId, chats, isGenerating]);

  // Auto-scroll to bottom only if user is at bottom or generating
  // Auto-scroll to bottom only if user hasn't scrolled up
  useEffect(() => {
    if (!isUserScrolling) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isUserScrolling]);

  // Detect if user has scrolled up
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 100; // 100px threshold

      setShowScrollButton(!isAtBottom);
      setIsUserScrolling(!isAtBottom);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setIsUserScrolling(false);
    setShowScrollButton(false);
  };

  const createNewChat = async () => {
    if (!user) return;

    const newChatRef = push(ref(rtdb, `users/${user.uid}/chats`));
    const now = Date.now();

    await set(newChatRef, {
      title: 'New Chat',
      createdAt: now,
      updatedAt: now,
      messages: [],
    });

    setSelectedChatId(newChatRef.key);
    setMessages([]);
  };

  const deleteChat = async (chatId: string) => {
    if (!user) return;
    if (!confirm('Delete this chat?')) return;

    await remove(ref(rtdb, `users/${user.uid}/chats/${chatId}`));

    if (selectedChatId === chatId) {
      setSelectedChatId(null);
      setMessages([]);
    }
  };

  const renameChat = async (chatId: string, newTitle: string) => {
    if (!user || !newTitle.trim()) return;

    await update(ref(rtdb, `users/${user.uid}/chats/${chatId}`), {
      title: newTitle.trim(),
      updatedAt: Date.now(),
    });

    setEditingChatId(null);
    setEditingTitle('');
  };

  const sendMessage = async () => {
    if (!user || !input.trim() || isGenerating) return;

    let chatId = selectedChatId;
    const userMessageContent = input.trim();

    // 1. Create new chat if none selected
    if (!chatId) {
      const newChatRef = push(ref(rtdb, `users/${user.uid}/chats`));
      chatId = newChatRef.key!;
      const now = Date.now();

      await set(newChatRef, {
        title: userMessageContent.slice(0, 50),
        createdAt: now,
        updatedAt: now,
        messages: [],
      });
      setSelectedChatId(chatId);
    }

    const userMessage: Message = {
      role: 'user',
      content: userMessageContent,
      timestamp: Date.now(),
    };

    let currentMessages = [...messages, userMessage]; // Start with messages up to user's new message

    setMessages(currentMessages); // Optimistic UI update with user message
    setInput('');
    setIsGenerating(true);
    setIsSearchingRAG(false); // Reset RAG search state
    setIsThinking(false); // Reset thinking state

    userToggledDropdownRef.current = false; // Reset dropdown toggle state

    // Reset scroll state to enable auto-scroll for new message
    setIsUserScrolling(false);
    setShowScrollButton(false);

    // Save user message (and title if first) to Firebase
    const updateData: any = {
      messages: currentMessages, // Save up to user message
      updatedAt: Date.now(),
    };
    if (messages.length === 0) {
      updateData.title = userMessageContent.slice(0, 50);
    }
    await update(ref(rtdb, `users/${user.uid}/chats/${chatId}`), updateData);

    let ragAttempted = false;
    let ragFoundAnswer = false;
    let aiStreamingTargetIndex: number; // This will hold the index where AI streaming will occur

    // --- RAG Processing ---
    if (ragEnabled && ragStatus?.status === 'ready') {
      ragAttempted = true;
      setIsSearchingRAG(true);

      // Add a temporary "Searching in notebooks..." message
      const searchingRagMessage: Message = {
        role: 'assistant',
        content: 'Searching in notebooks...',
        timestamp: Date.now(),
        isSearchingRAG: true, // Flag for UI to show searching indicator
      };
      currentMessages = [...currentMessages, searchingRagMessage];
      setMessages(currentMessages); // Update UI with searching message
      const ragSearchingMessageIndex = currentMessages.length - 1;

      try {
        const ragResult = await fetch('/api/rag/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: userMessageContent }),
          credentials: 'include',
        });

        if (ragResult.ok) {
          const ragResponse = await ragResult.json();

          if (ragResponse.answer !== 'NOT_FOUND' && ragResponse.context_used > 0) {
            // RAG found an answer, use it directly
            ragFoundAnswer = true;
            const ragAnswerMessage: Message = {
              role: 'assistant',
              content: ragResponse.answer,
              timestamp: Date.now(),
              ragResponse: ragResponse,
              isRAGQuery: true, // Flag indicating this is a direct RAG answer
            };

            // Replace the "Searching..." message with the RAG answer
            setMessages(prev => {
              const updated = [...prev];
              updated[ragSearchingMessageIndex] = ragAnswerMessage;
              // Save final messages to database and exit
              update(ref(rtdb, `users/${user.uid}/chats/${chatId}`), {
                messages: updated,
                updatedAt: Date.now(),
              }).catch(console.error);
              return updated;
            });

            setIsGenerating(false);
            setIsSearchingRAG(false);
            setThinkingDropdownOpen(null);
            setIsThinking(false);
            return; // RAG provided the full answer, no need for AI generation
          }
        }
      } catch (ragError) {
        console.error('RAG query failed, falling back to AI:', ragError);
        // Fall through to AI generation if RAG fails (including network errors)
      } finally {
        setIsSearchingRAG(false); // Stop RAG searching indicator
      }

      // If RAG was attempted but found no answer (or failed to respond successfully)
      // Replace "Searching in notebooks..." with "Information not found..."
      const notFoundMessage: Message = {
        role: 'assistant',
        content: '*Information not found in your notebooks. Using training data from the Model*',
        timestamp: Date.now(),
        isRAGNotFound: true, // Custom flag for styling a distinct block
      };
      // We must replace the searching message with the notFoundMessage
      currentMessages = [...currentMessages]; // Ensure immutable update
      currentMessages[ragSearchingMessageIndex] = notFoundMessage;
      setMessages(currentMessages); // Update UI with "info not found" message

      // AI generation will start *after* this "info not found" message
      aiStreamingTargetIndex = currentMessages.length;

    } else {
      // RAG is not enabled, AI generation starts directly after user message
      aiStreamingTargetIndex = currentMessages.length;
    }

    // --- AI Generation ---
    // Add the AI streaming message placeholder
    const shouldIncludeThinking = selectedModel === 'gemini-2.5-pro' || thinkingEnabled;
    const aiStreamingPlaceholder: Message = {
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      ...(shouldIncludeThinking ? { thinking: '' } : {}), // Only add thinking property if enabled
    };
    currentMessages = [...currentMessages, aiStreamingPlaceholder];
    setMessages(currentMessages); // Update UI with AI placeholder

    // Set the index that streaming updates will target
    const currentMessageIndex = aiStreamingTargetIndex;

    // Open thinking dropdown immediately if enabled for this message
    if (shouldIncludeThinking) {
      setThinkingDropdownOpen(currentMessageIndex);
      setIsThinking(true); // Indicate that thinking process is active
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // Conversation history for the AI model should include the user message
      // and any prior RAG fallback message if it was generated.
      const conversationHistory = currentMessages
        .filter(m => !m.isSearchingRAG) // Don't send "Searching..." to AI
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: conversationHistory,
          model: selectedModel,
          includeThoughts: shouldIncludeThinking,
        }),
        signal: controller.signal,
        credentials: 'include',
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorMsg = errorData.error || 'Failed to get response from AI';
        setApiError(errorMsg);
        throw new Error(errorMsg);
      }
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      let assistantContent = '';
      let thinkingContent = '';
      let isInThinkingMode = false;
      let emittedFirstAssistantContent = false; // Controls when to close thinking dropdown
      let buffer = '';

      const THINK_START = '__THINKING_START__';
      const THINK_END = '__THINKING_END__';

      // Helper to update message state during streaming
      // IMPORTANT: Only update 'thinking' property if `shouldIncludeThinking` is true
      const updateStreamingMessage = (content: string, thinkingFromStream?: string) => {
        setMessages((prev) => {
          const updated = [...prev];
          if (updated[currentMessageIndex]) {
            const updatedMsg: Message = {
              ...updated[currentMessageIndex],
              content: content,
              timestamp: Date.now(),
            };
            // Only set/update the thinking property if shouldIncludeThinking is true
            if (shouldIncludeThinking) {
              updatedMsg.thinking = thinkingFromStream;
            } else {
                // Ensure thinking property is explicitly undefined if not enabled
                delete updatedMsg.thinking;
            }
            updated[currentMessageIndex] = updatedMsg;
          }
          return updated;
        });
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let processedAnythingInThisPass = true;
        while (processedAnythingInThisPass) {
          processedAnythingInThisPass = false;

          if (!isInThinkingMode) {
            const startIdx = buffer.indexOf(THINK_START);
            if (startIdx !== -1) {
              const contentBefore = buffer.slice(0, startIdx);
              if (contentBefore.length > 0) {
                assistantContent += contentBefore;
                if (!emittedFirstAssistantContent && contentBefore.trim().length > 0) {
                  emittedFirstAssistantContent = true;
                  if (!userToggledDropdownRef.current && shouldIncludeThinking) { // Only close if thinking was meant to be shown
                    setThinkingDropdownOpen(null);
                  }
                  if (shouldIncludeThinking) setIsThinking(false); // Thinking phase over if content starts
                }
              }
              buffer = buffer.slice(startIdx + THINK_START.length);
              isInThinkingMode = true;
              if (shouldIncludeThinking) setIsThinking(true); // Now truly in thinking mode
              processedAnythingInThisPass = true;
            } else {
              // No THINK_START found. Accumulate all current buffer as assistant content.
              if (buffer.length > 0) {
                assistantContent += buffer;
                if (!emittedFirstAssistantContent && buffer.trim().length > 0) {
                  emittedFirstAssistantContent = true;
                  if (!userToggledDropdownRef.current && shouldIncludeThinking) { // Only close if thinking was meant to be shown
                    setThinkingDropdownOpen(null);
                  }
                  if (shouldIncludeThinking) setIsThinking(false);
                }
                buffer = '';
                processedAnythingInThisPass = true;
              }
            }
          } else { // isInThinkingMode
            const endIdx = buffer.indexOf(THINK_END);
            if (endIdx !== -1) {
              thinkingContent += buffer.slice(0, endIdx);
              buffer = buffer.slice(endIdx + THINK_END.length);
              isInThinkingMode = false;
              if (shouldIncludeThinking) setIsThinking(false); // Thinking phase is over
              processedAnythingInThisPass = true;
            } else {
              // No THINK_END found. Accumulate all current buffer as thinking content.
              if (buffer.length > 0) {
                thinkingContent += buffer;
                buffer = '';
                processedAnythingInThisPass = true;
              }
            }
          }
        }
        updateStreamingMessage(assistantContent, thinkingContent);
      }

      // Handle any remaining buffer content after the stream closes
      if (buffer.length > 0) {
        if (!isInThinkingMode) {
          assistantContent += buffer;
          if (!emittedFirstAssistantContent && assistantContent.trim().length > 0) {
            emittedFirstAssistantContent = true;
            if (!userToggledDropdownRef.current && shouldIncludeThinking) {
              setThinkingDropdownOpen(null);
            }
          }
        } else {
          thinkingContent += buffer;
        }
        buffer = '';
        updateStreamingMessage(assistantContent, thinkingContent);
      }

      // Final state adjustments after streaming completes
      setIsGenerating(false);
      if (shouldIncludeThinking) setIsThinking(false); // Only set if thinking was active
      if (!userToggledDropdownRef.current && emittedFirstAssistantContent) {
        setThinkingDropdownOpen(null);
      } else if (!userToggledDropdownRef.current && !emittedFirstAssistantContent && !shouldIncludeThinking) {
        // If no content, no thinking content, and thinking wasn't enabled at all, close dropdown
        setThinkingDropdownOpen(null);
      }


      // Construct the final message for database persistence
      const finalContent = assistantContent.trim().length > 0 ? assistantContent : '_No response generated._';
      const finalThinkingContent = thinkingContent;

      const finalMsg: Message = {
        role: 'assistant',
        content: finalContent,
        ...(shouldIncludeThinking ? { thinking: finalThinkingContent } : {}),
        timestamp: Date.now(),
      };

      setMessages(prev => {
        const updated = [...prev];
        updated[currentMessageIndex] = finalMsg;

        update(ref(rtdb, `users/${user.uid}/chats/${chatId!}`), {
          messages: updated,
          updatedAt: Date.now(),
        }).catch(console.error);

        return updated;
      });

    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Chat error:', error);
        const errorMessage: Message = {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          timestamp: Date.now(),
          ...(shouldIncludeThinking ? { thinking: '' } : {}), // Preserve thinking UI if it was enabled
        };
        setMessages(prev => {
          const updated = [...prev];
          updated[currentMessageIndex] = errorMessage;
          // Also save to DB
          update(ref(rtdb, `users/${user?.uid}/chats/${chatId!}`), {
            messages: updated,
            updatedAt: Date.now(),
          }).catch(console.error);
          return updated;
        });
        setApiError(error.message); // Display error message
      }
    } finally {
      setIsGenerating(false);
      if (shouldIncludeThinking) setIsThinking(false); // Only set if thinking was active
      abortControllerRef.current = null;
      setThinkingDropdownOpen(null); // Ensure dropdown is closed on error/completion
    }
  };

  const stopGenerating = async () => {
    abortControllerRef.current?.abort();
    const wasThinking = isThinking;
    setIsGenerating(false);
    setIsThinking(false);
    setThinkingDropdownOpen(null);

    // Save the partial content that was generated before stopping
    if (selectedChatId && messages.length > 0) {
      try {
        const lastMessage = messages[messages.length - 1];

        // If the last message is an assistant message and has no content yet,
        // or is a RAG searching message, update it to indicate stopping.
        if (lastMessage.role === 'assistant' && (lastMessage.isSearchingRAG || !lastMessage.content?.trim())) {
          const updatedMessages = [...messages];
          updatedMessages[updatedMessages.length - 1] = {
            ...lastMessage,
            content: wasThinking
              ? '_Generation stopped during thinking phase._'
              : lastMessage.isSearchingRAG
                ? '_RAG search stopped._'
                : '_Generation stopped before response._',
            isSearchingRAG: false, // Turn off searching indicator
            // Preserve any thinking content accumulated
          };
          setMessages(updatedMessages);

          await update(ref(rtdb, `users/${user?.uid}/chats/${selectedChatId}`), {
            messages: updatedMessages,
            updatedAt: Date.now(),
          });
        } else if (lastMessage.role === 'assistant' && lastMessage.content?.trim()) {
          // If partial content was generated, just save the current state.
          await update(ref(rtdb, `users/${user?.uid}/chats/${selectedChatId}`), {
            messages: messages,
            updatedAt: Date.now(),
          });
        }
      } catch (error) {
        console.error('Error saving partial message:', error);
      }
    }
  };

  if (authLoading && !forceLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader size="xl" text="Loading..." />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div
        className={`${sidebarOpen ? 'w-64' : 'w-0'} bg-gray-900 text-white transition-all duration-300 overflow-hidden flex flex-col`}
      >
        <div className="p-4 border-b border-gray-700">
          <button
            onClick={createNewChat}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-md transition-colors"
          >
            <FiPlus size={16} />
            <span>New Chat</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {chats.map((chat) => (
            <div
              key={chat.id}
              className={`group relative px-3 py-3 cursor-pointer hover:bg-gray-800 ${selectedChatId === chat.id ? 'bg-gray-800' : ''
                }`}
              onClick={() => setSelectedChatId(chat.id)}
            >
              {editingChatId === chat.id ? (
                <input
                  type="text"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') renameChat(chat.id, editingTitle);
                    if (e.key === 'Escape') {
                      setEditingChatId(null);
                      setEditingTitle('');
                    }
                  }}
                  onBlur={() => renameChat(chat.id, editingTitle)}
                  className="w-full bg-gray-700 text-white px-2 py-1 rounded text-sm"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <>
                  <div className="text-sm truncate pr-12">{chat.title}</div>
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingChatId(chat.id);
                        setEditingTitle(chat.title);
                      }}
                      className="p-1 hover:bg-gray-700 rounded"
                      title="Rename"
                    >
                      <FiEdit2 size={14} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteChat(chat.id);
                      }}
                      className="p-1 hover:bg-gray-700 rounded text-red-400"
                      title="Delete"
                    >
                      <FiTrash2 size={14} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/notebooks')}
              className="p-2 hover:bg-gray-100 rounded-md"
              title="Back to Notebooks"
            >
              <FiArrowLeft size={20} />
            </button>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-gray-100 rounded-md"
            >
              {sidebarOpen ? <FiX size={20} /> : <FiMenu size={20} />}
            </button>
            <h1 className="text-lg font-semibold text-gray-900">AI Chat</h1>
          </div>

          <div className="flex items-center gap-4">
            {/* RAG Toggle */}
            <div className="flex items-center gap-2">
              <FiDatabase className="h-4 w-4 text-gray-600" />
              <span className="text-sm text-gray-600">RAG</span>
              <button
                type="button"
                role="switch"
                aria-checked={ragEnabled}
                onClick={() => setRAGEnabled(!ragEnabled)}
                disabled={isGenerating}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${ragEnabled ? 'bg-green-600' : 'bg-gray-300'} cursor-pointer`}
                title="Toggle RAG (Retrieval Augmented Generation)"
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${ragEnabled ? 'translate-x-4' : 'translate-x-1'}`}
                />
              </button>

              {/* Quick Rebuild Button */}
              <button
                onClick={triggerRebuild}
                disabled={isGenerating}
                className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
                title="Rebuild Knowledge Base"
              >
                Rebuild
              </button>
            </div>

            {/* Model Switcher */}
            <select
              value={selectedModel}
              onChange={(e) =>
                setSelectedModel(e.target.value as 'gemini-2.5-flash' | 'gemini-2.5-pro')
              }
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={isGenerating}
            >
              <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
              <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
            </select>

            {/* Thinking Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Thinking</span>
              <button
                type="button"
                role="switch"
                aria-checked={selectedModel === 'gemini-2.5-pro' ? true : thinkingEnabled}
                onClick={() => {
                  if (selectedModel === 'gemini-2.5-pro') return; // Pro model always includes thoughts
                  setThinkingEnabled(!thinkingEnabled);
                }}
                disabled={isGenerating || selectedModel === 'gemini-2.5-pro'}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${selectedModel === 'gemini-2.5-pro' || thinkingEnabled ? 'bg-indigo-600' : 'bg-gray-300'
                  } ${selectedModel === 'gemini-2.5-pro' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                  }`}
                title={
                  selectedModel === 'gemini-2.5-pro'
                    ? 'Pro model always includes thinking'
                    : 'Toggle thinking mode'
                }
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${selectedModel === 'gemini-2.5-pro' || thinkingEnabled ? 'translate-x-4' : 'translate-x-1'
                    }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-4 py-6 relative">
          {/* RAG Interface */}
          <div className="max-w-3xl mx-auto mb-6">
            <RAGInterface
              onRAGResponse={(response) => setRAGStatus(response)}
            />
          </div>

          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-500">
              <div className="text-center">
                <FiMessageSquare size={48} className="mx-auto mb-4 text-gray-400" />
                <p className="text-lg">Start a conversation</p>
                <p className="text-sm mt-2">Ask me anything!</p>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] ${msg.role === 'user' ? 'bg-indigo-600 text-white px-4 py-3 rounded-lg' : 'space-y-2'
                      }`}
                  >
                    {msg.role === 'user' ? (
                      <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                    ) : (
                      <>
                        {/* 1. RAG "Information not found" block (if applicable) */}
                        {/* If this is a RAG Not Found message, render only this block and nothing else for this message object. */}
                        {msg.isRAGNotFound ? (
                          <div className="bg-orange-50 border border-orange-200 text-orange-800 rounded-lg px-4 py-3 text-sm mb-2">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          // Else (it's a regular AI response or RAG answer/search)
                          <>
                            {/* 2. Conditionally render the AI's thinking process block */}
                            {/* This should ONLY appear if thinking is enabled for this AI message, and it's not a RAG status/answer */}
                            {msg.thinking !== undefined && !msg.isRAGQuery && !msg.isSearchingRAG && (
                              <details
                                open={thinkingDropdownOpen === idx}
                                className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg overflow-hidden mb-2" // mb-2 for spacing from content below
                              >
                                <summary
                                  className="flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:bg-purple-100/50 transition-colors select-none"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    userToggledDropdownRef.current = true;
                                    setThinkingDropdownOpen(
                                      thinkingDropdownOpen === idx ? null : idx
                                    );
                                  }}
                                >
                                  <span className="text-base">💭</span>
                                  <span className="text-sm font-medium text-purple-900">
                                    {idx === messages.length - 1 && isThinking
                                      ? 'Thinking...' // Show "Thinking..." animated in summary if actively thinking
                                      : 'View thinking process'}
                                  </span>
                                  <span className="ml-auto text-xs text-purple-600">
                                    {thinkingDropdownOpen === idx ? '▲' : '▼'}
                                  </span>
                                </summary>
                                <div className="px-4 py-3 bg-white/80 border-t border-purple-200 chat-message">
                                  {msg.thinking ? (
                                    <div className="prose prose-sm max-w-none text-sm text-gray-700">
                                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {msg.thinking}
                                      </ReactMarkdown>
                                    </div>
                                  ) : idx === messages.length - 1 && isThinking ? (
                                    <div className="flex items-center gap-2 text-gray-500">
                                      <div className="flex gap-1">
                                        <div
                                          className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"
                                          style={{ animationDelay: '0ms' }}
                                        />
                                        <div
                                          className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"
                                          style={{ animationDelay: '150ms' }}
                                        />
                                        <div
                                          className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"
                                          style={{ animationDelay: '300ms' }}
                                        />
                                      </div>
                                      <span className="text-sm">Processing thoughts...</span>
                                    </div>
                                  ) : null}
                                </div>
                              </details>
                            )}

                            {/* 3. Main Assistant Response/Status Box */}
                            {/* This should render if it's a RAG search, RAG query, or any AI content/loading. */}
                            {/* It should NOT render if it's solely an isRAGNotFound message (as that's handled above). */}
                            { (msg.isSearchingRAG || msg.isRAGQuery || (msg.content && msg.content.trim()) || (idx === messages.length - 1 && isGenerating)) && (
                              <div className={`text-gray-900 border rounded-lg chat-message ${msg.isRAGQuery ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
                                {/* RAG indicator for direct RAG answers */}
                                {msg.isRAGQuery && (
                                  <div className="px-4 py-2 bg-green-100 border-b border-green-200 flex items-center gap-2">
                                    <FiDatabase className="h-4 w-4 text-green-600" />
                                    <span className="text-sm font-medium text-green-800">
                                      Knowledge Base Response
                                    </span>
                                    {msg.ragResponse?.context_used && (
                                      <span className="text-xs text-green-600">
                                        ({msg.ragResponse.context_used} sources)
                                      </span>
                                    )}
                                  </div>
                                )}

                                <div className="px-4 py-3">
                                  {msg.content ? (
                                    <>
                                      <div className="prose prose-sm max-w-none">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                          {msg.content}
                                        </ReactMarkdown>
                                      </div>

                                      {/* RAG sources (only for direct RAG answers) */}
                                      {msg.isRAGQuery && msg.ragResponse?.matches && msg.ragResponse.matches.length > 0 && (
                                        <div className="mt-4 pt-3 border-t border-green-200">
                                          <div className="text-sm font-medium text-green-800 mb-2">Sources:</div>
                                          <div className="space-y-2">
                                            {msg.ragResponse.matches.map((match: any, i: number) => (
                                              <div key={i} className="bg-white border border-green-200 rounded p-2">
                                                <div className="text-xs font-medium text-green-700 mb-1">
                                                  📄 {match.page_name} (Score: {match.score?.toFixed(3)})
                                                </div>
                                                <div className="text-xs text-gray-600">
                                                  {match.text_preview}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {/* Copy button (only for final content, not status messages) */}
                                      {(!msg.isSearchingRAG && !msg.isRAGNotFound) && (
                                        <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-end">
                                          <button
                                            onClick={async () => {
                                              try {
                                                await navigator.clipboard.writeText(msg.content);
                                                setCopiedMessageId(idx);
                                                setTimeout(() => setCopiedMessageId(null), 2000);
                                              } catch (err) {
                                                console.error('Failed to copy:', err);
                                              }
                                            }}
                                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md hover:bg-gray-100 transition-colors text-gray-600"
                                            title="Copy as markdown"
                                          >
                                            {copiedMessageId === idx ? (
                                              <>
                                                <FiCheck size={14} className="text-green-600" />
                                                <span className="text-green-600">Copied!</span>
                                              </>
                                            ) : (
                                              <>
                                                <FiCopy size={14} />
                                                <span>Copy</span>
                                              </>
                                            )}
                                          </button>
                                        </div>
                                      )}
                                    </>
                                  ) : ( // If no content yet, show loading indicator for the last generating message
                                    (idx === messages.length - 1 && isGenerating) && (
                                      <div className="flex items-center gap-2 text-gray-500">
                                        <div className="flex gap-1">
                                          <div
                                            className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                                            style={{ animationDelay: '0ms' }}
                                          />
                                          <div
                                            className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                                            style={{ animationDelay: '150ms' }}
                                          />
                                          <div
                                            className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                                            style={{ animationDelay: '300ms' }}
                                          />
                                        </div>
                                        <span className="text-sm">
                                          {msg.isSearchingRAG ? 'Searching in notebooks...' :
                                           (msg.thinking !== undefined && isThinking) // If thinking is enabled for this message AND currently active thinking state
                                            ? 'Awaiting response content...' // Generic, as 'Thinking...' is in the details box
                                            : 'Waiting for response...'} {/* If thinking is NOT enabled, or not active */}
                                        </span>
                                      </div>
                                    )
                                  )}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}

              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Scroll to bottom button */}
          <button
            onClick={scrollToBottom}
            className={`fixed bottom-24 right-8 bg-indigo-600 text-white p-3 rounded-full shadow-lg hover:bg-indigo-700 transition-all duration-300 z-10 ${showScrollButton ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
              }`}
            title="Scroll to bottom"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        </div>

        {/* Input */}
        <div className="bg-white border-t border-gray-200 px-4 py-4">
          <div className="max-w-3xl mx-auto">
            {/* Error */}
            {apiError && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
                <span className="flex-1">{apiError}</span>
                <button onClick={() => setApiError(null)} className="text-red-500 hover:text-red-700">
                  <FiX size={16} />
                </button>
              </div>
            )}

            {/* No API key */}
            {!hasApiKey && (
              <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
                Please add your Google AI Studio API key in{' '}
                <a href="/account" className="underline font-medium">
                  Account Settings
                </a>{' '}
                to use chat.
              </div>
            )}

            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  if (apiError) setApiError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (hasApiKey) sendMessage();
                  }
                }}
                placeholder={
                  hasApiKey ? 'Type your message...' : 'Add API key in Account Settings to chat'
                }
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                rows={1}
                disabled={isGenerating || !hasApiKey}
              />
              {isGenerating ? (
                <button
                  onClick={stopGenerating}
                  className="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Stop
                </button>
              ) : (
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || !hasApiKey}
                  className="px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title={!hasApiKey ? 'Add API key in Account Settings' : 'Send message'}
                >
                  <FiSend size={20} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}