import { Suspense, lazy, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

/* The floating JARVIS button and its panel.
 *
 * Mounted once in the app shell rather than per page, so the assistant is
 * reachable everywhere and a conversation survives navigation. The panel
 * itself is still lazy — a visitor who never opens it never downloads it.
 *
 * The home page has its own "Ask JARVIS about my work" button in the hero; it
 * opens this same panel through the `jarvis:open` window event rather than
 * holding a second copy of the state. */

const ChatPanel = lazy(() => import('@/features/chat/components/ChatPanel'));

/** Routes that own the whole viewport and must not have a button over them. */
const HIDDEN_ON = ['/notes/new'];
const HIDDEN_SUFFIX = '/edit';

export default function ChatLauncher() {
  const [open, setOpen] = useState(false);
  const [touched, setTouched] = useState(false);   // has the panel ever opened?
  const { pathname } = useLocation();

  useEffect(() => {
    const openIt = () => { setOpen(true); setTouched(true); };
    window.addEventListener('jarvis:open', openIt);
    return () => window.removeEventListener('jarvis:open', openIt);
  }, []);

  const hidden = HIDDEN_ON.includes(pathname) || pathname.endsWith(HIDDEN_SUFFIX);
  if (hidden) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => { setOpen(true); setTouched(true); }}
          aria-label="Ask JARVIS"
          className="fixed bottom-6 right-6 z-[75] inline-flex items-center gap-2 rounded-full border border-line px-4 py-3 text-[13px] font-medium text-fg shadow-lg transition-transform hover:scale-[1.03]"
          style={{
            background: 'var(--surf)',
            backdropFilter: 'blur(14px) saturate(160%)',
            WebkitBackdropFilter: 'blur(14px) saturate(160%)',
            boxShadow: 'var(--glass-shadow)',
          }}
        >
          <Sparkles className="h-4 w-4 text-a" strokeWidth={1.9} />
          <span className="hidden sm:inline">Ask JARVIS</span>
        </button>
      )}

      {/* Keep the panel mounted once opened so the transcript is not lost when
          it is closed and reopened, or when the route changes. */}
      {touched && (
        <Suspense fallback={null}>
          <ChatPanel open={open} onOpenChange={setOpen} />
        </Suspense>
      )}
    </>
  );
}
