import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Eye, KeyRound, Loader2, Trash2 } from 'lucide-react';
import { applyPalette, readStoredPalette, storePalette, type PaletteKey } from '@/shared/lib/palettes';
import PaletteMenu from '@/shared/components/PaletteMenu';
import {
  checkToken, createNote, deleteNote, fetchNote, getToken, setToken, updateNote,
} from '@/features/notes/lib/notesApi';
import { renderNote } from '@/features/notes/lib/noteRender';

/* Write / update / delete a note.
 *
 * Split pane: Markdown on the left, the rendered note on the right, re-rendered
 * on a short debounce. The preview uses the same renderer and the same
 * .note-prose stylesheet as the published page, so what you see while writing a
 * derivation is exactly what a reader gets — there is no second code path to
 * drift out of sync. */

const DEBOUNCE_MS = 400;

const STARTER = `Open with one paragraph saying what the note establishes and for whom.

## The setup

Define the notation before using it. Inline maths is written like $q(x_t \\mid x_{t-1})$,
and a display equation like this:

$$
x_t = \\sqrt{\\alpha_t}\\,x_{t-1} + \\sqrt{1 - \\alpha_t}\\,\\epsilon
$$

<div class="aside">
<strong>Reading it aloud.</strong> A short callout beside the algebra saying what the
symbols mean in words. Every non-obvious step deserves one.
</div>

## A worked example

| step | value |
|------|-------|
| 1    | 0.999 |
`;

export default function NoteEditor() {
  const { slug: editingSlug } = useParams();
  const isNew = !editingSlug;
  const navigate = useNavigate();

  const [palette, setPalette] = useState<PaletteKey>(readStoredPalette);
  useEffect(() => { applyPalette(palette); }, [palette]);
  const pickPalette = (k: PaletteKey) => { setPalette(k); storePalette(k); };

  const [token, setTokenState] = useState(getToken);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState('');

  const [slug, setSlug] = useState(editingSlug ?? '');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [topic, setTopic] = useState('Generative models');
  const [tags, setTags] = useState('');
  const [body, setBody] = useState(isNew ? STARTER : '');

  const [preview, setPreview] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(isNew);
  const [showPreview, setShowPreview] = useState(true);
  const timer = useRef<number | null>(null);

  // Verify whatever token this browser already holds, once.
  useEffect(() => {
    let dead = false;
    const t = getToken();
    if (!t) { setAuthed(false); return; }
    checkToken(t)
      .then((ok) => { if (!dead) setAuthed(ok); })
      .catch(() => { if (!dead) setAuthed(false); });
    return () => { dead = true; };
  }, []);

  // Load the note being edited
  useEffect(() => {
    if (isNew || !editingSlug) return;
    let dead = false;
    fetchNote(editingSlug)
      .then((n) => {
        if (dead) return;
        setTitle(n.title); setSummary(n.summary); setTopic(n.topic);
        setTags(n.tags.join(', ')); setBody(n.body); setLoaded(true);
      })
      .catch((e) => { if (!dead) setStatus(e instanceof Error ? e.message : 'Could not load the note.'); });
    return () => { dead = true; };
  }, [editingSlug, isNew]);

  // Debounced preview — rendering a long derivation on every keystroke is
  // wasted work and makes the textarea feel sticky.
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      renderNote(body).then(setPreview).catch(() => setPreview('<p>Renderer unavailable.</p>'));
    }, DEBOUNCE_MS);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [body]);

  const signIn = async () => {
    setAuthError('');
    const ok = await checkToken(token).catch(() => false);
    if (!ok) { setAuthError('That token was not accepted.'); return; }
    setToken(token);
    setAuthed(true);
  };

  const save = useCallback(async () => {
    setStatus(''); setSaving(true);
    try {
      if (isNew) {
        const n = await createNote({ slug, title, summary, topic, tags, body });
        navigate(`/notes/${n.slug}`);
      } else {
        await updateNote(editingSlug!, { title, summary, topic, tags, body });
        setStatus('Saved.');
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }, [isNew, slug, title, summary, topic, tags, body, editingSlug, navigate]);

  const remove = async () => {
    if (!editingSlug) return;
    if (!window.confirm(`Delete "${title}"? The Markdown file is removed from disk.`)) return;
    try {
      await deleteNote(editingSlug);
      navigate('/notes');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Delete failed.');
    }
  };

  // ── token gate ────────────────────────────────────────────────────────────
  if (authed !== true) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg px-6 text-fg">
        <div className="w-full max-w-[380px]">
          <Link to="/notes" className="inline-flex items-center gap-2 text-[13px] text-fg2 hover:text-fg">
            <ArrowLeft className="h-3.5 w-3.5" /> Notes
          </Link>
          <div className="mt-6 rounded-[16px] border border-line bg-surf p-6">
            <div className="flex items-center gap-2 text-fg">
              <KeyRound className="h-4 w-4" />
              <p className="text-[15px] font-semibold">Editing is token-gated</p>
            </div>
            <p className="mt-3 text-[13.5px] leading-relaxed text-fg2">
              Notes are Markdown files on the server. Writing one needs the value of
              <code className="mx-1 rounded bg-surf2 px-1.5 py-0.5 font-mono text-[12px]">ADMIN_TOKEN</code>
              from the backend environment. Reading needs nothing.
            </p>
            <input
              type="password" value={token} autoComplete="off"
              onChange={(e) => setTokenState(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') signIn(); }}
              placeholder="admin token"
              className="mt-4 w-full rounded-[10px] border border-line bg-surf2 px-3 py-2.5 font-mono text-[13px] text-fg outline-none placeholder:text-fg3 focus:border-p"
            />
            {authError && <p className="mt-2 text-[12.5px] text-[#f87171]">{authError}</p>}
            <button type="button" onClick={signIn}
              className="mt-3 w-full rounded-[10px] border border-line bg-surf2 py-2.5 text-[13.5px] font-medium text-fg transition-colors hover:border-p">
              Unlock
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── editor ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen flex-col bg-bg text-fg">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-2.5">
        <Link to={isNew ? '/notes' : `/notes/${editingSlug}`}
          className="inline-flex items-center gap-2 text-[13px] text-fg2 hover:text-fg">
          <ArrowLeft className="h-3.5 w-3.5" />{isNew ? 'Notes' : 'Note'}
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg3">
          {isNew ? 'New note' : `editing ${editingSlug}`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <PaletteMenu palette={palette} onPalette={pickPalette} compact />
          {status && (
            <span className={'text-[12.5px] ' + (status === 'Saved.' ? 'text-fg2' : 'text-[#f87171]')}>
              {status}
            </span>
          )}
          <button type="button" onClick={() => setShowPreview((p) => !p)}
            className="inline-flex items-center gap-1.5 rounded-[9px] border border-line px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-fg2 transition-colors hover:text-fg lg:hidden">
            <Eye className="h-3 w-3" />{showPreview ? 'Write' : 'Preview'}
          </button>
          {!isNew && (
            <button type="button" onClick={remove}
              className="inline-flex items-center gap-1.5 rounded-[9px] border border-line px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-fg3 transition-colors hover:border-[#f87171] hover:text-[#f87171]">
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          )}
          <button type="button" onClick={save} disabled={saving || !title || !body.trim() || (isNew && !slug)}
            className="inline-flex items-center gap-1.5 rounded-[9px] border border-line bg-surf2 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-fg transition-colors hover:border-p disabled:opacity-40">
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            {isNew ? 'Publish' : 'Save'}
          </button>
        </div>
      </header>

      <div className="grid gap-3 border-b border-line px-5 py-3 sm:grid-cols-2 lg:grid-cols-4">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title"
          className="rounded-[9px] border border-line bg-surf2 px-3 py-2 text-[13.5px] text-fg outline-none placeholder:text-fg3 focus:border-p" />
        <input value={slug} onChange={(e) => setSlug(e.target.value)} disabled={!isNew}
          placeholder="url-slug"
          className="rounded-[9px] border border-line bg-surf2 px-3 py-2 font-mono text-[12.5px] text-fg outline-none placeholder:text-fg3 focus:border-p disabled:opacity-50" />
        <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic"
          className="rounded-[9px] border border-line bg-surf2 px-3 py-2 text-[13.5px] text-fg outline-none placeholder:text-fg3 focus:border-p" />
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="tags, comma, separated"
          className="rounded-[9px] border border-line bg-surf2 px-3 py-2 text-[13.5px] text-fg outline-none placeholder:text-fg3 focus:border-p" />
        <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="One-sentence summary shown on the index"
          className="sm:col-span-2 lg:col-span-4 rounded-[9px] border border-line bg-surf2 px-3 py-2 text-[13.5px] text-fg outline-none placeholder:text-fg3 focus:border-p" />
      </div>

      {!loaded && <p className="px-5 py-6 text-[14px] text-fg3">Loading…</p>}

      {loaded && (
        <div className="grid min-h-0 flex-1 lg:grid-cols-2">
          <textarea
            value={body} onChange={(e) => setBody(e.target.value)} spellCheck={false}
            className={'h-full w-full resize-none border-line bg-bg px-5 py-5 font-mono text-[13px] leading-[1.7] text-fg2 outline-none lg:border-r ' +
              (showPreview ? 'hidden lg:block' : 'block')}
          />
          <div className={'h-full overflow-y-auto px-6 py-8 ' + (showPreview ? 'block' : 'hidden lg:block')}>
            {/* Same renderer and stylesheet as the published page. */}
            <div className="note-prose mx-auto max-w-[680px]"
              dangerouslySetInnerHTML={{ __html: preview }} />
          </div>
        </div>
      )}
    </div>
  );
}
