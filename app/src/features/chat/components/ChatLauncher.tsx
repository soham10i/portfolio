import { Suspense, lazy, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import '@/features/story/story.css';
import JarvisOrb from '@/features/chat/components/JarvisOrb';

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
  /* The home page docks its own JARVIS button in the bottom bar (it fires the
     same `jarvis:open` event), so the floating one would sit on top of it. */
  const docked = pathname === '/';

  return (
    <>
      {!open && !docked && (
        <div className="jarvis fixed bottom-5 right-5 z-[75]">
          <button
            type="button"
            onClick={() => { setOpen(true); setTouched(true); }}
            aria-label="Ask Nexus"
            className="lg-pill lg-chrome flex h-12 items-center gap-2.5 pl-1.5 pr-1.5 text-[13.5px] font-medium transition-transform duration-300 hover:-translate-y-0.5 sm:pr-4"
          >
            <JarvisOrb size={36} />
            <span className="hidden sm:inline">Ask Nexus</span>
          </button>
        </div>
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
