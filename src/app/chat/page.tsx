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
} from 'react-icons/fi';
import Loader from '@/components/Loader';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  thinking?: string; // Model's thought process (only for pro models)
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

  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedModel, setSelectedModel] =
    useState<'gemini-2.5-flash' | 'gemini-2.5-pro'>('gemini-2.5-flash');
  const [thinkingEnabled, setThinkingEnabled] = useState(true);
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
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [user, authLoading, router]);

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
  useEffect(() => {
    if (!isUserScrolling || isGenerating) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isUserScrolling, isGenerating]);

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

    // Create new chat if none selected
    if (!chatId) {
      const newChatRef = push(ref(rtdb, `users/${user.uid}/chats`));
      chatId = newChatRef.key!;
      const now = Date.now();

      await set(newChatRef, {
        title: input.slice(0, 50),
        createdAt: now,
        updatedAt: now,
        messages: [],
      });

      setSelectedChatId(chatId);
    }

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    const updatedMessages = [...messages, userMessage];

    // Assistant placeholder (thinking box visible immediately)
    const assistantMessage: Message = {
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      thinking: '',
    };

    const messagesWithAssistant = [...updatedMessages, assistantMessage];
    const newMessageIndex = messagesWithAssistant.length - 1;

    setMessages(messagesWithAssistant);
    setInput('');
    setIsGenerating(true);
    setIsThinking(true);

    userToggledDropdownRef.current = false;
    setThinkingDropdownOpen(newMessageIndex);

    // Save user message (and title if first)
    const updateData: any = {
      messages: updatedMessages,
      updatedAt: Date.now(),
    };
    if (messages.length === 0) {
      updateData.title = input.trim().slice(0, 50);
    }
    await update(ref(rtdb, `users/${user.uid}/chats/${chatId}`), updateData);

    // Call API
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const conversationHistory = updatedMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: conversationHistory,
          model: selectedModel,
          includeThoughts: thinkingEnabled, // your API should wrap thoughts with markers
        }),
        signal: controller.signal,
        credentials: 'include',
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorMsg = errorData.error || 'Failed to get response';
        setApiError(errorMsg);
        throw new Error(errorMsg);
      }
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      // ---- Stream state (CHUNK-SAFE) ----
      let assistantContent = '';
      let thinkingContent = '';
      let isInThinkingMode = false;
      let emittedFinalToken = false;
      let buffer = '';

      // Keep dropdown open while thinking and until first real content arrives
      setThinkingDropdownOpen(newMessageIndex);
      setIsThinking(true);

      const THINK_START = '__THINKING_START__';
      const THINK_END = '__THINKING_END__';

      const flushUi = () => {
        const updatedMsg: Message = {
          ...assistantMessage,
          content: assistantContent,
          thinking: thinkingContent ?? '',
          timestamp: Date.now(),
        };
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = updatedMsg;
          return updated;
        });
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process buffer for markers robustly; leave partial markers in buffer
        // Loop until we can’t find a full marker pair transition.
        // We only close the dropdown when we *actually* emit non-thinking text.
        // 1) If not in thinking mode, look for THINK_START.
        // 2) If in thinking mode, look for THINK_END.
        let progressed = true;
        while (progressed) {
          progressed = false;

          if (!isInThinkingMode) {
            const startIdx = buffer.indexOf(THINK_START);
            if (startIdx !== -1) {
              // Discard preamble (do NOT treat as final content; avoids early close)
              buffer = buffer.slice(startIdx + THINK_START.length);
              isInThinkingMode = true;

              if (!userToggledDropdownRef.current) {
                setThinkingDropdownOpen(newMessageIndex);
              }
              setIsThinking(true);
              progressed = true;
              continue;
            }

            // No start marker: we *might* have real content, but it could be partial marker.
            // Keep a short sentinel to prevent cutting a split marker.
            const sentinel = Math.max(
              buffer.lastIndexOf('__THINKING_STA'),
              buffer.lastIndexOf('__THINKING_EN'),
              buffer.lastIndexOf('__THINKING_'),
              buffer.lastIndexOf('__THINKING'),
              buffer.lastIndexOf('__THINK'),
              buffer.lastIndexOf('__THI'),
              buffer.lastIndexOf('__T'),
            );
            const safeLen = sentinel >= 0 ? sentinel : buffer.length;

            if (safeLen > 0) {
              const safeText = buffer.slice(0, safeLen);
              // This is actual answer content.
              assistantContent += safeText;
              buffer = buffer.slice(safeLen);

              if (!emittedFinalToken && safeText.trim().length > 0) {
                emittedFinalToken = true;
                if (!userToggledDropdownRef.current) {
                  setThinkingDropdownOpen(null); // close when answer truly starts
                }
                setIsThinking(false);
              }

              progressed = true;
              continue;
            }
          } else {
            // In thinking mode: look for end marker
            const endIdx = buffer.indexOf(THINK_END);
            if (endIdx !== -1) {
              // Append thinking up to end marker
              thinkingContent += buffer.slice(0, endIdx);
              buffer = buffer.slice(endIdx + THINK_END.length);
              isInThinkingMode = false;
              setIsThinking(false);

              // Do NOT close dropdown yet; wait until we see the first real content
              progressed = true;
              continue;
            }

            // No end marker: everything currently in buffer is thinking
            if (buffer.length > 0) {
              thinkingContent += buffer;
              buffer = '';
              progressed = false;
            }
          }
        }

        // Push live UI after each read
        flushUi();
      }

      // Flush any trailing non-thinking buffer (final answer tail)
      if (!isInThinkingMode && buffer.length > 0) {
        assistantContent += buffer;
        buffer = '';
        if (!emittedFinalToken && assistantContent.trim().length > 0) {
          emittedFinalToken = true;
          if (!userToggledDropdownRef.current) {
            setThinkingDropdownOpen(null);
          }
        }
      }

      // Final UI update
      setIsThinking(false);
      if (!userToggledDropdownRef.current && emittedFinalToken) {
        setThinkingDropdownOpen(null);
      }
      flushUi();

      // Persist the full message
      const finalMsg: Message = {
        ...assistantMessage,
        content: assistantContent,
        thinking: thinkingContent || undefined,
        timestamp: Date.now(),
      };
      const finalMessages = [...updatedMessages, finalMsg];

      await update(ref(rtdb, `users/${user.uid}/chats/${chatId!}`), {
        messages: finalMessages,
        updatedAt: Date.now(),
      });
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Chat error:', error);
        const errorMessage: Message = {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          timestamp: Date.now(),
        };
        const withError = [...updatedMessages, errorMessage];
        setMessages(withError);

        await update(ref(rtdb, `users/${user.uid}/chats/${chatId!}`), {
          messages: withError,
          updatedAt: Date.now(),
        });
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const stopGenerating = () => {
    abortControllerRef.current?.abort();
    setIsGenerating(false);
  };

  if (authLoading) {
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
                aria-checked={thinkingEnabled}
                onClick={() => {
                  if (selectedModel === 'gemini-2.5-pro') return; // Pro always includes thoughts
                  setThinkingEnabled(!thinkingEnabled);
                }}
                disabled={isGenerating}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${thinkingEnabled ? 'bg-indigo-600' : 'bg-gray-300'
                  } ${selectedModel === 'gemini-2.5-pro' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                  }`}
                title={
                  selectedModel === 'gemini-2.5-pro'
                    ? 'Pro model always includes thinking'
                    : 'Toggle thinking mode'
                }
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${thinkingEnabled ? 'translate-x-4' : 'translate-x-1'
                    }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-4 py-6 relative">
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
                        {/* Thinking (collapsible) */}
                        {msg.thinking !== undefined && (
                          <details
                            open={thinkingDropdownOpen === idx}
                            className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg overflow-hidden"
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
                                  ? 'Thinking...'
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

                        {/* Assistant response */}
                        <div className="bg-white text-gray-900 border border-gray-200 rounded-lg chat-message">
                          <div className="px-4 py-3">
                            {msg.content ? (
                              <>
                                <div className="prose prose-sm max-w-none">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {msg.content}
                                  </ReactMarkdown>
                                </div>

                                {/* Copy button */}
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
                              </>
                            ) : idx === messages.length - 1 && isGenerating ? (
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
                                <span className="text-sm">Waiting for response...</span>
                              </div>
                            ) : null}
                          </div>
                        </div>
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
