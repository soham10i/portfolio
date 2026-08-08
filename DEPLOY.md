# Deployment Guide — Soham's Portfolio

> **Goal:** One-command deploy. Push to GitHub → site updates automatically.

---

## Option 1: Render.com (Recommended — Free, Easiest)

### Step 1: Push to GitHub

```bash
cd /Users/sohampatel/workspace/Porfolio
git init
git add .
git commit -m "initial portfolio"
# Create repo on github.com/soham10i and:
git remote add origin https://github.com/soham10i/portfolio.git
git push -u origin main
```

### Step 2: Connect Render

1. Go to [dashboard.render.com](https://dashboard.render.com)
2. Click **New +** → **Blueprint**
3. Connect your GitHub repo `soham10i/portfolio`
4. Render reads `render.yaml` and auto-configures everything

### Step 3: Set Environment Variable

In Render dashboard → Your Service → Environment:

| Key | Value |
|-----|-------|
| `GEMINI_API_KEY` | `<set GEMINI_API_KEY from backend/.env — do not commit the real key>` |

> ⚠️ **Never commit `.env` to GitHub.** It's already in `.gitignore`.

### Step 4: Deploy

Render auto-deploys on every `git push`. Your URL will be:
```
https://soham-portfolio.onrender.com
```

### Re-deploy (after any change)

```bash
cd /Users/sohampatel/workspace/Porfolio
bash scripts/deploy.sh render
```

Or just:
```bash
git add .
git commit -m "update: description"
git push
# Render auto-deploys in ~2 minutes
```

---

## Option 2: Fly.io (Faster Global, $5/mo minimum)

If you want faster load times worldwide (Fly has edge servers everywhere):

```bash
# Install Fly CLI
brew install flyctl

# Login
fly auth login

# Launch (first time only)
fly launch --name soham-portfolio --region fra

# Set secrets
fly secrets set GEMINI_API_KEY="your-key"

# Deploy
fly deploy
```

Your URL: `https://soham-portfolio.fly.dev`

Re-deploy:
```bash
bash scripts/deploy.sh fly
```

---

## Option 3: Self-Hosted / VPS (DigitalOcean, Hetzner, etc.)

```bash
# On your server
git clone https://github.com/soham10i/portfolio.git
cd portfolio

# Build
cd app && npm ci && npm run build && cd ../backend
npm ci
cp .env.example .env
# Edit .env with your API key

# Run with PM2 for auto-restart
npm install -g pm2
pm2 start server.js --name portfolio
pm2 startup
pm2 save
```

---

## 🔒 Security Checklist

Before deploying, verify:

- [ ] `.env` is in `.gitignore` (API keys never committed)
- [ ] `backend/.env` has `GEMINI_API_KEY` set
- [ ] No hardcoded secrets in any source file
- [ ] `NODE_ENV=production` on the server
- [ ] CORS is configured (already done in `server.js`)

---

## 🔄 Update Workflow (After Any Change)

```bash
# 1. Make your changes in /Users/sohampatel/workspace/Porfolio

# 2. Run validation
node scripts/validate.js

# 3. Build & test locally
cd app && npm run build && cd ..

# 4. Deploy
bash scripts/deploy.sh
```

---

## 📊 Monitoring

| Platform | Dashboard |
|----------|-----------|
| Render | https://dashboard.render.com |
| Fly.io | https://fly.io/dashboard |
| Uptime | Add to [UptimeRobot](https://uptimerobot.com) (free) for alerts |

---

## 🆘 Troubleshooting

| Problem | Fix |
|---------|-----|
| "Gemini API key not configured" | Set `GEMINI_API_KEY` env var in platform dashboard |
| Blank page, 404 on refresh | SPA fallback already in `server.js` — check `dist/` folder exists |
| Chatbot 500 error | Check backend logs in Render/Fly dashboard |
| Slow first load | Render free tier sleeps after 15min idle — first request wakes it up (~10s) |
| CORS error | Already handled by `cors()` middleware — verify `VITE_API_URL` is empty (uses proxy) |
