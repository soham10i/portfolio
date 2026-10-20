/* <ei-viewer src="data/recorded.json"> — interactive replay of a localization run.
 *
 * Self-contained (no dependencies, Shadow DOM), so the same file serves the
 * standalone viewer (viewer/index.html) and can be dropped into another site.
 * The JSON is produced by `ei run <csv> --export <json>` (ei_localization.export).
 *
 * Attributes
 *   src        URL of the run JSON (changing it reloads)
 *   theme      light | dark | auto (default: follows html[data-theme], else the OS)
 *   autoplay   present → starts playing when visible
 *
 * Shows: the room with the particle cloud, estimate, trail and uncertainty;
 * beacon range circles from the filtered RSSI; ground truth and the error
 * vector for simulated runs; linked RSSI / error / motion charts (click to
 * seek); play, speed, scrub and layer toggles.
 */
(() => {
  const BEACON_COLORS = ['#22d3ee', '#a78bfa', '#f59e0b'];
  const CSS = `
    :host { display:block; --bg:#f4f7fb; --panel:#ffffff; --ink:#0d1626; --ink2:#4a5a72; --ink3:#7d8ca3; --line:rgba(13,22,38,.10);
            --accent:#2563eb; --est:#2563eb; --truth:#10b981; --pt:rgba(37,99,235,.35); --room:#ffffff;
            font-family: var(--ev-font, 'Geist','Inter',system-ui,sans-serif); color:var(--ink); }
    :host([data-mode=dark]) { --bg:#0b1019; --panel:#111826; --ink:#e8edf6; --ink2:#9ba8bd; --ink3:#6c7b93; --line:rgba(255,255,255,.09);
            --accent:#79a8ff; --est:#79a8ff; --truth:#34d399; --pt:rgba(121,168,255,.42); --room:#0d1420; }
    * { box-sizing:border-box; }
    .ev { background:var(--bg); border:1px solid var(--line); border-radius:22px; padding:14px; display:flex; flex-direction:column; gap:12px; }
    header { display:flex; flex-wrap:wrap; align-items:flex-end; justify-content:space-between; gap:10px; padding:4px 6px 0; }
    h3 { margin:0; font-size:17px; font-weight:600; letter-spacing:-.01em; }
    .sub { margin:2px 0 0; font-size:12.5px; color:var(--ink2); max-width:60ch; }
    .badge { align-self:center; white-space:nowrap; font:500 10px/1 ui-monospace,'Geist Mono',monospace; letter-spacing:.12em; text-transform:uppercase; padding:6px 9px; border-radius:999px; background:var(--panel); border:1px solid var(--line); color:var(--ink2); }
    .chips { display:flex; flex-wrap:wrap; align-items:stretch; gap:6px; }
    .chip { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:7px 10px; min-width:84px; }
    .chip b { display:block; font-size:15px; font-weight:600; letter-spacing:-.01em; }
    .chip span { font:500 9.5px/1.2 ui-monospace,'Geist Mono',monospace; letter-spacing:.1em; text-transform:uppercase; color:var(--ink3); }
    .main { display:grid; grid-template-columns:minmax(0,1.15fr) minmax(0,1fr); gap:12px; }
    .narrow .main { grid-template-columns:1fr; }
    .card { background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:10px 12px; position:relative; }
    .lbl { font:500 9.5px/1 ui-monospace,'Geist Mono',monospace; letter-spacing:.12em; text-transform:uppercase; color:var(--ink3); margin-bottom:6px; display:flex; justify-content:space-between; gap:8px; }
    canvas { display:block; width:100%; }
    .room { aspect-ratio:1/1; }
    .side { display:flex; flex-direction:column; gap:10px; }
    .chart { height:96px; cursor:crosshair; }
    .readout { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; }
    .ro { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:8px 10px; }
    .ro span { display:block; font:500 9px/1 ui-monospace,'Geist Mono',monospace; letter-spacing:.1em; text-transform:uppercase; color:var(--ink3); margin-bottom:4px; }
    .ro b { font-size:13.5px; font-weight:600; font-variant-numeric:tabular-nums; }
    .transport { display:flex; flex-wrap:wrap; align-items:center; gap:8px; background:var(--panel); border:1px solid var(--line); border-radius:999px; padding:6px 8px; }
    button, select { font:inherit; font-size:12.5px; color:var(--ink); background:transparent; border:1px solid transparent; border-radius:999px; height:32px; padding:0 12px; cursor:pointer; }
    button:hover, select:hover { background:color-mix(in oklab, var(--ink) 7%, transparent); }
    button[aria-pressed=true] { border-color:var(--line); background:color-mix(in oklab, var(--accent) 16%, transparent); }
    .play { width:36px; height:36px; padding:0; display:grid; place-items:center; background:var(--ink); color:var(--panel); }
    .play:hover { background:var(--ink); opacity:.9; }
    input[type=range] { flex:1; min-width:120px; accent-color:var(--accent); }
    .time { font:500 11px/1 ui-monospace,'Geist Mono',monospace; color:var(--ink2); min-width:92px; text-align:right; font-variant-numeric:tabular-nums; }
    .legend { display:flex; flex-wrap:wrap; gap:10px; margin-top:8px; font-size:11.5px; color:var(--ink2); }
    .legend i { display:inline-block; width:10px; height:10px; border-radius:999px; margin-right:5px; vertical-align:-1px; }
    .msg { padding:40px; text-align:center; color:var(--ink3); font-size:13px; }
    :focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  `;

  const fmt = (v, d = 2) => (v == null || !isFinite(v) ? '—' : Number(v).toFixed(d));
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  class EiViewer extends HTMLElement {
    static get observedAttributes() { return ['src', 'theme']; }

    constructor() {
      super();
      this.root = this.attachShadow({ mode: 'open' });
      this.state = { f: 0, time: 0, playing: false, speed: 2, show: { particles: true, truth: true, trail: true, ranges: true } };
    }

    connectedCallback() {
      this.applyTheme();
      this.themeObs = new MutationObserver(() => this.applyTheme());
      this.themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
      this.mq = matchMedia('(prefers-color-scheme: dark)');
      this.mqFn = () => this.applyTheme();
      this.mq.addEventListener('change', this.mqFn);
      this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; if (this.visible && this.hasAttribute('autoplay') && this.data && !this.started) { this.started = true; this.setPlaying(true); } });
      this.io.observe(this);
      this.ro = new ResizeObserver(() => this.layout());
      this.ro.observe(this);
      if (this.getAttribute('src')) this.load(this.getAttribute('src'));
      this.raf = requestAnimationFrame((t) => this.tick(t));
    }

    disconnectedCallback() {
      cancelAnimationFrame(this.raf);
      this.themeObs?.disconnect(); this.io?.disconnect(); this.ro?.disconnect();
      this.mq?.removeEventListener('change', this.mqFn);
    }

    attributeChangedCallback(name, old, val) {
      if (name === 'src' && old !== null && val && val !== old) this.load(val);
      if (name === 'theme') this.applyTheme();
    }

    applyTheme() {
      const t = this.getAttribute('theme') || 'auto';
      const dark = t === 'dark' || (t === 'auto' && (document.documentElement.dataset.theme
        ? document.documentElement.dataset.theme === 'dark'
        : matchMedia('(prefers-color-scheme: dark)').matches));
      this.dataset.mode = dark ? 'dark' : 'light';
      this.draw();
    }

    async load(src) {
      this.root.innerHTML = `<style>${CSS}</style><div class="ev"><div class="msg">Loading run…</div></div>`;
      try {
        const d = await fetch(src).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
        const bin = atob(d.particles.data);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        d._pts = new Int16Array(bytes.buffer);
        this.data = d;
        this.state.f = 0; this.state.time = d.frames.t[0] || 0; this.started = false;
        this.build();
        if (this.hasAttribute('autoplay') && this.visible) { this.started = true; this.setPlaying(true); }
      } catch (e) {
        this.root.innerHTML = `<style>${CSS}</style><div class="ev"><div class="msg">Could not load ${src} — ${e.message}</div></div>`;
      }
    }

    build() {
      const d = this.data, m = d.metrics || {}, sim = d.source === 'simulated';
      const chips = sim
        ? [['RMSE', `${fmt(m.rmse_m)} m`], ['CEP50', `${fmt(m.cep50_m)} m`], ['CEP95', `${fmt(m.cep95_m)} m`], ['Jitter', `${fmt(m.path_jitter_m)} m`]]
        : [['Path', `${fmt(m.path_length_m, 1)} m`], ['Jitter', `${fmt(m.path_jitter_m)} m`], ['Rate', `${fmt(d.notes?.sample_hz, 1)} Hz`], ['Model', d.config?.motion ?? '—']];
      this.root.innerHTML = `<style>${CSS}</style>
        <div class="ev">
          <header>
            <div><h3>${d.name}</h3><p class="sub">${d.description || ''}</p></div>
            <div class="chips">
              <span class="badge">${sim ? 'Simulated · ground truth' : 'Recorded walk'}</span>
              ${chips.map(([k, v]) => `<div class="chip"><span>${k}</span><b>${v}</b></div>`).join('')}
            </div>
          </header>
          <div class="main">
            <div class="card">
              <div class="lbl"><span>Room ${d.room.w} × ${d.room.h} m · ${d.config.particles} particles</span><span class="mv"></span></div>
              <canvas class="room"></canvas>
              <div class="legend">
                <span><i style="background:var(--est)"></i>Estimate</span>
                ${sim ? '<span><i style="background:var(--truth)"></i>Ground truth</span>' : ''}
                <span><i style="background:var(--pt)"></i>Particles</span>
                ${d.beacons.map((b, i) => `<span><i style="background:${BEACON_COLORS[i]}"></i>${b.name}</span>`).join('')}
              </div>
            </div>
            <div class="side">
              <div class="card"><div class="lbl"><span>RSSI · dBm — dots raw, lines Kalman</span></div><canvas class="chart" data-c="rssi"></canvas></div>
              <div class="card"><div class="lbl"><span>${sim ? 'Error (line) · spread (area) · m' : 'Particle spread · m'}</span></div><canvas class="chart" data-c="err"></canvas></div>
              <div class="card"><div class="lbl"><span>Moving (bars) · effective sample size (line)</span></div><canvas class="chart" data-c="motion"></canvas></div>
              <div class="readout">
                <div class="ro"><span>Time</span><b class="r-t">—</b></div>
                <div class="ro"><span>Position</span><b class="r-p">—</b></div>
                <div class="ro"><span>${sim ? 'Error' : 'Spread'}</span><b class="r-e">—</b></div>
              </div>
            </div>
          </div>
          <div class="transport">
            <button class="play" aria-label="Play">▶</button>
            <select class="speed" aria-label="Playback speed">
              ${[0.5, 1, 2, 4, 8].map((s) => `<option value="${s}" ${s === this.state.speed ? 'selected' : ''}>${s}×</option>`).join('')}
            </select>
            <input class="scrub" type="range" min="0" max="${d.frames.t.length - 1}" value="0" aria-label="Seek" />
            <span class="time"></span>
            ${[['particles', 'Particles'], ['trail', 'Trail'], ['ranges', 'Ranges'], ...(sim ? [['truth', 'Truth']] : [])]
              .map(([k, l]) => `<button class="tg" data-k="${k}" aria-pressed="${this.state.show[k]}">${l}</button>`).join('')}
          </div>
        </div>`;
      const $ = (s) => this.root.querySelector(s);
      this.el = {
        room: $('.room'), charts: [...this.root.querySelectorAll('.chart')], play: $('.play'), scrub: $('.scrub'), time: $('.time'),
        rt: $('.r-t'), rp: $('.r-p'), re: $('.r-e'), mv: $('.mv'), ev: $('.ev'),
      };
      this.el.play.onclick = () => this.setPlaying(!this.state.playing);
      $('.speed').onchange = (e) => { this.state.speed = Number(e.target.value); };
      this.el.scrub.oninput = (e) => this.seekFrame(Number(e.target.value));
      this.root.querySelectorAll('.tg').forEach((b) => { b.onclick = () => { const k = b.dataset.k; this.state.show[k] = !this.state.show[k]; b.setAttribute('aria-pressed', this.state.show[k]); this.draw(); }; });
      this.el.charts.forEach((c) => { c.onclick = (e) => { const r = c.getBoundingClientRect(); this.seekFrame(Math.round(((e.clientX - r.left) / r.width) * (this.data.frames.t.length - 1))); }; });
      this.root.addEventListener('keydown', (e) => { if (e.key === ' ') { e.preventDefault(); this.setPlaying(!this.state.playing); } });
      this.layout();
    }

    layout() {
      if (!this.el) return;
      this.el.ev.classList.toggle('narrow', this.clientWidth < 760);
      const dpr = Math.min(devicePixelRatio || 1, 2);
      for (const c of [this.el.room, ...this.el.charts]) {
        const w = c.clientWidth, h = c.clientHeight;
        if (!w || !h) continue;
        c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      }
      this.draw();
    }

    setPlaying(on) {
      const n = this.data?.frames.t.length ?? 0;
      if (on && this.state.f >= n - 1) this.seekFrame(0);
      this.state.playing = on;
      if (this.el) { this.el.play.textContent = on ? '❚❚' : '▶'; this.el.play.setAttribute('aria-label', on ? 'Pause' : 'Play'); }
    }

    seekFrame(f) {
      const t = this.data.frames.t;
      this.state.f = Math.max(0, Math.min(t.length - 1, f));
      this.state.time = t[this.state.f];
      this.draw();
    }

    tick(now) {
      this.raf = requestAnimationFrame((t) => this.tick(t));
      const dt = Math.min(0.1, (now - (this.last || now)) / 1000);
      this.last = now;
      if (!this.data || !this.state.playing || this.visible === false) return;
      const t = this.data.frames.t;
      this.state.time += dt * this.state.speed;
      let f = this.state.f;
      while (f < t.length - 1 && t[f + 1] <= this.state.time) f++;
      if (f !== this.state.f) { this.state.f = f; this.draw(); }
      if (f >= t.length - 1) this.setPlaying(false);
    }

    // ── drawing ──────────────────────────────────────────────────────────
    css(name) { return getComputedStyle(this).getPropertyValue(name).trim(); }

    draw() {
      if (!this.data || !this.el) return;
      const d = this.data, F = d.frames, f = this.state.f;
      this.drawRoom();
      this.el.charts.forEach((c) => this.drawChart(c));
      this.el.scrub.value = f;
      this.el.time.textContent = `${mmss(F.t[f])} / ${mmss(F.t[F.t.length - 1])}`;
      this.el.rt.textContent = `${fmt(F.t[f], 1)} s`;
      this.el.rp.textContent = `${fmt(F.x[f], 1)}, ${fmt(F.y[f], 1)} m`;
      this.el.re.textContent = F.err ? `${fmt(F.err[f])} m` : `${fmt(F.spread[f])} m`;
      this.el.mv.textContent = F.moving[f] ? '● moving' : '○ still';
    }

    drawRoom() {
      const c = this.el.room, ctx = c.getContext('2d'), W = c.width, H = c.height;
      if (!W) return;
      const d = this.data, F = d.frames, f = this.state.f, S = this.state.show;
      const pad = W * 0.06, s = Math.min((W - 2 * pad) / d.room.w, (H - 2 * pad) / d.room.h);
      const X = (x) => pad + x * s, Y = (y) => H - pad - y * s;
      const ink3 = this.css('--ink3'), line = this.css('--line'), est = this.css('--est'), truth = this.css('--truth');
      ctx.clearRect(0, 0, W, H);

      ctx.fillStyle = this.css('--room');
      ctx.fillRect(X(0), Y(d.room.h), d.room.w * s, d.room.h * s);
      ctx.strokeStyle = line; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= d.room.w; i++) { ctx.moveTo(X(i), Y(0)); ctx.lineTo(X(i), Y(d.room.h)); }
      for (let j = 0; j <= d.room.h; j++) { ctx.moveTo(X(0), Y(j)); ctx.lineTo(X(d.room.w), Y(j)); }
      ctx.stroke();
      ctx.strokeStyle = this.css('--ink2'); ctx.lineWidth = Math.max(2, W / 260);
      ctx.strokeRect(X(0), Y(d.room.h), d.room.w * s, d.room.h * s);
      ctx.fillStyle = ink3; ctx.font = `${Math.max(10, W / 52)}px ui-monospace, monospace`;
      ctx.fillText('0', X(0) - pad * 0.5, Y(0) + pad * 0.45);
      ctx.fillText(`${d.room.w} m`, X(d.room.w) - pad * 0.6, Y(0) + pad * 0.6);

      // beacon ranges
      d.beacons.forEach((b, i) => {
        const r = F.rssiF[b.name]?.[f];
        if (S.ranges && r != null) {
          const dist = Math.pow(10, (d.model.p0 - r) / (10 * d.model.n));
          ctx.setLineDash([W / 120, W / 160]);
          ctx.strokeStyle = BEACON_COLORS[i] + '99'; ctx.lineWidth = Math.max(1.2, W / 420);
          ctx.beginPath(); ctx.arc(X(b.x), Y(b.y), Math.min(dist, 20) * s, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
        }
      });

      // ground truth path
      if (S.truth && F.gtx) {
        ctx.strokeStyle = truth + '55'; ctx.lineWidth = Math.max(1, W / 500); ctx.setLineDash([W / 200, W / 200]);
        ctx.beginPath();
        F.gtx.forEach((x, i) => (i ? ctx.lineTo(X(x), Y(F.gty[i])) : ctx.moveTo(X(x), Y(F.gty[i]))));
        ctx.stroke(); ctx.setLineDash([]);
      }

      // particles
      if (S.particles) {
        const n = d.particles.count, base = f * n * 2, P = d._pts;
        ctx.fillStyle = this.css('--pt');
        const r = Math.max(1.4, W / 340);
        for (let i = 0; i < n; i++) {
          const x = P[base + i * 2] / 100, y = P[base + i * 2 + 1] / 100;
          ctx.beginPath(); ctx.arc(X(x), Y(y), r, 0, Math.PI * 2); ctx.fill();
        }
      }

      // estimate trail
      if (S.trail) {
        const from = Math.max(0, f - 160);
        ctx.lineWidth = Math.max(1.5, W / 300); ctx.lineCap = 'round';
        for (let i = from + 1; i <= f; i++) {
          ctx.strokeStyle = est; ctx.globalAlpha = 0.15 + 0.85 * ((i - from) / Math.max(1, f - from));
          ctx.beginPath(); ctx.moveTo(X(F.x[i - 1]), Y(F.y[i - 1])); ctx.lineTo(X(F.x[i]), Y(F.y[i])); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // truth now + error vector
      if (S.truth && F.gtx) {
        ctx.strokeStyle = this.css('--ink3'); ctx.lineWidth = Math.max(1, W / 500);
        ctx.beginPath(); ctx.moveTo(X(F.gtx[f]), Y(F.gty[f])); ctx.lineTo(X(F.x[f]), Y(F.y[f])); ctx.stroke();
        ctx.fillStyle = truth;
        ctx.beginPath(); ctx.arc(X(F.gtx[f]), Y(F.gty[f]), Math.max(4, W / 90), 0, Math.PI * 2); ctx.fill();
      }

      // estimate + uncertainty
      const ex = X(F.x[f]), ey = Y(F.y[f]);
      ctx.strokeStyle = est; ctx.globalAlpha = 0.5; ctx.lineWidth = Math.max(1, W / 450);
      ctx.beginPath(); ctx.arc(ex, ey, F.spread[f] * s, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, W / 28);
      g.addColorStop(0, est); g.addColorStop(1, 'transparent');
      ctx.fillStyle = g; ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(ex, ey, W / 28, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = est; ctx.strokeStyle = this.css('--panel'); ctx.lineWidth = Math.max(2, W / 300);
      ctx.beginPath(); ctx.arc(ex, ey, Math.max(5, W / 75), 0, Math.PI * 2); ctx.fill(); ctx.stroke();

      // beacons on top
      d.beacons.forEach((b, i) => {
        const bs = Math.max(8, W / 45);
        ctx.fillStyle = BEACON_COLORS[i];
        ctx.beginPath(); ctx.roundRect(X(b.x) - bs / 2, Y(b.y) - bs / 2, bs, bs, bs / 4); ctx.fill();
        ctx.fillStyle = this.css('--ink'); ctx.font = `600 ${Math.max(10, W / 48)}px system-ui, sans-serif`;
        ctx.fillText(b.name.replace('Beacon', ''), X(b.x) + bs * 0.75, Y(b.y) - bs * 0.6);
      });
    }

    drawChart(c) {
      const ctx = c.getContext('2d'), W = c.width, H = c.height;
      if (!W) return;
      const d = this.data, F = d.frames, n = F.t.length, f = this.state.f, kind = c.dataset.c;
      const padL = W * 0.06, padR = W * 0.015, padT = H * 0.08, padB = H * 0.16;
      const X = (i) => padL + (i / Math.max(1, n - 1)) * (W - padL - padR);
      ctx.clearRect(0, 0, W, H);
      const axis = (lo, hi, ticks) => {
        ctx.strokeStyle = this.css('--line'); ctx.fillStyle = this.css('--ink3'); ctx.lineWidth = 1;
        ctx.font = `${Math.max(9, H / 9)}px ui-monospace, monospace`;
        ticks.forEach((v) => {
          const y = padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
          ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
          ctx.fillText(String(v), 2, y + 3);
        });
        return (v) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
      };
      const line = (arr, Y, color, width = 1.6, alpha = 1) => {
        ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = width * (W / 600 + 0.6);
        ctx.beginPath(); let pen = false;
        arr.forEach((v, i) => { if (v == null) { pen = false; return; } const x = X(i), y = Y(v); if (pen) ctx.lineTo(x, y); else { ctx.moveTo(x, y); pen = true; } });
        ctx.stroke(); ctx.globalAlpha = 1;
      };

      if (kind === 'rssi') {
        const Y = axis(-100, -50, [-90, -70, -50]);
        d.beacons.forEach((b, j) => {
          ctx.fillStyle = BEACON_COLORS[j]; ctx.globalAlpha = 0.3;
          const step = Math.max(1, Math.floor(n / 600));
          for (let i = 0; i < n; i += step) { const v = F.rssi[b.name][i]; if (v != null) ctx.fillRect(X(i) - 1, Y(v) - 1, 2.4, 2.4); }
          ctx.globalAlpha = 1;
          line(F.rssiF[b.name], Y, BEACON_COLORS[j], 1.5);
        });
      } else if (kind === 'err') {
        const hi = Math.max(3, Math.ceil(Math.max(...F.spread.filter((v) => v != null), ...(F.err || [0]).filter((v) => v != null))));
        const Y = axis(0, hi, [0, Math.round(hi / 2), hi]);
        ctx.fillStyle = this.css('--pt'); ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.moveTo(X(0), Y(0));
        F.spread.forEach((v, i) => ctx.lineTo(X(i), Y(v ?? 0)));
        ctx.lineTo(X(n - 1), Y(0)); ctx.fill(); ctx.globalAlpha = 1;
        if (F.err) line(F.err, Y, this.css('--truth'), 1.6);
      } else {
        const Y = axis(0, 1, [0, 1]);
        ctx.fillStyle = this.css('--est'); ctx.globalAlpha = 0.18;
        const bw = Math.max(1, (W - padL - padR) / n);
        F.moving.forEach((m, i) => { if (m) ctx.fillRect(X(i), Y(1), bw, Y(0) - Y(1)); });
        ctx.globalAlpha = 1;
        line(F.ess, Y, this.css('--ink2'), 1.3);
        ctx.fillStyle = this.css('--accent');
        F.step.forEach((s, i) => { if (s) ctx.fillRect(X(i), Y(0) - H * 0.08, 1.5, H * 0.08); });
      }

      // cursor
      ctx.strokeStyle = this.css('--ink'); ctx.globalAlpha = 0.6; ctx.lineWidth = Math.max(1, W / 700);
      ctx.beginPath(); ctx.moveTo(X(f), padT * 0.5); ctx.lineTo(X(f), H - padB); ctx.stroke(); ctx.globalAlpha = 1;
    }
  }

  if (!customElements.get('ei-viewer')) customElements.define('ei-viewer', EiViewer);
})();
