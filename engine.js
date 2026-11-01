/* ============================================================
   BÜYÜK HARP — harita, kamera ve oyun motoru
   ============================================================ */
(() => {
  'use strict';
  const BH = window.BH;
  const {
    MAP, REGIONS, REG, NEI, isSea, OWNER, TERRAIN, DIFF, SAVE_KEY, SOUND_KEY,
    LABEL_OVERRIDES, SCENARIOS, emblemSVG, scenarioNow, regionName, sideLabel,
    otherSide, isCapital, capitalName, dateForTurn, formatDate
  } = BH;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  const dprNow = () => Math.min(window.devicePixelRatio || 1, 2);

  // ------------------------------------------------------------
  // DURUM
  // ------------------------------------------------------------
  const state = BH.state = {
    mode: 'intro',
    previewScenarioId: 'ww2',
    previewSide: 'axis',
    previewDifficulty: 'normal',
    scenarioId: null,
    scenario: null,
    side: 'axis',
    difficulty: 'normal',
    turn: 0,
    date: null,
    regions: {},
    factions: {
      axis: { treasury: 0, morale: 0, income: 0 },
      allies: { treasury: 0, morale: 0, income: 0 }
    },
    selected: null,
    hovered: null,
    log: [],
    stats: { battles: 0, wins: 0, conquests: 0 },
    fired: new Set(),
    eventQueue: [],
    currentEvent: null,
    aiThinking: false,
    modalOpen: false,
    over: false,
    result: null,
    fx: [],
    shake: 0
  };

  // ------------------------------------------------------------
  // SES
  // ------------------------------------------------------------
  const audio = BH.audio = {
    ctx: null,
    on: localStorage.getItem(SOUND_KEY) !== 'off',
    noiseBuf: null,
    init() {
      if (!this.on) return;
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    },
    tone(freq = 220, dur = 0.08, type = 'sine', vol = 0.03, slide = 0) {
      if (!this.on) return;
      this.init();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t); osc.stop(t + dur + 0.02);
    },
    noise(dur = 0.22, vol = 0.06, cutoff = 900) {
      if (!this.on) return;
      this.init();
      if (!this.ctx) return;
      if (!this.noiseBuf) {
        const len = Math.floor(this.ctx.sampleRate * 0.6);
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        this.noiseBuf = buf;
      }
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = cutoff;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filt).connect(gain).connect(this.ctx.destination);
      src.start(t); src.stop(t + dur);
    },
    click() { this.tone(520, 0.045, 'triangle', 0.018, -80); },
    select() { this.tone(330, 0.06, 'sine', 0.022, 50); },
    move() { this.tone(240, 0.09, 'triangle', 0.026, 90); setTimeout(() => this.tone(360, 0.08, 'triangle', 0.02, 40), 60); },
    attack() { this.noise(0.35, 0.075, 600); this.tone(90, 0.4, 'sawtooth', 0.035, -35); },
    capture() { [392, 523, 659].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, 'triangle', 0.025), i * 90)); },
    event() { [196, 247, 294].forEach((f, i) => setTimeout(() => this.tone(f, 0.35, 'sawtooth', 0.016), i * 110)); },
    victory() { [262, 330, 392, 523, 659].forEach((f, i) => setTimeout(() => this.tone(f, 0.4, 'triangle', 0.028), i * 130)); },
    defeat() { [330, 294, 247, 196].forEach((f, i) => setTimeout(() => this.tone(f, 0.45, 'sine', 0.028), i * 160)); },
    toggle() {
      this.on = !this.on;
      localStorage.setItem(SOUND_KEY, this.on ? 'on' : 'off');
      if (this.on) { this.init(); this.click(); }
      return this.on;
    }
  };

  // ------------------------------------------------------------
  // KAMERA / HARİTA
  // ------------------------------------------------------------
  const cam = BH.cam = { x: 0, y: 0, scale: 1, init: false };
  let canvas, ctx, W = 0, H = 0, DPR = 1;
  const paths = new Map();
  let allLand = null;
  let hatch = null;
  const frontPoints = [];
  const labelPos = id => LABEL_OVERRIDES[id] || REG[id].label;

  function buildMap() {
    allLand = new Path2D();
    for (const r of REGIONS) {
      const p = new Path2D();
      for (const poly of r.polys) {
        poly.forEach((pt, i) => i ? p.lineTo(pt[0], pt[1]) : p.moveTo(pt[0], pt[1]));
        p.closePath();
      }
      paths.set(r.id, p);
      allLand.addPath(p);
    }
    // yakın kara sınırlarını cephe işaretleri için hesapla
    const seen = new Set();
    for (const r of REGIONS) {
      for (const n of r.neighbors) {
        const key = [r.id, n].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        if (isSea(r.id, n)) continue;
        const fp = closestBorderPoint(r, REG[n]);
        if (fp) frontPoints.push({ a: r.id, b: n, x: fp[0], y: fp[1] });
      }
    }
    // tarafsız bölgeler için eğik tarama deseni
    const hc = document.createElement('canvas');
    hc.width = 8; hc.height = 8;
    const hx = hc.getContext('2d');
    hx.strokeStyle = 'rgba(236,229,214,.45)';
    hx.lineWidth = 1;
    hx.beginPath(); hx.moveTo(-2, 10); hx.lineTo(10, -2); hx.stroke();
    hatch = ctx.createPattern(hc, 'repeat');
  }

  function closestBorderPoint(a, b) {
    let best = Infinity, bx = 0, by = 0;
    const A = a.polys.flat(), B = b.polys.flat();
    for (let i = 0; i < A.length; i += 2) {
      const p = A[i];
      for (let j = 0; j < B.length; j += 2) {
        const q = B[j];
        const dx = p[0] - q[0], dy = p[1] - q[1];
        const d = dx * dx + dy * dy;
        if (d < best) { best = d; bx = (p[0] + q[0]) / 2; by = (p[1] + q[1]) / 2; }
      }
    }
    return best < 90 ? [bx, by] : null;
  }

  function setupCanvas() {
    canvas = document.getElementById('map');
    ctx = canvas.getContext('2d', { alpha: false });
    resizeCanvas();
    buildMap();
    window.addEventListener('resize', () => {
      resizeCanvas();
      if (state.mode === 'intro' || state.mode === 'end') fitMap();
    });
  }

  function resizeCanvas() {
    DPR = dprNow();
    const rect = canvas.getBoundingClientRect();
    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    if (!cam.init) { fitMap(); cam.init = true; } else clampCam();
  }

  function fitMap() {
    if (!W || !H) return;
    const mobile = W < 900;
    const inGame = state.mode === 'game';

    if (mobile) {
      cam.scale = 0.60;
      const focus = inGame ? { x: 520, y: 600 } : { x: MAP.width / 2, y: MAP.height / 2 };
      cam.x = W / 2 - focus.x * cam.scale;
      cam.y = H / 2 - focus.y * cam.scale;
    } else if (inGame) {
      // Yan panellerin arasında kalan görünür bandı Batı/Orta Avrupa'ya odakla.
      const leftPad = W <= 1120 ? 292 : 316;
      const rightPad = W <= 1120 ? 304 : 338;
      const s = Math.min((W - 34) / MAP.width, (H - 34) / MAP.height);
      cam.scale = clamp(s, 0.45, 1.25);
      const focus = { x: W <= 1000 ? 480 : W <= 1120 ? 520 : 560, y: 600 };
      const cx = (leftPad + (W - rightPad)) / 2;
      cam.x = cx - focus.x * cam.scale;
      cam.y = H / 2 - focus.y * cam.scale;
    } else {
      const s = Math.min((W - 34) / MAP.width, (H - 34) / MAP.height);
      cam.scale = clamp(s, 0.45, 1.25);
      cam.x = (W - MAP.width * cam.scale) / 2;
      cam.y = (H - MAP.height * cam.scale) / 2;
    }
    clampCam();
  }

  function clampCam() {
    const mw = MAP.width * cam.scale, mh = MAP.height * cam.scale;
    const maxX = W < 900 ? 0 : 180;
    if (mw <= W) {
      const base = (W - mw) / 2;
      cam.x = clamp(cam.x, Math.min(base, 0), Math.max(base, maxX));
    } else {
      cam.x = clamp(cam.x, W - mw - 60, maxX);
    }
    if (mh <= H) cam.y = (H - mh) / 2;
    else cam.y = clamp(cam.y, H - mh - 60, 60);
  }

  function zoomAt(factor, sx = W / 2, sy = H / 2) {
    const old = cam.scale;
    const ns = clamp(old * factor, 0.30, 5);
    const k = ns / old;
    cam.x = sx - (sx - cam.x) * k;
    cam.y = sy - (sy - cam.y) * k;
    cam.scale = ns;
    clampCam();
  }

  function screenToMap(sx, sy) {
    return [(sx - cam.x) / cam.scale, (sy - cam.y) / cam.scale];
  }
  function mapToScreen(x, y, vc = cam) {
    return [x * vc.scale + vc.x, y * vc.scale + vc.y];
  }

  function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi) inside = !inside;
    }
    return inside;
  }
  function pointInRegion(x, y, r) {
    for (const poly of r.polys) if (pointInPoly(x, y, poly)) return true;
    return false;
  }
  function regionAtScreen(sx, sy) {
    const [mx, my] = screenToMap(sx, sy);
    for (const r of REGIONS) if (pointInRegion(mx, my, r)) return r.id;
    // küçük adalar ve dar bölgeler için etiket yakınlığı
    let best = null, bestD = 18 * 18;
    for (const r of REGIONS) {
      const p = labelPos(r.id);
      const [px, py] = mapToScreen(p[0], p[1]);
      const dx = px - sx, dy = py - sy, d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = r.id; }
    }
    return best;
  }

  // ------------------------------------------------------------
  // ÇİZİM
  // ------------------------------------------------------------
  function ownerOf(id) {
    if (state.mode === 'game' || state.mode === 'end') {
      return state.regions[id] ? state.regions[id].owner : 'neutral';
    }
    const sc = SCENARIOS[state.previewScenarioId] || SCENARIOS.ww2;
    return sc.owners[id] || 'neutral';
  }
  function troopsOf(id) {
    if (state.mode === 'game' || state.mode === 'end') {
      return state.regions[id] ? state.regions[id].troops : 0;
    }
    const sc = SCENARIOS[state.previewScenarioId] || SCENARIOS.ww2;
    return sc.troops[id] ?? 3;
  }

  function render(ts) {
    requestAnimationFrame(render);
    if (!ctx) return;
    const dt = Math.min(60, ts - (render.last || ts));
    render.last = ts;
    // ekran sarsıntısı
    let vc = { x: cam.x, y: cam.y, scale: cam.scale };
    if (state.mode === 'intro') {
      const t = ts / 1000;
      vc.x += Math.sin(t * 0.07) * 11;
      vc.y += Math.cos(t * 0.052) * 8;
      vc.scale *= 1.006 + Math.sin(t * 0.04) * 0.004;
    }
    if (state.shake > 0.05) {
      vc.x += (Math.random() - 0.5) * state.shake;
      vc.y += (Math.random() - 0.5) * state.shake;
      state.shake *= 0.88;
    }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawSea(vc, ts);
    ctx.save();
    ctx.translate(vc.x, vc.y);
    ctx.scale(vc.scale, vc.scale);
    drawLand(vc);
    drawBorders(vc);
    ctx.restore();
    drawFront(vc, ts);
    if (state.selected) drawArrows(vc, ts);
    drawLabels(vc, ts);
    drawSelection(vc, ts);
    drawFx(vc, ts);
    updateFx(ts, dt);
  }

  function drawSea(vc, ts) {
    const g = ctx.createLinearGradient(0, 0, W * 0.8, H);
    g.addColorStop(0, '#0a1a22');
    g.addColorStop(0.45, '#08141c');
    g.addColorStop(1, '#040b10');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W * 0.5, H * 0.44, 10, W * 0.5, H * 0.44, Math.max(W, H) * 0.75);
    glow.addColorStop(0, 'rgba(40,86,102,.20)');
    glow.addColorStop(0.5, 'rgba(22,52,64,.09)');
    glow.addColorStop(1, 'rgba(2,7,10,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // deniz üzerindeki ince ızgara
    ctx.save();
    ctx.translate(vc.x, vc.y);
    ctx.scale(vc.scale, vc.scale);
    ctx.lineWidth = 0.8 / vc.scale;
    ctx.strokeStyle = 'rgba(120,170,180,.055)';
    ctx.beginPath();
    for (let x = 0; x <= MAP.width; x += 100) { ctx.moveTo(x, 0); ctx.lineTo(x, MAP.height); }
    for (let y = 0; y <= MAP.height; y += 100) { ctx.moveTo(0, y); ctx.lineTo(MAP.width, y); }
    ctx.stroke();
    // harita köşe işaretleri
    ctx.strokeStyle = 'rgba(211,175,105,.12)';
    ctx.lineWidth = 1 / vc.scale;
    const m = 14;
    [[0, 0], [MAP.width, 0], [0, MAP.height], [MAP.width, MAP.height]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.moveTo(x + (x ? -m : m), y); ctx.lineTo(x, y); ctx.lineTo(x, y + (y ? -m : m));
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawLand(vc) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.8)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#20231c';
    ctx.fill(allLand);
    ctx.shadowBlur = 0;
    for (const r of REGIONS) {
      const own = ownerOf(r.id);
      ctx.fillStyle = OWNER[own].fill;
      ctx.fill(paths.get(r.id));
    }
    // tarafsız bölgelerde ince tarama
    if (hatch) {
      ctx.save();
      ctx.globalAlpha = 0.10;
      ctx.fillStyle = hatch;
      for (const r of REGIONS) if (ownerOf(r.id) === 'neutral') ctx.fill(paths.get(r.id));
      ctx.restore();
    }
    // hafif üst ışığı
    const lg = ctx.createLinearGradient(0, 0, 0, MAP.height);
    lg.addColorStop(0, 'rgba(255,238,196,.08)');
    lg.addColorStop(0.55, 'rgba(255,238,196,.015)');
    lg.addColorStop(1, 'rgba(0,0,0,.13)');
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = lg;
    ctx.fill(allLand);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawBorders(vc) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(5,10,12,.82)';
    ctx.lineWidth = 2.0 / vc.scale;
    for (const r of REGIONS) ctx.stroke(paths.get(r.id));
    for (const r of REGIONS) {
      ctx.strokeStyle = OWNER[ownerOf(r.id)].light;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 0.8 / vc.scale;
      ctx.stroke(paths.get(r.id));
    }
    ctx.globalAlpha = 1;
  }

  function drawFront(vc, ts) {
    if (vc.scale < 0.48) return;
    for (const fp of frontPoints) {
      const oa = ownerOf(fp.a), ob = ownerOf(fp.b);
      if (oa === ob || oa === 'neutral' || ob === 'neutral') continue;
      const [x, y] = mapToScreen(fp.x, fp.y, vc);
      if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
      const pulse = 0.5 + 0.5 * Math.sin(ts / 340 + fp.x * 0.012);
      ctx.save();
      ctx.globalAlpha = 0.32 + pulse * 0.38;
      ctx.strokeStyle = '#e2b15f';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, 2.4 + pulse * 2.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.16 + pulse * 0.18;
      ctx.fillStyle = '#e2b15f';
      ctx.beginPath();
      ctx.arc(x, y, 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawArrows(vc, ts) {
    const from = state.selected;
    if (!from) return;
    const [fx, fy] = mapToScreen(labelPos(from)[0], labelPos(from)[1], vc);
    for (const n of NEI[from] || []) {
      const [tx, ty] = mapToScreen(labelPos(n)[0], labelPos(n)[1], vc);
      const dx = tx - fx, dy = ty - fy;
      const len = Math.hypot(dx, dy);
      if (len < 24 || len > Math.max(W, H) * 0.8) continue;
      const own = ownerOf(n);
      const mine = ownerOf(from);
      const color = own === mine ? '#7fbf96' : own === 'neutral' ? '#c9b77f' : '#d76a56';
      const mx = (fx + tx) / 2 - dy * 0.09;
      const my = (fy + ty) / 2 + dx * 0.09;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.72;
      ctx.lineWidth = 1.25;
      if (isSea(from, n)) ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.quadraticCurveTo(mx, my, tx, ty);
      ctx.stroke();
      // ok ucu
      const angle = Math.atan2(ty - my, tx - mx);
      const ah = 7;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx - ah * Math.cos(angle - 0.42), ty - ah * Math.sin(angle - 0.42));
      ctx.lineTo(tx - ah * Math.cos(angle + 0.42), ty - ah * Math.sin(angle + 0.42));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawLabels(vc, ts) {
    const showNames = vc.scale >= 0.70;
    const pulse = 0.5 + 0.5 * Math.sin(ts / 480);
    for (const r of REGIONS) {
      const [px, py] = mapToScreen(labelPos(r.id)[0], labelPos(r.id)[1], vc);
      if (px < -90 || px > W + 90 || py < -60 || py > H + 60) continue;
      const own = ownerOf(r.id);
      const cap = isCapital(r.id);
      const name = regionName(r.id).toUpperCase();
      const showName = showNames || cap || r.area > 7;
      if (state.hovered === r.id) {
        ctx.save();
        ctx.globalAlpha = 0.25 + pulse * 0.18;
        ctx.fillStyle = '#f2d99f';
        ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      if (state.mode !== 'intro' && showName) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `${cap ? '700' : '600'} ${cap ? 9.5 : 8.8}px "Trebuchet MS","Segoe UI",sans-serif`;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(4,10,13,.88)';
        ctx.strokeText(name, px, py - 7);
        ctx.fillStyle = cap ? '#f2d99f' : (own === 'neutral' ? '#c9c1a2' : '#e9e2d2');
        ctx.fillText(name, px, py - 7);
        ctx.restore();
      }
      if (cap) {
        ctx.save();
        ctx.fillStyle = '#f2d99f';
        ctx.shadowColor = 'rgba(211,175,105,.65)';
        ctx.shadowBlur = 6;
        star(ctx, px, py - (showName ? 19 : 16), 3.6, 1.6, 5);
        ctx.fill();
        ctx.restore();
      }
      if (state.mode !== 'intro') drawCounter(px, py, r.id, showName, vc);
    }
  }

  function drawCounter(px, py, id, showName, vc) {
    const own = ownerOf(id);
    const st = state.regions[id];
    const troops = state.mode === 'end' || state.mode === 'game' ? (st ? st.troops : 0) : troopsOf(id);
    const w = 34, h = 17;
    const x = px - w / 2, y = py + (showName ? 1 : -8);
    ctx.save();
    if (st && st.acted && state.mode === 'game' && own === state.side) ctx.globalAlpha = 0.62;
    ctx.fillStyle = 'rgba(4,10,14,.88)';
    roundRect(ctx, x, y, w, h, 2); ctx.fill();
    ctx.strokeStyle = state.selected === id ? '#f2d99f' : OWNER[own].color;
    ctx.lineWidth = 1;
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 2); ctx.stroke();
    ctx.fillStyle = OWNER[own].color;
    ctx.fillRect(x + 2, y + 2, 3, h - 4);
    // küçük taraf işareti
    ctx.save();
    ctx.translate(x + 10, y + h / 2);
    ctx.strokeStyle = OWNER[own].light;
    ctx.fillStyle = OWNER[own].light;
    ctx.lineWidth = 1.2;
    if (own === 'axis') {
      ctx.beginPath(); ctx.moveTo(-3, -3); ctx.lineTo(3, 3); ctx.moveTo(3, -3); ctx.lineTo(-3, 3); ctx.stroke();
    } else if (own === 'allies') {
      star(ctx, 0, 0, 3.4, 1.5, 5); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = '#f1eadb';
    ctx.font = '700 9.5px "Trebuchet MS","Segoe UI",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(troops), x + 23, y + h / 2 + 0.5);
    // siper pips
    if (st && st.entrench > 0) {
      for (let i = 0; i < st.entrench; i++) {
        ctx.fillStyle = '#d3af69';
        ctx.fillRect(x + 4 + i * 4, y + h + 3, 2, 2);
      }
    }
    ctx.restore();
  }

  function drawSelection(vc, ts) {
    const sel = state.selected;
    if (!sel) return;
    ctx.save();
    ctx.translate(vc.x, vc.y);
    ctx.scale(vc.scale, vc.scale);
    ctx.strokeStyle = '#f2d99f';
    ctx.shadowColor = 'rgba(242,217,159,.75)';
    ctx.shadowBlur = 14 / vc.scale;
    ctx.lineWidth = 2.2 / vc.scale;
    ctx.setLineDash([7 / vc.scale, 5 / vc.scale]);
    ctx.lineDashOffset = -(ts / 45) % 12;
    ctx.stroke(paths.get(sel));
    ctx.restore();
  }

  function drawFx(vc, ts) {
    for (const f of state.fx) {
      const t = (ts - f.start) / f.dur;
      if (t < 0 || t > 1) continue;
      const [x, y] = mapToScreen(f.x, f.y, vc);
      const alpha = 1 - t;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 8 + 30 * t, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = alpha * 0.9;
      ctx.fillStyle = f.color;
      ctx.font = '700 12px "Trebuchet MS",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(f.text, x, y - 12 - 20 * t);
      ctx.restore();
    }
  }

  function updateFx(ts, dt) {
    if (!state.fx.length) return;
    state.fx = state.fx.filter(f => ts - f.start < f.dur);
  }

  function addFx(id, text, color) {
    const p = labelPos(id);
    state.fx.push({ x: p[0], y: p[1], text, color, start: performance.now(), dur: 1200 });
  }

  function roundRect(c, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }
  function star(c, cx, cy, outer, inner, points) {
    c.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 ? inner : outer;
      const a = (Math.PI / points) * i - Math.PI / 2;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.closePath();
  }

  // ------------------------------------------------------------
  // OYUN DURUMU / KURALLAR
  // ------------------------------------------------------------
  const ui = () => BH.ui;
  function refresh(save = true) {
    if (ui() && ui().update) ui().update();
    if (save) saveGame();
  }
  function log(text, type = 'info') {
    state.log.push({ text, type, date: state.date ? formatDate(state.date) : '', turn: state.turn });
    if (state.log.length > 120) state.log.shift();
    if (ui() && ui().updateLog) ui().updateLog();
  }
  function faction(side) { return state.factions[side]; }
  function capFor(id) {
    return 12 + (isCapital(id) ? 4 : 0) + ((REG[id] && REG[id].prod >= 6) ? 2 : 0);
  }
  function calcIncome(side) {
    let sum = 0;
    for (const r of REGIONS) if (state.regions[r.id] && state.regions[r.id].owner === side) sum += r.prod + (isCapital(r.id) ? 2 : 0);
    return sum;
  }
  function addIncome(side) {
    const d = DIFF[state.difficulty];
    const base = calcIncome(side);
    const inc = Math.max(1, Math.round(base * (side === state.side ? d.playerIncome : d.aiIncome)));
    faction(side).treasury += inc;
    faction(side).income = inc;
    return inc;
  }
  function addGold(side, n) {
    if (!faction(side)) return;
    faction(side).treasury = Math.max(0, faction(side).treasury + n);
  }
  function addMorale(side, n) {
    if (!faction(side)) return;
    faction(side).morale = clamp(faction(side).morale + n, 0, 100);
  }
  function moraleMod(side) { return 0.90 + (faction(side) ? faction(side).morale : 50) / 500; }
  function isBorderWithEnemy(id, side) {
    return (NEI[id] || []).some(n => state.regions[n] && state.regions[n].owner !== side && state.regions[n].owner !== 'neutral');
  }
  function countRegions(side) {
    return REGIONS.reduce((n, r) => n + (state.regions[r.id] && state.regions[r.id].owner === side ? 1 : 0), 0);
  }
  function totalTroops(side) {
    return REGIONS.reduce((n, r) => n + (state.regions[r.id] && state.regions[r.id].owner === side ? state.regions[r.id].troops : 0), 0);
  }
  function scoreFor(side) {
    let s = countRegions(side) * 10 + Math.round((faction(side) ? faction(side).morale : 0) / 2);
    for (const id of Object.keys(scenarioNow().capitals || {})) if (state.regions[id] && state.regions[id].owner === side) s += 25;
    return s;
  }

  // ------------------------------------------------------------
  // KAYIT
  // ------------------------------------------------------------
  function saveGame() {
    if (state.mode !== 'game' || state.over || !state.scenario) return;
    try {
      const regions = {};
      for (const id of Object.keys(state.regions)) {
        const r = state.regions[id];
        regions[id] = { owner: r.owner, troops: r.troops, entrench: r.entrench, acted: r.acted, recruited: r.recruited };
      }
      const data = {
        v: 1, scenarioId: state.scenarioId, side: state.side, difficulty: state.difficulty,
        turn: state.turn, factions: state.factions, regions,
        log: state.log.slice(-80), fired: [...state.fired], stats: state.stats
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) { /* sessizce geç */ }
  }
  function readSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !SCENARIOS[data.scenarioId] || !data.regions) return null;
      return data;
    } catch (e) { return null; }
  }

  // ------------------------------------------------------------
  // YENİ OYUN / TUR
  // ------------------------------------------------------------
  function newGame(scenarioId, side, difficulty) {
    const sc = SCENARIOS[scenarioId] || SCENARIOS.ww2;
    state.mode = 'game';
    state.scenarioId = sc.id;
    state.scenario = sc;
    state.previewScenarioId = sc.id;
    state.previewSide = side;
    state.side = side;
    state.difficulty = difficulty || 'normal';
    state.turn = 0;
    state.date = { year: sc.start.year, month: sc.start.month };
    state.regions = {};
    for (const r of REGIONS) {
      state.regions[r.id] = {
        owner: sc.owners[r.id] || 'neutral',
        troops: sc.troops[r.id] ?? 3,
        entrench: 0, acted: false, recruited: false
      };
    }
    state.factions = {
      axis: { treasury: sc.startTreasury.axis, morale: sc.startMorale.axis, income: 0 },
      allies: { treasury: sc.startTreasury.allies, morale: sc.startMorale.allies, income: 0 }
    };
    state.selected = null;
    state.hovered = null;
    state.log = [];
    state.stats = { battles: 0, wins: 0, conquests: 0 };
    state.fired = new Set();
    state.eventQueue = [];
    state.currentEvent = null;
    state.aiThinking = false;
    state.modalOpen = false;
    state.over = false;
    state.result = null;
    state.fx = [];
    state.shake = 0;
    if (ui()) ui().enterGame();
    log(`${sc.era} · ${sc.title} seferi başladı.`, 'system');
    beginTurn();
  }

  function beginTurn() {
    const sc = state.scenario;
    state.turn++;
    state.date = dateForTurn(sc.start, state.turn, sc.monthsPerTurn || 1);
    for (const id of Object.keys(state.regions)) {
      state.regions[id].acted = false;
      state.regions[id].recruited = false;
    }
    addIncome('axis');
    addIncome('allies');
    log(`— ${formatDate(state.date)} · Tur ${state.turn} —`, 'turn');
    fireEvents();
    refresh(false);
    if (checkVictory()) return;
    if (!state.eventQueue.length) saveGame();
  }

  function fireEvents() {
    const sc = state.scenario;
    for (const ev of sc.events) {
      if (ev.turn === state.turn && !state.fired.has(ev.id)) {
        state.fired.add(ev.id);
        state.eventQueue.push(ev);
      }
    }
    if (ui() && ui().showNextEvent) ui().showNextEvent();
  }

  async function endTurn() {
    if (state.aiThinking || state.modalOpen || state.over || state.mode !== 'game') return;
    state.selected = null;
    state.hovered = null;
    if (ui()) ui().closePanels();
    saveGame();
    state.aiThinking = true;
    if (ui()) ui().showAiBanner(true);
    refresh(false);
    await sleep(420);
    const enemy = otherSide(state.side);
    aiRecruit(enemy);
    refresh(false);
    await sleep(260);
    await aiAct(enemy);
    if (state.over) return;
    state.aiThinking = false;
    if (ui()) ui().showAiBanner(false);
    if (state.turn >= state.scenario.maxTurns) { endByScore(); return; }
    beginTurn();
    refresh(false);
  }

  function aiRecruit(side) {
    const f = faction(side);
    let guard = 0;
    const owned = REGIONS.map(r => r.id).filter(id => state.regions[id].owner === side);
    while (f.treasury >= 3 && guard++ < 40) {
      let pool = owned.filter(id => state.regions[id].troops < capFor(id) && isBorderWithEnemy(id, side));
      if (!pool.length) pool = owned.filter(id => state.regions[id].troops < capFor(id) && isCapital(id));
      if (!pool.length) pool = owned.filter(id => state.regions[id].troops < capFor(id));
      if (!pool.length) break;
      pool.sort((a, b) => state.regions[a].troops - state.regions[b].troops);
      state.regions[pool[0]].troops++;
      f.treasury -= 3;
    }
  }

  async function aiAct(side) {
    const owned = shuffle(REGIONS.map(r => r.id).filter(id => state.regions[id].owner === side));
    for (const id of owned) {
      if (state.over) return;
      const r = state.regions[id];
      if (r.owner !== side || r.acted || r.troops <= 1) continue;
      const allTargets = (NEI[id] || []).filter(n => state.regions[n].owner !== side);
      const enemyTargets = allTargets.filter(n => state.regions[n].owner !== 'neutral');
      const targets = enemyTargets.length ? enemyTargets : (state.difficulty === 'hard' ? allTargets : []);
      let best = null, bestScore = Infinity;
      for (const n of targets) {
        const d = state.regions[n];
        const terr = TERRAIN[REG[n].terrain] ? TERRAIN[REG[n].terrain].def : 0;
        let score = d.troops + terr * 5 + (isCapital(n) ? 4 : 0) + (isSea(id, n) ? 2 : 0);
        if (d.owner === 'neutral') score += 3;
        if (score < bestScore) { bestScore = score; best = n; }
      }
      if (best) {
        const def = state.regions[best];
        const threshold = DIFF[state.difficulty].aggro;
        if (r.troops - 1 >= Math.max(1, def.troops * threshold)) {
          const res = resolveBattle(id, best, { ai: true });
          if (res) { refresh(false); await sleep(360); continue; }
        }
      }
      const ownTargets = (NEI[id] || []).filter(n => state.regions[n].owner === side && isBorderWithEnemy(n, side) && state.regions[n].troops < 6);
      if (r.troops > 3 && ownTargets.length) {
        ownTargets.sort((a, b) => state.regions[a].troops - state.regions[b].troops);
        moveTroops(id, ownTargets[0], Math.min(2, r.troops - 1), { ai: true });
        refresh(false);
        await sleep(120);
      }
    }
  }

  // ------------------------------------------------------------
  // HAREKÂTLAR
  // ------------------------------------------------------------
  function moveTroops(from, to, amount, opts = {}) {
    const a = state.regions[from], b = state.regions[to];
    if (!a || !b || a.owner !== state.side && !opts.ai) return false;
    if (!NEI[from] || !NEI[from].includes(to)) return false;
    const max = Math.max(0, a.troops - 1);
    const room = Math.max(0, capFor(to) - b.troops);
    amount = clamp(Math.floor(amount), 1, Math.min(max, room));
    if (amount < 1) return false;
    a.troops -= amount;
    b.troops += amount;
    a.acted = true;
    b.entrench = Math.max(0, b.entrench - 1);
    if (!opts.ai) {
      log(`${regionName(from)} → ${regionName(to)}: ${amount} birlik kaydırıldı.`, 'move');
      audio.move();
    }
    refresh(!opts.ai);
    return true;
  }

  function recruit(id, n = 1) {
    const r = state.regions[id];
    if (!r || r.owner !== state.side) return false;
    const cost = 3 * n;
    if (r.recruited) { if (ui()) ui().toast('Bu bölgede bu tur zaten asker toplandı.', 'bad'); return false; }
    if (faction(state.side).treasury < cost) { if (ui()) ui().toast('Yetersiz altın. Turu bitirerek gelir topla.', 'bad'); return false; }
    if (r.troops + n > capFor(id)) { if (ui()) ui().toast('Bölge kapasitesi dolu.', 'bad'); return false; }
    faction(state.side).treasury -= cost;
    r.troops += n;
    r.recruited = true;
    log(`${regionName(id)}: +${n} birlik (${cost} altın).`, 'recruit');
    audio.select();
    refresh();
    return true;
  }

  function fortify(id) {
    const r = state.regions[id];
    if (!r || r.owner !== state.side) return false;
    if (r.acted) { if (ui()) ui().toast('Bu bölge bu tur harekât yaptı.', 'bad'); return false; }
    if (r.entrench >= 3) { if (ui()) ui().toast('Siper seviyesi zirvede.', 'bad'); return false; }
    if (faction(state.side).treasury < 2) { if (ui()) ui().toast('Yetersiz altın.', 'bad'); return false; }
    faction(state.side).treasury -= 2;
    r.entrench++;
    r.acted = true;
    log(`${regionName(id)}: siperler güçlendirildi (+1 savunma).`, 'fortify');
    audio.move();
    refresh();
    return true;
  }

  function resolveBattle(atkId, defId, opts = {}) {
    const atk = state.regions[atkId], def = state.regions[defId];
    if (!atk || !def) return null;
    const atkSide = atk.owner;
    const oldOwner = def.owner;
    if (def.owner === 'neutral') {
      const joined = otherSide(atkSide);
      def.owner = joined;
      log(`${regionName(defId)} tarafsızlığını terk etti ve ${sideLabel(joined)} safına katıldı.`, 'event');
    }
    const defSide = def.owner;
    if (defSide === atkSide) return null;
    const atkTroops = atk.troops - 1;
    if (atkTroops < 1) return null;
    const sea = isSea(atkId, defId);
    const d = DIFF[state.difficulty];
    const atkMod = moraleMod(atkSide) * (atkSide === state.side ? 1 : d.aiAttack) * (sea ? 0.82 : 1);
    const defMod = moraleMod(defSide) * (defSide === state.side ? 1 : d.aiDefense) *
      (1 + (TERRAIN[REG[defId].terrain] ? TERRAIN[REG[defId].terrain].def : 0) + def.entrench * 0.12) * (sea ? 1.12 : 1);
    const atkPower = atkTroops * atkMod * (0.88 + Math.random() * 0.24);
    const defPower = Math.max(0.5, def.troops * defMod * (0.88 + Math.random() * 0.24));
    const win = atkPower > defPower;
    const ratio = atkPower / Math.max(0.5, defPower);
    let atkLoss, defLoss;
    if (win) {
      defLoss = Math.min(def.troops, Math.max(1, Math.round(def.troops * (0.52 + 0.24 * Math.min(1, ratio - 1)))));
      if (ratio > 1.9) defLoss = def.troops;
      atkLoss = Math.min(atkTroops, Math.max(0, Math.round(atkTroops * (0.16 + 0.16 / Math.max(1, ratio)))));
    } else {
      atkLoss = Math.min(atkTroops, Math.max(1, Math.round(atkTroops * (0.40 + 0.20 * Math.min(1, (1 / Math.max(0.5, ratio)) - 1)))));
      defLoss = Math.min(def.troops, Math.max(0, Math.round(def.troops * (0.13 + 0.14 / Math.max(1, 1 / Math.max(0.5, ratio))))));
    }
    const origAtk = atk.troops;
    const remainingAtk = Math.max(0, atkTroops - atkLoss);
    def.troops = Math.max(0, def.troops - defLoss);
    let captured = false;
    if (win && def.troops <= 0) {
      captured = true;
      atk.troops = 1;
      def.owner = atkSide;
      def.troops = Math.max(1, remainingAtk);
      def.entrench = 0;
      def.acted = true;
      atk.acted = true;
      onCapture(defId, atkSide, oldOwner);
    } else {
      atk.troops = Math.max(1, origAtk - atkLoss);
      atk.acted = true;
      def.entrench = Math.min(3, def.entrench + 1);
    }
    state.stats.battles++;
    if (atkSide === state.side && win) state.stats.wins++;
    const playerInvolved = atkSide === state.side || defSide === state.side;
    const outcome = captured ? 'bölge ele geçirildi' : win ? 'savunma geriledi' : 'taarruz püskürtüldü';
    if (playerInvolved || captured) {
      log(`${regionName(atkId)} → ${regionName(defId)}: ${outcome}. Kayıp ${atkLoss} / ${defLoss}.`, 'battle');
    }
    addFx(defId, captured ? '⚑' : win ? '✹' : '✕', captured ? '#f2d99f' : win ? '#6fb18a' : '#d06452');
    if (playerInvolved) {
      state.shake = 7;
      audio.attack();
      if (captured && atkSide === state.side) audio.capture();
      if (captured && defSide === state.side) audio.defeat();
      if (ui() && ui().battleBanner) {
        ui().battleBanner({
          win: atkSide === state.side ? captured || win : !captured && !win,
          title: captured ? `${regionName(defId)} düştü` : win ? 'Savunma geriledi' : 'Taarruz püskürtüldü',
          detail: `${regionName(atkId)} → ${regionName(defId)} · Kayıp ${atkLoss} / ${defLoss}`
        });
      }
    }
    refresh(true);
    checkVictory();
    return { win, captured, atkLoss, defLoss, atkSide, defSide, atkId, defId };
  }

  function onCapture(defId, atkSide, oldOwner) {
    const cap = isCapital(defId);
    if (oldOwner && oldOwner !== 'neutral') addMorale(oldOwner, cap ? -10 : -1);
    addMorale(atkSide, cap ? 5 : 1);
    log(`⚑ ${regionName(defId)} ${sideLabel(atkSide)} tarafından ele geçirildi${cap ? ' — başkent düştü!' : '.'}`, 'capture');
    state.stats.conquests++;
    const objs = scenarioNow().objectives[atkSide] || [];
    if (objs.some(o => o.region === defId)) log(`Hedef ele geçirildi: ${capitalName(defId)}`, 'capture');
  }

  // ------------------------------------------------------------
  // ZAFER / YENİLGİ
  // ------------------------------------------------------------
  function checkVictory() {
    if (state.over || state.mode !== 'game') return false;
    const sc = state.scenario;
    const p = state.side, e = otherSide(p);
    const pObjs = (sc.objectives[p] || []).every(o => state.regions[o.region] && state.regions[o.region].owner === p);
    const eObjs = (sc.objectives[e] || []).every(o => state.regions[o.region] && state.regions[o.region].owner === e);
    if (pObjs) return endGame('win', 'Tüm stratejik hedefler ele geçirildi.');
    if (eObjs) return endGame('lose', 'Düşman tüm stratejik hedeflerini ele geçirdi.');
    if (countRegions(e) === 0) return endGame('win', 'Düşman direnişi tamamen çöktü.');
    if (countRegions(p) === 0) return endGame('lose', 'Ordun teslim oldu; direniş sona erdi.');
    return false;
  }

  function endByScore() {
    const p = state.side, e = otherSide(p);
    const ps = scoreFor(p), es = scoreFor(e);
    if (ps > es) endGame('win', `Süre doldu. ${ps} — ${es} puanla tarih yeniden yazıldı.`);
    else if (ps < es) endGame('lose', `Süre doldu. ${es} — ${ps} puanla düşman üstün geldi.`);
    else endGame('draw', `Süre doldu. ${ps} — ${es} eşitlikle ateşkes imzalandı.`);
  }

  function endGame(result, reason) {
    if (state.over) return true;
    state.over = true;
    state.result = result;
    state.mode = 'end';
    state.aiThinking = false;
    state.eventQueue = [];
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    if (result === 'win') audio.victory(); else if (result === 'lose') audio.defeat();
    if (ui() && ui().showEnd) ui().showEnd(result, reason);
    return true;
  }

  // ------------------------------------------------------------
  // DIŞA AÇILANLAR
  // ------------------------------------------------------------
  BH.map = {
    setupCanvas, render, fitMap, zoomAt, screenToMap, mapToScreen, regionAtScreen,
    labelPos, resizeCanvas, get width() { return W; }, get height() { return H; },
    get ctx() { return ctx; }, paths, frontPoints
  };
  BH.game = {
    newGame, beginTurn, endTurn, saveGame, readSave, moveTroops, recruit, fortify,
    resolveBattle, checkVictory, endGame, endByScore, scoreFor, countRegions, totalTroops,
    calcIncome, capFor, isBorderWithEnemy, ownerOf, troopsOf, addIncome, addGold, addMorale,
    faction, moraleMod, refresh, log, state
  };
  BH.util = { clamp, sleep, shuffle, roundRect, star };
})();
