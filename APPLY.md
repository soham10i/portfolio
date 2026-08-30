# Applying the production fix

Five commits, on top of `de93e11` (your current `origin/main`). Nothing here
has been pushed — the cloud sandbox has no credentials for your repo, so the
push is yours to make.

## 1. Clear the stuck git lock

```bash
cd ~/workspace/Porfolio
rm -f .git/index.lock
```

Zero bytes, safe to delete. It exists because the file bridge to this Mac
allows writes but blocks deletes, and git could not clean up after itself.

## 2. Discard the half-applied edits in your working tree

I patched `backend/src/routes/scene.js` and `backend/server.js` directly before
the lock stopped me. Those same fixes are in the bundle, properly committed, so
throw the loose copies away:

```bash
git stash list                    # check you have nothing of your own stashed
git checkout -- backend/
```

## 3. Install Git LFS — you do not have it

This is why all six `.mp4` files show as permanently modified: `HEAD` stores
LFS pointers, your working tree holds the real bytes, and with no `git-lfs`
installed git cannot reconcile them. The objects *are* on GitHub; you just
cannot fetch them.

```bash
brew install git-lfs
git lfs install
git lfs pull
git status                        # the six .mp4 entries should now be gone
```

## 4. Apply the bundle

```bash
git fetch ~/workspace/Porfolio/portfolio-production-fix.bundle main:incoming
git merge --ff-only incoming
git branch -d incoming
git log --oneline -6
```

Expect `37e6b57 docs: a root README...` on top.

## 5. Verify before pushing

```bash
(cd app && npm ci) && (cd backend && npm ci)
scripts/preview.sh                # builds, serves on :3001, checks routes
node scripts/smoke.js             # 12 checks; expect 12 passed once a key is set
```

## 6. Add your keys, then push

```bash
# backend/.env — see backend/.env.example for the annotated version
LLM_PROVIDER=groq
GROQ_API_KEY=gsk_...
LLM_FALLBACK_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-...
LLM_VISION_PROVIDER=nvidia
NVIDIA_API_KEY=nvapi-...
```

There is a stray line containing only `ß` at line 8 of your current
`backend/.env`. dotenv ignores it, but it breaks any script that sources the
file. Delete it.

Confirm the providers actually answer, then push:

```bash
scripts/probe-providers.sh
git push origin main
```

## 7. Render

`soham-portfolio.onrender.com` currently returns Render's own 404 page on every
path, including `/api/health` — there is no live service behind that hostname.
Create it from the blueprint: **Render Dashboard → Blueprints → New Blueprint →
this repo**. `render.yaml` defines everything except the three API keys, which
Render will prompt for.

Then, from anywhere:

```bash
node scripts/smoke.js https://<your-service>.onrender.com
```

Full detail in `docs/DEPLOYMENT.md`.
