import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Sparkles, AlertCircle, Maximize2, Minimize2 } from 'lucide-react';
import { lenis } from '@/lib/lenis';
import type { ChatMessage } from '@/types';
import MarkdownText from '@/components/MarkdownText';

const API_URL = import.meta.env.VITE_API_URL || '';

const SUGGESTED = [
  "What projects has Soham built?",
  "Tell me about the Digital Twin project",
  "What are Soham's top skills?",
  "How can I contact Soham?",
];

const WELCOME: ChatMessage = {
  id: 'welcome', role: 'assistant',
  content: "Hey! I'm JARVIS — Soham's LLM-based personal assistant. Ask me anything: projects, skills, whether he can actually center a div. I come with facts, wit, and zero corporate fluff. ⚡",
  timestamp: Date.now(),
};


// ─── Component ───────────────────────────────────────────────────

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // Maximized covers the viewport, so freeze the page behind it. Docked
  // stays scrollable — you may want to move the page around the panel.
  useEffect(() => {
    if (!isOpen || !isMaximized) return;
    lenis.stop();
    return () => lenis.start();
  }, [isOpen, isMaximized]);

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    setError(null);
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim(),
      timestamp: Date.now()
    };

    setMessages((p) => [...p, userMsg]);
    setInput('');
    setIsLoading(true);

    // Exclude the canned welcome and any error bubbles — they aren't real
    // conversation turns and would confuse the model if replayed.
    const payload = JSON.stringify({
      message: content.trim(),
      history: messages
        .filter(m => m.id !== 'welcome' && !m.id.startsWith('err-'))
        .map(m => ({ role: m.role, content: m.content })),
    });

    const assistantId = `${Date.now() + 1}`;
    const appendAssistant = (text: string) => {
      setMessages((p) => {
        const existing = p.find((m) => m.id === assistantId);
        if (!existing) {
          return [...p, { id: assistantId, role: 'assistant' as const, content: text, timestamp: Date.now() }];
        }
        return p.map((m) => (m.id === assistantId ? { ...m, content: m.content + text } : m));
      });
    };

    try {
      // Streaming first — tokens render as they generate
      const streamRes = await fetch(`${API_URL}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });

      if (streamRes.ok && streamRes.body) {
        const reader = streamRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let streamError: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            try {
              const event = JSON.parse(line.slice(5).trim());
              if (event.delta) {
                setIsLoading(false);
                appendAssistant(event.delta);
              }
              if (event.error) streamError = event.error;
            } catch { /* skip malformed frame */ }
          }
        }
        if (streamError) throw new Error(streamError);
        return;
      }

      // Fallback: non-streaming endpoint
      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server error: ${response.status}`);
      }

      const data = await response.json();
      appendAssistant(data.response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(msg);
      setMessages((p) => [...p, {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `Sorry, I'm having trouble connecting right now. (${msg})`,
        timestamp: Date.now(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = () => sendMessage(input);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleSuggested = (q: string) => {
    setInput(q);
    sendMessage(q);
  };

  // Never mix inset-x-* with left-*/right-*: the shorthand sets BOTH
  // sides, so it fights the single-side utility and the panel jumps.
  const panelClasses = isMaximized
    ? 'fixed inset-3 sm:inset-6'
    : 'fixed bottom-24 left-3 right-3 h-[65vh] max-h-[560px] sm:left-auto sm:right-6 sm:w-[440px] md:w-[480px] sm:h-[70vh] sm:max-h-[640px]';

  return (
    <>
      {/* Floating Chat Button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Close JARVIS assistant' : 'Open JARVIS assistant'}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 hover:scale-105 transition-all"
        whileTap={{ scale: 0.95 }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 2, type: 'spring' }}
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
              <X className="w-5 h-5" />
            </motion.div>
          ) : (
            <motion.div key="open" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}>
              <Sparkles className="w-5 h-5" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className={`z-50 glass rounded-2xl flex flex-col overflow-hidden origin-bottom-right ${panelClasses}`}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--glass-hairline)] glass-tint flex-shrink-0">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold tracking-wide">JARVIS</p>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 truncate">
                  <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                  </span>
                  LLM-based personal assistant · Gemini
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsMaximized(!isMaximized)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                  title={isMaximized ? 'Minimize' : 'Maximize'}
                  aria-label={isMaximized ? 'Minimize chat window' : 'Maximize chat window'}
                >
                  {isMaximized ? (
                    <Minimize2 className="w-3.5 h-3.5" />
                  ) : (
                    <Maximize2 className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  onClick={() => setMessages([WELCOME])}
                  className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-muted/30 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Messages */}
            {/* data-lenis-prevent: Lenis swallows wheel/touch globally and
                scrolls the window, so without this the page scrolls instead
                of the chat. overscroll-contain stops scroll chaining to the
                page once the list hits its top/bottom. */}
            <div data-lenis-prevent className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
              {messages.map((msg, idx) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx === messages.length - 1 ? 0 : 0 }}
                  className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold ${
                    msg.role === 'assistant'
                      ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white'
                      : 'bg-muted text-foreground'
                  }`}>
                    {msg.role === 'assistant' ? 'S' : 'You'}
                  </div>
                  <div className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'assistant'
                      ? 'glass-tint border border-[var(--glass-hairline)] text-foreground rounded-tl-sm'
                      : 'bg-foreground text-background rounded-tr-sm'
                  }`}>
                    {msg.role === 'assistant' ? (
                      <MarkdownText text={msg.content} />
                    ) : (
                      msg.content
                    )}
                  </div>
                </motion.div>
              ))}

              {/* Loading indicator */}
              {isLoading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-3"
                >
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                    <Sparkles className="w-3 h-3 text-white animate-pulse" />
                  </div>
                  <div className="px-3.5 py-2.5 rounded-2xl glass-tint border border-[var(--glass-hairline)] rounded-tl-sm">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Error indicator */}
              {error && !isLoading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 text-red-700 dark:text-red-400 text-xs"
                >
                  <AlertCircle className="w-3 h-3" />
                  {error}
                </motion.div>
              )}

              {/* Suggested questions */}
              {messages.length === 1 && !isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="pt-2"
                >
                  <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wider">Try asking</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SUGGESTED.map((q) => (
                      <button
                        key={q}
                        onClick={() => handleSuggested(q)}
                        className="text-xs px-3 py-1.5 rounded-full glass-tint text-muted-foreground hover:text-foreground border border-[var(--glass-hairline)] transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-4 py-3 border-t border-[var(--glass-hairline)] glass-tint flex-shrink-0">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about Soham's work..."
                  disabled={isLoading}
                  className="flex-1 px-4 py-2.5 rounded-full glass-tint border border-[var(--glass-hairline)] text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]/40 transition-all disabled:opacity-50"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  aria-label="Send message"
                  className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white hover:opacity-90 transition-all disabled:opacity-40 shadow-lg shadow-blue-500/10"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
