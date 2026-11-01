/* ============================================================
   BÜYÜK HARP — arayüz, olaylar, modaller, giriş
   ============================================================ */
(() => {
  'use strict';
  const BH = window.BH;
  const { state, map, game, audio, util, cam } = BH;
  const {
    SCENARIOS, REGIONS, REG, NEI, TERRAIN, OWNER, DIFF, isSea, regionName, sideLabel,
    otherSide, isCapital, capitalName, formatDate, dateForTurn, emblemSVG,
    SAVE_KEY, MONTHS
  } = BH;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ui = BH.ui = {};

  let el = {};
  let pointers = new Map();
  let drag = { active: false, lastX: 0, lastY: 0, moved: false, startX: 0, startY: 0, pinch: 0, pinching: false };
  let bannerTimer = null;
  let lastLogLen = 0;

  function init() {
    el = {
      map: $('#map'), intro: $('#intro'), game: $('#game'), end: $('#end-screen'),
      hudEmblem: $('#hud-emblem'), hudSide: $('#hud-side'), hudScenario: $('#hud-scenario'),
      hudDate: $('#hud-date'), hudTurn: $('#hud-turn'), turnFill: $('#turn-fill'),
      hudGold: $('#hud-gold'), hudIncome: $('#hud-income'), hudMorale: $('#hud-morale'),
      moraleFill: $('#morale-fill'), actionsLeft: $('#actions-left'), hint: $('#hint-text'),
      endTurn: $('#btn-end-turn'), leftPanel: $('#left-panel'), rightPanel: $('#right-panel'),
      rightEyebrow: $('#right-eyebrow'), rightTitle: $('#right-title'), regionPanel: $('#region-panel'),
      logList: $('#log-list'), objectivesList: $('#objectives-list'),
      scenarioList: $('#scenario-list'), sideList: $('#side-list'), difficultySeg: $('#difficulty-seg'),
      saveNote: $('#save-note'), btnContinue: $('#btn-continue'),
      modalLayer: $('#modal-layer'), tooltip: $('#tooltip'), toasts: $('#toasts'),
      aiBanner: $('#ai-banner'), battleBanner: $('#battle-banner'),
      endTitle: $('#end-title'), endSubtitle: $('#end-subtitle'), endStats: $('#end-stats'),
      endQuote: $('#end-quote'), endEmblem: $('#end-emblem'), endKicker: $('#end-kicker')
    };
    map.setupCanvas();
    bindEvents();
    updateSoundIcon();
    renderIntro();
    updateIntroSave();
    map.render(performance.now());
  }

  // ------------------------------------------------------------
  // GİRİŞ EKRANI
  // ------------------------------------------------------------
  function renderIntro() {
    renderScenarioList();
    renderSideList();
    renderDifficulty();
  }
  function renderScenarioList() {
    el.scenarioList.innerHTML = Object.values(SCENARIOS).map(sc => `
      <button class="scenario ${state.previewScenarioId === sc.id ? 'active' : ''}" data-scenario="${sc.id}">
        <div class="sc-year">${sc.year}</div>
        <div class="sc-body">
          <div class="sc-kicker">${esc(sc.era)}</div>
          <div class="sc-title">${esc(sc.title)}</div>
          <div class="sc-desc">${esc(sc.blurb)}</div>
        </div>
        <div class="sc-tag">${esc(sc.tag)}</div>
      </button>`).join('');
  }
  function renderSideList() {
    const sc = SCENARIOS[state.previewScenarioId] || SCENARIOS.ww2;
    el.sideList.innerHTML = ['axis', 'allies'].map(side => {
      const s = sc.sides[side];
      return `<button class="side-card ${state.previewSide === side ? 'active' : ''}" data-side="${side}">
        <div class="sc-emblem">${emblemSVG(s.emblem)}</div>
        <div class="side-name">${esc(s.name)}</div>
        <div class="side-motto">${esc(s.motto)}</div>
        <div class="side-diff">${esc(s.difficulty)}</div>
      </button>`;
    }).join('');
  }
  function renderDifficulty() {
    $$('button', el.difficultySeg).forEach(b => b.classList.toggle('active', b.dataset.diff === state.previewDifficulty));
  }
  function updateIntroSave() {
    const save = game.readSave();
    el.btnContinue.classList.toggle('hidden', !save);
    if (save) {
      const sc = SCENARIOS[save.scenarioId];
      el.saveNote.textContent = `Kayıt bulundu: ${sc ? sc.year + ' · ' : ''}Tur ${save.turn} · ${save.side === 'axis' ? 'Mihver' : 'Müttefik'}`;
    } else {
      el.saveNote.textContent = 'Her tur otomatik kaydedilir.';
    }
  }

  // ------------------------------------------------------------
  // HUD
  // ------------------------------------------------------------
  function update() {
    if (state.mode !== 'game' && state.mode !== 'end') return;
    const sc = state.scenario;
    if (!sc) return;
    const side = state.side;
    el.hudEmblem.innerHTML = emblemSVG(sc.sides[side].emblem);
    el.hudSide.textContent = sc.sides[side].name;
    el.hudScenario.textContent = `${sc.title} · ${sc.subtitle}`;
    el.hudDate.textContent = formatDate(state.date).toUpperCase();
    el.hudTurn.textContent = `TUR ${state.turn} / ${sc.maxTurns}`;
    el.turnFill.style.width = `${clamp(state.turn / sc.maxTurns * 100, 2, 100)}%`;
    const f = state.factions[side];
    el.hudGold.textContent = f.treasury;
    el.hudIncome.textContent = `+${f.income}`;
    el.hudMorale.textContent = f.morale;
    el.moraleFill.style.width = `${f.morale}%`;
    const left = Object.keys(state.regions).filter(id => state.regions[id].owner === side && !state.regions[id].acted).length;
    el.actionsLeft.textContent = `${left} HAREKÂT · ${f.treasury} ALTIN`;
    el.endTurn.disabled = state.aiThinking || state.over || state.modalOpen;
    updateHint(left);
    updateLog();
    updateObjectives();
    updateRegionPanel();
    updateSoundIcon();
  }

  function updateHint(left) {
    let text = 'Bir bölge seç, ardından komşu bölgeye saldır veya birlik taşı.';
    if (state.aiThinking) text = 'Düşman harekâtı sürüyor. Cephe hattını izle.';
    else if (state.selected && state.regions[state.selected]) {
      const r = state.regions[state.selected];
      if (r.owner === state.side) {
        text = r.acted
          ? 'Bu bölge bu tur harekâtını tamamladı. Başka bir bölge seç.'
          : 'Komşu bölgeye tıkla: yeşil taşıma, kırmızı saldırı. Sağ panelden de emir verebilirsin.';
      } else {
        text = 'Bu bölge düşman kontrolünde. Saldırmak için komşu bir bölgeni seç.';
      }
    } else if (left === 0) {
      text = 'Tüm birlikler harekâtını tamamladı. Turu bitirerek düşmanın hamlesini gör.';
    }
    el.hint.textContent = text;
  }

  function updateSoundIcon() {
    const b = $('#btn-sound');
    if (!b) return;
    b.textContent = '♪';
    b.classList.toggle('off', !audio.on);
    b.style.opacity = audio.on ? '1' : '.45';
  }

  function updateLog() {
    if (!el.logList) return;
    if (!state.log.length) { el.logList.innerHTML = '<div class="log-entry"><p>Sefer günlüğü henüz boş.</p></div>'; return; }
    const items = state.log.slice().reverse();
    el.logList.innerHTML = items.map((e, i) => {
      const meta = `<div class="log-meta">${esc(e.date || '')}${e.turn ? ' · TUR ' + e.turn : ''}</div>`;
      if (e.type === 'turn') return `<div class="log-entry turn">${meta}</div>`;
      return `<div class="log-entry ${esc(e.type)}${i === 0 && items.length > lastLogLen ? ' fresh' : ''}">${meta}<p>${esc(e.text)}</p></div>`;
    }).join('');
    lastLogLen = items.length;
  }

  function updateObjectives() {
    if (!el.objectivesList) return;
    const sc = state.scenario, p = state.side, e = otherSide(p);
    const objHtml = (side, list, title) => {
      const items = (list || []).map(o => {
        const r = state.regions[o.region];
        const done = r && r.owner === side;
        return `<div class="obj-item ${done ? 'done' : ''}">
          <div class="obj-check">${done ? '✓' : ''}</div>
          <div><div class="obj-name">${esc(o.label)}</div><div class="obj-sub">${esc(regionName(o.region))}${isCapital(o.region) ? ' · Başkent' : ''}</div></div>
        </div>`;
      }).join('');
      return `<p class="obj-head">${title}</p>${items}`;
    };
    const ta = game.totalTroops('axis'), tl = game.totalTroops('allies'), tn = game.totalTroops('neutral');
    const total = Math.max(1, ta + tl + tn);
    el.objectivesList.innerHTML = `
      ${objHtml(p, sc.objectives[p], 'SENİN HEDEFLERİN')}
      <div class="obj-divider"></div>
      ${objHtml(e, sc.objectives[e], 'DÜŞMAN HEDEFLERİ')}
      <div class="power-block">
        <p class="obj-head">GÜÇ DENGESİ</p>
        <div class="power-row"><span>${sideLabel('axis')}</span><span>${ta} birlik · ${game.countRegions('axis')} bölge</span></div>
        <div class="power-bar"><span class="p-axis" style="width:${ta / total * 100}%"></span></div>
        <div class="power-row"><span>${sideLabel('allies')}</span><span>${tl} birlik · ${game.countRegions('allies')} bölge</span></div>
        <div class="power-bar"><span class="p-allies" style="width:${tl / total * 100}%"></span></div>
        <div class="power-row"><span>Tarafsızlar</span><span>${tn} birlik · ${game.countRegions('neutral')} bölge</span></div>
        <div class="power-bar"><span class="p-neutral" style="width:${tn / total * 100}%"></span></div>
        <div class="tip-card"><h4>KOMUTANIN NOTU</h4><p>Başkentleri ele geçirmek büyük moral kaybı yaşatır. Siperler savunmayı güçlendirir; deniz harekâtları ise daha risklidir.</p></div>
      </div>`;
  }

  // ------------------------------------------------------------
  // SAĞ PANEL
  // ------------------------------------------------------------
  function updateRegionPanel() {
    if (!el.regionPanel) return;
    const id = state.selected;
    if (!id || !state.regions[id]) {
      el.rightEyebrow.textContent = 'İSTİHBARAT';
      el.rightTitle.textContent = 'CEPHE DURUMU';
      el.regionPanel.innerHTML = frontSummary();
      return;
    }
    const r = state.regions[id];
    const own = r.owner;
    const sc = state.scenario;
    el.rightEyebrow.textContent = 'BÖLGE İSTİHBARATI';
    el.rightTitle.textContent = regionName(id).toUpperCase();
    const terr = TERRAIN[REG[id].terrain] || TERRAIN.ova;
    const cap = isCapital(id);
    const seaNeighbors = (NEI[id] || []).filter(n => isSea(id, n));
    const enemyBorder = (NEI[id] || []).some(n => state.regions[n] && state.regions[n].owner !== own);
    const ownerName = own === 'neutral' ? 'Tarafsız' : sideLabel(own);
    const ownerEmblem = own === 'neutral' ? emblemSVG('neutral') : emblemSVG(sc.sides[own].emblem);
    const isMine = own === state.side;
    const f = state.factions[state.side];
    const capVal = game.capFor(id);
    const defense = Math.round((terr.def + r.entrench * 0.12) * 100);

    const neighbors = (NEI[id] || []).map(n => {
      const nr = state.regions[n];
      const relation = nr.owner === state.side ? 'own' : nr.owner === 'neutral' ? 'neutral' : 'enemy';
      const icon = isSea(id, n) ? '≈' : relation === 'own' ? '⇄' : relation === 'neutral' ? '◌' : '⚔';
      return `<button class="neighbor ${relation} ${isSea(id, n) ? 'sea' : ''}" data-neighbor="${n}">
        <span class="n-dot" style="background:${OWNER[nr.owner].color}"></span>
        <span class="n-name">${esc(regionName(n))}</span>
        <span class="n-troops">${nr.troops}</span>
        <span class="n-icon">${icon}</span>
      </button>`;
    }).join('');

    let actions = '';
    if (isMine) {
      const canRecruit = !r.recruited && r.troops < capVal && f.treasury >= 3;
      const canFort = !r.acted && r.entrench < 3 && f.treasury >= 2;
      actions = `<div class="region-actions">
        <button class="btn btn-ghost" data-action="recruit" ${canRecruit ? '' : 'disabled'}>
          <span>ASKER TOPLA</span><span class="cost">${r.recruited ? 'TAMAM' : '3 ALTIN'}</span>
        </button>
        <button class="btn btn-ghost" data-action="fortify" ${canFort ? '' : 'disabled'}>
          <span>SİPER KAZ</span><span class="cost">${r.entrench >= 3 ? 'MAKS' : '2 ALTIN'}</span>
        </button>
      </div>`;
      if (r.acted) actions += `<div class="acted-note">BU BÖLGE BU TUR HAREKÂT YAPTI</div>`;
    } else {
      actions = `<div class="region-hint">Bu bölge <b>${esc(ownerName)}</b> kontrolünde. Saldırmak için komşu bir bölgeni seç; sağdaki komşu listesini kullanabilirsin.</div>`;
    }

    el.regionPanel.innerHTML = `
      <div class="region-hero">
        <div class="region-flag">${ownerEmblem}</div>
        <div><h3 class="region-name">${esc(regionName(id))}</h3><div class="region-owner ${own}">${esc(ownerName)}</div></div>
      </div>
      <div class="region-tags">
        <span class="tag">${terr.icon} ${esc(terr.label)}</span>
        ${cap ? `<span class="tag capital">★ ${esc(capitalName(id))}</span>` : ''}
        ${seaNeighbors.length ? '<span class="tag sea">≈ Deniz kıyısı</span>' : ''}
        ${enemyBorder ? '<span class="tag">⚔ Cephe hattı</span>' : ''}
      </div>
      <div class="stat-grid">
        <div class="stat"><small>Birlik</small><b>${r.troops}<small>/ ${capVal}</small></b></div>
        <div class="stat"><small>Üretim</small><b>+${REG[id].prod}<small>/ tur</small></b></div>
        <div class="stat"><small>Siper</small><b>${r.entrench}<small>/ 3</small></b></div>
        <div class="stat"><small>Savunma</small><b>+${defense}%</b></div>
      </div>
      ${actions}
      <p class="neighbor-title">KOMŞU BÖLGELER · ${neighbors ? (NEI[id] || []).length : 0}</p>
      <div class="neighbor-list">${neighbors || '<div class="region-hint">Komşu bölge yok.</div>'}</div>
      <div class="region-hint">
        ${isMine ? `Bu bölgeden <b>${Math.max(0, r.troops - 1)}</b> birlikle taarruz edebilirsin. Siper, savunmaya <b>+12%</b> katar.` : `Arazi savunması <b>+${Math.round(terr.def * 100)}%</b>. ${seaNeighbors.length ? 'Denizden yapılan taarruzlar <b>%18</b> daha zayıftır.' : ''}`}
      </div>`;
  }

  function frontSummary() {
    const p = state.side, e = otherSide(p);
    const ta = game.totalTroops('axis'), tl = game.totalTroops('allies'), tn = game.totalTroops('neutral');
    const total = Math.max(1, ta + tl + tn);
    const pf = state.factions[p], ef = state.factions[e];
    return `<div class="front-summary">
      <p class="summary-title">Cephe Durumu</p>
      <p class="summary-sub">${esc(formatDate(state.date))} · TUR ${state.turn} / ${state.scenario.maxTurns}</p>
      <div class="balance">
        <span class="b-axis" style="width:${ta / total * 100}%"></span>
        <span class="b-allies" style="width:${tl / total * 100}%"></span>
        <span class="b-neutral" style="width:${tn / total * 100}%"></span>
      </div>
      <div class="legend-row"><span>${ta} Mihver</span><span>${tl} Müttefik</span><span>${tn} Tarafsız</span></div>
      <div class="stat-grid" style="margin-top:16px">
        <div class="stat"><small>Bölgelerin</small><b>${game.countRegions(p)}<small>/ 33</small></b></div>
        <div class="stat"><small>Düşman bölgesi</small><b>${game.countRegions(e)}</b></div>
        <div class="stat"><small>Moralin</small><b>${pf.morale}<small>/ 100</small></b></div>
        <div class="stat"><small>Düşman morali</small><b>${ef.morale}</b></div>
      </div>
      <div class="tip-card">
        <h4>KOMUTANIN NOTU</h4>
        <p>Bir bölge seçerek harekâta başla. Yeşil oklar kendi hatlarını, kırmızı oklar düşmanı gösterir. Tur sonunda düşman tüm cephelerde hamle yapar.</p>
      </div>
      <div class="tip-card">
        <h4>HEDEFLER</h4>
        <p>${(state.scenario.objectives[p] || []).map(o => `<b>${esc(o.label)}</b>`).join(' · ')} ele geçirilirse sefer kazanılır.</p>
      </div>
    </div>`;
  }

  // ------------------------------------------------------------
  // MODAL ALTYAPISI
  // ------------------------------------------------------------
  function openModal(html, opts = {}) {
    state.modalOpen = true;
    el.modalLayer.classList.remove('hidden');
    el.modalLayer.innerHTML = html;
    el.modalLayer.onclick = e => {
      if (e.target === el.modalLayer && opts.closable !== false && !state.currentEvent) closeModal();
    };
    if (opts.onOpen) opts.onOpen(el.modalLayer);
  }
  function closeModal() {
    state.modalOpen = false;
    el.modalLayer.classList.add('hidden');
    el.modalLayer.innerHTML = '';
    el.modalLayer.onclick = null;
  }
  function modalCard(body, opts = {}) {
    return `<div class="modal-card ${opts.className || ''}">
      ${opts.closable === false ? '' : `<button class="icon-btn modal-close" data-modal-close aria-label="Kapat">×</button>`}
      ${body}
    </div>`;
  }
  function bindClose(root) {
    $$('[data-modal-close]', root).forEach(b => b.onclick = () => closeModal());
  }

  // ------------------------------------------------------------
  // OLAYLAR
  // ------------------------------------------------------------
  ui.showNextEvent = function () {
    if (!state.eventQueue.length) {
      state.currentEvent = null;
      state.modalOpen = false;
      game.saveGame();
      return;
    }
    const ev = state.eventQueue.shift();
    state.currentEvent = ev;
    showEventModal(ev);
  };

  function showEventModal(ev) {
    state.modalOpen = true;
    const chips = effectChips(ev.effects);
    const paragraphs = String(ev.text || '').split('\n\n').map(p => `<p class="modal-text">${esc(p)}</p>`).join('');
    const choices = ev.choices ? `<div class="choice-list">${ev.choices.map((c, i) => `
      <button class="choice" data-choice="${i}"><b>${esc(c.label)}</b><span>${esc(c.hint || '')}</span></button>`).join('')}</div>` : '';
    const actions = ev.choices ? '' : `<div class="modal-actions"><button class="btn btn-gold" id="event-continue">DEVAM</button></div>`;
    const html = modalCard(`
      <div class="modal-kicker"><span>${esc(ev.kicker || 'TARİHÎ OLAY')}</span><span class="rule"></span><span class="modal-date">${esc(ev.date || formatDate(state.date))}</span></div>
      <h2 class="modal-title">${esc(ev.title)}</h2>
      <p class="modal-sub">${esc(ev.subtitle || 'Tarihin akışı değişiyor')}</p>
      <div class="modal-rule"></div>
      ${paragraphs}
      <div class="effect-list">${chips}</div>
      ${choices}
      ${actions}
    `, { closable: false, className: 'event-modal' });
    openModal(html, { closable: false });
    if (ev.choices) {
      $$('[data-choice]', el.modalLayer).forEach(b => b.onclick = () => {
        const c = ev.choices[+b.dataset.choice];
        finishEvent(ev, c);
      });
    } else {
      const b = $('#event-continue');
      if (b) b.onclick = () => finishEvent(ev, null);
    }
    audio.event();
  }

  function finishEvent(ev, choice) {
    applyEffects(choice ? choice.effects : ev.effects);
    game.log(`${ev.title}${choice ? ' — ' + choice.label : ''}`, 'event');
    state.currentEvent = null;
    closeModal();
    game.refresh(false);
    game.checkVictory();
    game.saveGame();
    ui.showNextEvent();
  }

  function applyEffects(effects = []) {
    for (const e of effects) {
      if (e.type === 'troops') {
        const r = state.regions[e.region];
        if (!r) continue;
        if (e.side && r.owner !== e.side) continue;
        r.troops = clamp(r.troops + (e.amount || 0), 0, game.capFor(e.region));
      } else if (e.type === 'join') {
        const ids = e.regions || [e.region];
        for (const id of ids) {
          const r = state.regions[id];
          if (!r) continue;
          if (r.owner !== 'neutral' && !e.force) continue;
          r.owner = e.side;
          r.troops = Math.min(game.capFor(id), r.troops + (e.amount || 2));
          r.entrench = 0;
          game.log(`${regionName(id)} ${sideLabel(e.side)} safına geçti.`, 'event');
        }
      } else if (e.type === 'gold') {
        game.addGold(e.side, e.amount);
      } else if (e.type === 'morale') {
        game.addMorale(e.side, e.amount);
      } else if (e.type === 'entrenchAll') {
        for (const id of Object.keys(state.regions)) {
          if (state.regions[id].owner !== 'neutral') state.regions[id].entrench = clamp(state.regions[id].entrench + (e.amount || 1), 0, 3);
        }
      } else if (e.type === 'leave') {
        const ids = e.regions || [e.region];
        for (const id of ids) {
          const r = state.regions[id];
          if (!r || r.owner !== e.side) continue;
          r.owner = 'neutral';
          r.troops = Math.min(2, r.troops);
          r.entrench = 0;
          game.log(`${regionName(id)} savaştan çekildi; bölge tarafsızlaştı.`, 'event');
        }
      }
    }
  }

  function effectChips(effects = []) {
    return effects.map(e => {
      if (e.type === 'troops') return `<span class="effect-chip">${e.amount > 0 ? '+' : ''}${e.amount} birlik · ${esc(regionName(e.region))}</span>`;
      if (e.type === 'join') return `<span class="effect-chip">${(e.regions || [e.region]).map(id => esc(regionName(id))).join(', ')} → ${esc(sideLabel(e.side))}</span>`;
      if (e.type === 'gold') return `<span class="effect-chip">${esc(sideLabel(e.side))} +${e.amount} altın</span>`;
      if (e.type === 'morale') return `<span class="effect-chip">${esc(sideLabel(e.side))} moral ${e.amount > 0 ? '+' : ''}${e.amount}</span>`;
      if (e.type === 'entrenchAll') return `<span class="effect-chip">Tüm cephelerde siper +${e.amount}</span>`;
      if (e.type === 'leave') return `<span class="effect-chip">${(e.regions || [e.region]).map(id => esc(regionName(id))).join(', ')} tarafsızlaşır</span>`;
      return '';
    }).filter(Boolean).join('');
  }

  // ------------------------------------------------------------
  // TAARRUZ / NAKLİYE
  // ------------------------------------------------------------
  function showAttackDialog(atkId, defId) {
    const atk = state.regions[atkId], def = state.regions[defId];
    if (!atk || !def) return;
    if (atk.owner !== state.side) { toast('Sadece kendi bölgelerinden taarruz edebilirsin.', 'bad'); return; }
    if (atk.acted) { toast('Bu bölge bu tur harekât yaptı.', 'bad'); return; }
    if (atk.troops <= 1) { toast('Taarruz için en az 2 birlik gerekir.', 'bad'); return; }
    const sea = isSea(atkId, defId);
    const d = DIFF[state.difficulty];
    const atkPower = (atk.troops - 1) * game.moraleMod(atk.owner) * (sea ? 0.82 : 1);
    const defPower = Math.max(0.5, def.troops * game.moraleMod(def.owner) *
      (1 + (TERRAIN[REG[defId].terrain] ? TERRAIN[REG[defId].terrain].def : 0) + def.entrench * 0.12) * (sea ? 1.12 : 1));
    const chance = Math.round(100 * (atkPower * atkPower) / (atkPower * atkPower + defPower * defPower));
    const terr = TERRAIN[REG[defId].terrain] || TERRAIN.ova;
    const mods = [];
    mods.push({ label: `Arazi · ${terr.label}`, value: `+${Math.round(terr.def * 100)}% savunma`, good: false });
    if (def.entrench) mods.push({ label: 'Siper seviyesi', value: `+${Math.round(def.entrench * 12)}% savunma`, good: false });
    if (sea) mods.push({ label: 'Deniz harekâtı', value: '−18% taarruz · +12% savunma', good: false });
    mods.push({ label: 'Moral', value: `${state.factions[state.side].morale} / 100`, good: true });
    mods.push({ label: 'Zorluk', value: d.label, good: true });
    const neutralWarn = def.owner === 'neutral'
      ? `<div class="region-hint" style="margin-bottom:16px">Tarafsız bir devlete saldırmak, onları düşman safına iter ve dünya kamuoyunu kışkırtır. Yine de stratejik bir kapı açabilir.</div>` : '';
    const html = modalCard(`
      <div class="modal-kicker"><span>SALDIRI EMRİ</span><span class="rule"></span><span class="modal-date">${esc(formatDate(state.date))}</span></div>
      <h2 class="modal-title">TAARRUZ</h2>
      <p class="modal-sub">${esc(regionName(atkId))} → ${esc(regionName(defId))}</p>
      <div class="force-grid">
        <div class="force-box attacker"><div class="fb-name">${esc(regionName(atkId))}</div><div class="fb-troops">${Math.max(0, atk.troops - 1)}</div><div class="fb-side" style="color:${OWNER[atk.owner].light}">TAARRUZ GÜCÜ</div></div>
        <div class="force-vs">VS</div>
        <div class="force-box defender"><div class="fb-name">${esc(regionName(defId))}</div><div class="fb-troops">${def.troops}</div><div class="fb-side" style="color:${OWNER[def.owner].light}">SAVUNMA</div></div>
      </div>
      <div class="odds-row"><div class="odds-track"><span style="width:${chance}%"></span></div><div class="odds-value">%${chance}</div></div>
      <div class="odds-label">TAHMİNİ BAŞARI ORANI</div>
      <div class="modifier-list">${mods.map(m => `<div class="modifier ${m.good ? 'good' : 'bad'}"><span>${esc(m.label)}</span><b>${esc(m.value)}</b></div>`).join('')}</div>
      ${neutralWarn}
      <div class="modal-actions">
        <button class="btn btn-ghost" id="attack-cancel">VAZGEÇ</button>
        <button class="btn btn-danger" id="attack-confirm">TAARRUZU BAŞLAT</button>
      </div>
    `, { className: 'attack-modal' });
    openModal(html, { closable: true });
    bindClose(el.modalLayer);
    $('#attack-cancel').onclick = () => closeModal();
    $('#attack-confirm').onclick = () => {
      closeModal();
      audio.attack();
      const res = game.resolveBattle(atkId, defId);
      if (!res) toast('Taarruz gerçekleştirilemedi.', 'bad');
      update();
    };
  }

  function showMoveDialog(fromId, toId) {
    const from = state.regions[fromId], to = state.regions[toId];
    if (!from || !to) return;
    if (from.owner !== state.side || to.owner !== state.side) return;
    const max = Math.min(Math.max(0, from.troops - 1), Math.max(0, game.capFor(toId) - to.troops));
    if (max < 1) { toast('Hedef bölgede yer yok veya kaynakta yeterli birlik yok.', 'bad'); return; }
    const initial = Math.max(1, Math.ceil(max / 2));
    const sea = isSea(fromId, toId);
    const html = modalCard(`
      <div class="modal-kicker"><span>BİRLİK NAKLİYESİ</span><span class="rule"></span><span class="modal-date">${esc(formatDate(state.date))}</span></div>
      <h2 class="modal-title">BİRLİK TAŞI</h2>
      <p class="modal-sub">${esc(regionName(fromId))} → ${esc(regionName(toId))}${sea ? ' · deniz yolu' : ''}</p>
      <div class="force-grid">
        <div class="force-box attacker"><div class="fb-name">${esc(regionName(fromId))}</div><div class="fb-troops">${from.troops}</div><div class="fb-side" style="color:${OWNER[from.owner].light}">MEVCUT</div></div>
        <div class="force-vs">→</div>
        <div class="force-box defender"><div class="fb-name">${esc(regionName(toId))}</div><div class="fb-troops">${to.troops}</div><div class="fb-side" style="color:${OWNER[to.owner].light}">HEDEF</div></div>
      </div>
      <div class="range-row"><input id="move-range" type="range" min="1" max="${max}" value="${initial}"><div class="range-value" id="move-value">${initial}</div></div>
      <div class="quick-row">
        <button data-move="1">1 BİRLİK</button>
        <button data-move="half">YARISI</button>
        <button data-move="all">TÜMÜ</button>
      </div>
      <div class="region-hint" style="margin-bottom:18px">Kaynak bölgede en az 1 birlik kalır. Hedef bölge kapasitesi: <b>${game.capFor(toId)}</b>.</div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="move-cancel">VAZGEÇ</button>
        <button class="btn btn-gold" id="move-confirm">BİRLİKLERİ GÖNDER</button>
      </div>
    `, { className: 'move-modal' });
    openModal(html, { closable: true });
    bindClose(el.modalLayer);
    const range = $('#move-range'), value = $('#move-value');
    const setVal = v => { range.value = clamp(Math.round(v), 1, max); value.textContent = range.value; };
    range.oninput = () => value.textContent = range.value;
    $$('[data-move]', el.modalLayer).forEach(b => b.onclick = () => {
      const v = b.dataset.move === 'all' ? max : b.dataset.move === 'half' ? Math.ceil(max / 2) : 1;
      setVal(v);
    });
    $('#move-cancel').onclick = () => closeModal();
    $('#move-confirm').onclick = () => {
      const amount = +range.value;
      closeModal();
      if (!game.moveTroops(fromId, toId, amount)) toast('Nakliye gerçekleştirilemedi.', 'bad');
      update();
    };
  }

  // ------------------------------------------------------------
  // MENÜ / YARDIM / ONAY
  // ------------------------------------------------------------
  function showMenu() {
    const html = modalCard(`
      <div class="modal-kicker"><span>KARARGAH</span><span class="rule"></span><span class="modal-date">${esc(formatDate(state.date))}</span></div>
      <h2 class="modal-title">SEFER MENÜSÜ</h2>
      <p class="modal-sub">${esc(state.scenario.title)} · Tur ${state.turn}</p>
      <div class="menu-list">
        <button class="menu-item" data-menu="save"><b>SEFERİ KAYDET</b><span>Manuel kayıt</span></button>
        <button class="menu-item" data-menu="journal"><b>SEFER GÜNLÜĞÜ</b><span>Olaylar ve hedefler</span></button>
        <button class="menu-item" data-menu="help"><b>NASIL OYNANIR</b><span>Kurallar ve ipuçları</span></button>
        <button class="menu-item" data-menu="sound"><b>SES: ${audio.on ? 'AÇIK' : 'KAPALI'}</b><span>Müzik ve efektler</span></button>
        <button class="menu-item" data-menu="restart"><b>YENİDEN BAŞLAT</b><span>Bu seferi sıfırla</span></button>
        <button class="menu-item" data-menu="menu"><b>ANA MENÜ</b><span>Sefer seçimine dön</span></button>
      </div>
    `);
    openModal(html, { closable: true });
    bindClose(el.modalLayer);
    $$('[data-menu]', el.modalLayer).forEach(b => b.onclick = () => {
      const m = b.dataset.menu;
      if (m === 'save') { game.saveGame(); toast('Sefer kaydedildi.', 'good'); closeModal(); }
      else if (m === 'journal') { closeModal(); openLeftPanel(); }
      else if (m === 'help') { closeModal(); showHelp(); }
      else if (m === 'sound') { audio.toggle(); updateSoundIcon(); closeModal(); toast(audio.on ? 'Ses açıldı.' : 'Ses kapatıldı.'); }
      else if (m === 'restart') { closeModal(); showConfirm('SEFERİ YENİDEN BAŞLAT', 'Bu seferdeki tüm ilerleme silinecek. Emin misin?', () => game.newGame(state.scenarioId, state.side, state.difficulty)); }
      else if (m === 'menu') { closeModal(); showIntro(); }
    });
  }

  function showHelp() {
    const html = modalCard(`
      <div class="modal-kicker"><span>SAVAŞ OKULU</span><span class="rule"></span><span class="modal-date">KOMUTAN EL KİTABI</span></div>
      <h2 class="modal-title">NASIL OYNANIR?</h2>
      <p class="modal-sub">Harita, ordular ve tarih senin elinde.</p>
      <div class="help-steps">
        <div class="help-step"><div class="help-num">1</div><div><b>BÖLGE SEÇ</b><p>Haritada bir bölgeye dokun. Sağ panelde birlik, üretim, siper ve komşular görünür.</p></div></div>
        <div class="help-step"><div class="help-num">2</div><div><b>KOMŞUYA EMİR VER</b><p>Kendi bölgen seçiliyken komşu bir bölgeye tıkla. Kendi bölgense birlik taşırsın; düşmansa taarruz emri açılır.</p></div></div>
        <div class="help-step"><div class="help-num">3</div><div><b>ORDUNU GÜÇLENDİR</b><p>Altınla asker topla veya siper kaz. Her bölge turda bir kez asker toplayabilir; siper savunmayı artırır.</p></div></div>
        <div class="help-step"><div class="help-num">4</div><div><b>TURU BİTİR</b><p>Turu bitirdiğinde düşman tüm cephelerde hamle yapar. Yeni turda gelir toplar, tarihî olaylar tetiklenir.</p></div></div>
        <div class="help-step"><div class="help-num">5</div><div><b>HEDEFLERİ ELE GEÇİR</b><p>Hedef başkentleri alarak seferi kazan. Moral düşen taraf daha zayıf savaşır; başkent kaybı büyük moral kaybıdır.</p></div></div>
      </div>
      <div class="help-legend">
        <span><i style="background:${OWNER.axis.color}"></i> Mihver / İttifak</span>
        <span><i style="background:${OWNER.allies.color}"></i> Müttefik / İtilaf</span>
        <span><i style="background:${OWNER.neutral.color}"></i> Tarafsız</span>
        <span><i style="background:#d3af69"></i> Başkent / hedef</span>
        <span><i style="background:#6fb18a"></i> Kendi hattın</span>
        <span><i style="background:#d06452"></i> Düşman hattı</span>
      </div>
      <div class="modal-actions"><button class="btn btn-gold" data-modal-close>ANLADIM</button></div>
    `);
    openModal(html, { closable: true });
    bindClose(el.modalLayer);
  }

  function showConfirm(title, text, onYes) {
    const html = modalCard(`
      <div class="modal-kicker"><span>ONAY</span><span class="rule"></span></div>
      <h2 class="modal-title">${esc(title)}</h2>
      <p class="modal-text">${esc(text)}</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="confirm-cancel">VAZGEÇ</button>
        <button class="btn btn-danger" id="confirm-yes">EVET, DEVAM ET</button>
      </div>
    `, { closable: true });
    openModal(html, { closable: true });
    bindClose(el.modalLayer);
    $('#confirm-cancel').onclick = () => closeModal();
    $('#confirm-yes').onclick = () => { closeModal(); onYes(); };
  }

  // ------------------------------------------------------------
  // SON EKRAN
  // ------------------------------------------------------------
  ui.showEnd = function (result, reason) {
    closeModal();
    const sc = state.scenario;
    const side = state.side;
    el.endEmblem.innerHTML = emblemSVG(sc.sides[side].emblem);
    el.endKicker.textContent = result === 'win' ? 'SEFER TAMAMLANDI' : result === 'lose' ? 'SEFER SONA ERDİ' : 'ATEŞKES';
    el.endTitle.textContent = result === 'win' ? 'ZAFER' : result === 'lose' ? 'YENİLGİ' : 'ATEŞKES';
    el.endSubtitle.textContent = reason;
    const score = game.scoreFor(side);
    el.endStats.innerHTML = `
      <div class="end-stat"><b>${state.turn}</b><span>TUR</span></div>
      <div class="end-stat"><b>${state.stats.battles}</b><span>MUHAREBE</span></div>
      <div class="end-stat"><b>${state.stats.conquests}</b><span>FETHEDİLEN</span></div>
      <div class="end-stat"><b>${game.countRegions(side)}</b><span>BÖLGE</span></div>
      <div class="end-stat"><b>${state.factions[side].morale}</b><span>MORAL</span></div>
      <div class="end-stat"><b>${score}</b><span>PUAN</span></div>`;
    const quotes = {
      win: ['Tarih bu kez senin adını yazdı. Harita, bir imparatorluğun hayalinden daha fazlasını anlatıyor.', 'Zafer, doğru anda doğru yerde olmanın sanatıdır.'],
      lose: ['Her yenilgi, bir sonraki zaferin ilk dersidir. Tarih acımasız ama adildir.', 'Harita yeniden çizildi; ama mücadele bitmedi.'],
      draw: ['Ne kazanan ne kaybeden. Sadece yorgun ordular ve yarım kalmış bir tarih.', 'Ateşkes, barış değildir; sadece bir sonraki hamle için nefes almaktır.']
    };
    const q = quotes[result] || quotes.draw;
    el.endQuote.textContent = '“' + q[Math.floor(Math.random() * q.length)] + '”';
    el.end.classList.remove('hidden');
    el.aiBanner.classList.add('hidden');
    el.battleBanner.classList.add('hidden');
    state.modalOpen = false;
    update();
  };

  // ------------------------------------------------------------
  // OYUN / GİRİŞ GEÇİŞLERİ
  // ------------------------------------------------------------
  ui.enterGame = function () {
    el.intro.classList.add('hidden');
    el.end.classList.add('hidden');
    el.game.classList.remove('hidden');
    closePanels();
    map.fitMap();
    update();
    document.title = `Büyük Harp — ${state.scenario.title}`;
  };

  function startNewGame() {
    closeModal();
    audio.init();
    audio.click();
    game.newGame(state.previewScenarioId, state.previewSide, state.previewDifficulty);
  }

  function restoreGame(save) {
    const sc = SCENARIOS[save.scenarioId];
    if (!sc) { toast('Kayıt yüklenemedi.', 'bad'); return; }
    state.mode = 'game';
    state.scenarioId = sc.id;
    state.scenario = sc;
    state.previewScenarioId = sc.id;
    state.side = save.side === 'allies' ? 'allies' : 'axis';
    state.previewSide = state.side;
    state.difficulty = save.difficulty || 'normal';
    state.turn = save.turn || 1;
    state.date = dateForTurn(sc.start, state.turn, sc.monthsPerTurn || 1);
    state.regions = {};
    for (const r of REGIONS) {
      const s = save.regions[r.id];
      state.regions[r.id] = s ? {
        owner: s.owner || 'neutral',
        troops: s.troops ?? 1,
        entrench: s.entrench || 0,
        acted: !!s.acted,
        recruited: !!s.recruited
      } : {
        owner: sc.owners[r.id] || 'neutral',
        troops: sc.troops[r.id] ?? 3,
        entrench: 0, acted: false, recruited: false
      };
    }
    state.factions = {
      axis: { treasury: 0, morale: 50, income: 0, ...(save.factions && save.factions.axis) },
      allies: { treasury: 0, morale: 50, income: 0, ...(save.factions && save.factions.allies) }
    };
    state.log = Array.isArray(save.log) ? save.log : [];
    state.stats = { battles: 0, wins: 0, conquests: 0, ...(save.stats || {}) };
    state.fired = new Set(save.fired || []);
    state.eventQueue = [];
    state.currentEvent = null;
    state.selected = null;
    state.hovered = null;
    state.aiThinking = false;
    state.modalOpen = false;
    state.over = false;
    state.result = null;
    state.fx = [];
    state.shake = 0;
    ui.enterGame();
    updateIntroSave();
    toast('Kayıt yüklendi. Cephe seni bekliyor.', 'good');
  }

  function showIntro() {
    state.mode = 'intro';
    state.previewScenarioId = state.scenarioId || state.previewScenarioId || 'ww2';
    state.previewSide = state.side || 'axis';
    state.scenario = null;
    state.selected = null;
    state.hovered = null;
    state.aiThinking = false;
    state.over = false;
    state.eventQueue = [];
    state.currentEvent = null;
    closeModal();
    closePanels();
    el.game.classList.add('hidden');
    el.end.classList.add('hidden');
    el.intro.classList.remove('hidden');
    el.tooltip.classList.add('hidden');
    map.fitMap();
    renderIntro();
    updateIntroSave();
    document.title = 'Büyük Harp — Tarihî Strateji';
  }

  // ------------------------------------------------------------
  // HARİTA GİRDİSİ
  // ------------------------------------------------------------
  function pointerPos(e) {
    const rect = el.map.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }
  function pinchDistance() {
    const p = [...pointers.values()];
    if (p.length < 2) return 0;
    return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  }
  function pinchMid() {
    const p = [...pointers.values()];
    const rect = el.map.getBoundingClientRect();
    return { x: (p[0].x + p[1].x) / 2 - rect.left, y: (p[0].y + p[1].y) / 2 - rect.top };
  }

  function onPointerDown(e) {
    audio.init();
    if (state.mode !== 'game' || state.modalOpen || state.aiThinking || state.over) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    el.tooltip.classList.add('hidden');
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { el.map.setPointerCapture(e.pointerId); } catch (err) {}
    if (pointers.size === 1) {
      drag.active = true;
      drag.lastX = e.clientX; drag.lastY = e.clientY;
      drag.startX = e.clientX; drag.startY = e.clientY;
      drag.moved = false; drag.pinching = false;
      el.map.classList.add('dragging');
    } else if (pointers.size === 2) {
      drag.pinching = true; drag.moved = true;
      drag.pinch = pinchDistance();
    }
  }

  function onPointerMove(e) {
    if (!pointers.has(e.pointerId)) {
      if (e.pointerType === 'mouse') updateHover(e);
      return;
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      const d = pinchDistance();
      if (drag.pinch && d) {
        const mid = pinchMid();
        map.zoomAt(d / drag.pinch, mid.x, mid.y);
      }
      drag.pinch = d;
      drag.moved = true;
      return;
    }
    if (!drag.active) return;
    const dx = e.clientX - drag.lastX, dy = e.clientY - drag.lastY;
    if (Math.abs(dx) + Math.abs(dy) > 1) drag.moved = true;
    cam.x += dx; cam.y += dy;
    map.zoomAt(1, e.clientX, e.clientY);
    drag.lastX = e.clientX; drag.lastY = e.clientY;
  }

  function onPointerUp(e) {
    if (!pointers.has(e.pointerId)) return;
    const wasPinching = drag.pinching;
    pointers.delete(e.pointerId);
    try { el.map.releasePointerCapture(e.pointerId); } catch (err) {}
    if (pointers.size === 0) {
      el.map.classList.remove('dragging');
      if (!wasPinching && !drag.moved && state.mode === 'game' && !state.modalOpen && !state.aiThinking && !state.over) {
        const [x, y] = pointerPos(e);
        clickMap(x, y);
      }
      drag.active = false; drag.pinching = false; drag.pinch = 0;
    } else if (pointers.size === 1) {
      const p = [...pointers.values()][0];
      drag.active = true; drag.lastX = p.x; drag.lastY = p.y;
      drag.pinching = false; drag.moved = true;
    }
  }

  function onPointerCancel(e) {
    pointers.delete(e.pointerId);
    if (!pointers.size) { drag.active = false; drag.pinching = false; el.map.classList.remove('dragging'); }
  }

  function updateHover(e) {
    if (state.mode !== 'game' || state.modalOpen || state.aiThinking || state.over) {
      state.hovered = null; el.tooltip.classList.add('hidden'); return;
    }
    const [x, y] = pointerPos(e);
    const id = map.regionAtScreen(x, y);
    state.hovered = id;
    if (!id || !state.regions[id]) { el.tooltip.classList.add('hidden'); return; }
    const r = state.regions[id];
    const own = r.owner;
    const side = own === 'neutral' ? 'Tarafsız' : sideLabel(own);
    el.tooltip.innerHTML = `<div class="tt-name">${esc(regionName(id))}</div><div class="tt-owner" style="color:${OWNER[own].light}">${esc(side)}</div><div class="tt-line">${r.troops} birlik · +${REG[id].prod} üretim${isCapital(id) ? ' · ★ başkent' : ''}</div>`;
    const rect = el.map.getBoundingClientRect();
    let left = e.clientX + 14, top = e.clientY + 14;
    if (left + 190 > window.innerWidth) left = e.clientX - 196;
    if (top + 80 > window.innerHeight) top = e.clientY - 80;
    el.tooltip.style.left = left + 'px';
    el.tooltip.style.top = top + 'px';
    el.tooltip.classList.remove('hidden');
  }

  function clickMap(sx, sy) {
    const id = map.regionAtScreen(sx, sy);
    if (!id) {
      state.selected = null;
      closeRightPanel();
      update();
      return;
    }
    if (state.selected && state.selected !== id && (NEI[state.selected] || []).includes(id)) {
      const sel = state.selected;
      if (state.regions[sel] && state.regions[sel].owner === state.side) {
        if (state.regions[id].owner === state.side) showMoveDialog(sel, id);
        else showAttackDialog(sel, id);
        return;
      }
    }
    if (state.selected === id) {
      state.selected = null;
      closeRightPanel();
      update();
      return;
    }
    selectRegion(id);
  }

  function selectRegion(id) {
    state.selected = id;
    audio.select();
    update();
    if (window.innerWidth <= 900) openRightPanel();
  }

  function onNeighborClick(n) {
    const sel = state.selected;
    if (!sel) return;
    if (!state.regions[sel] || state.regions[sel].owner !== state.side) { selectRegion(n); return; }
    if (state.regions[n].owner === state.side) showMoveDialog(sel, n);
    else showAttackDialog(sel, n);
  }

  // ------------------------------------------------------------
  // PANELLER
  // ------------------------------------------------------------
  function openLeftPanel() { el.leftPanel.classList.add('open'); }
  function closeLeftPanel() { el.leftPanel.classList.remove('open'); }
  function openRightPanel() { el.rightPanel.classList.add('open'); }
  function closeRightPanel() { el.rightPanel.classList.remove('open'); }
  function closePanels() { closeLeftPanel(); closeRightPanel(); }

  function toast(text, type = '') {
    const d = document.createElement('div');
    d.className = `toast ${type}`;
    d.textContent = text;
    el.toasts.appendChild(d);
    setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 260); }, 2600);
    while (el.toasts.children.length > 4) el.toasts.firstChild.remove();
  }
  ui.toast = toast;

  ui.showAiBanner = function (show) {
    el.aiBanner.classList.toggle('hidden', !show);
  };

  ui.battleBanner = function ({ win, title, detail }) {
    el.battleBanner.className = `battle-banner ${win ? 'win' : 'loss'}`;
    el.battleBanner.innerHTML = `<div class="bb-kicker">${win ? 'CEPHE RAPORU · BAŞARI' : 'CEPHE RAPORU · KAYIP'}</div><div class="bb-title">${esc(title)}</div><div class="bb-detail">${esc(detail)}</div>`;
    el.battleBanner.classList.remove('hidden');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.battleBanner.classList.add('hidden'), 2800);
  };

  // ------------------------------------------------------------
  // OLAY BAĞLAMA
  // ------------------------------------------------------------
  function bindEvents() {
    el.scenarioList.addEventListener('click', e => {
      const b = e.target.closest('[data-scenario]');
      if (!b) return;
      state.previewScenarioId = b.dataset.scenario;
      state.previewSide = 'axis';
      audio.click();
      renderIntro();
      map.fitMap();
    });
    el.sideList.addEventListener('click', e => {
      const b = e.target.closest('[data-side]');
      if (!b) return;
      state.previewSide = b.dataset.side;
      audio.click();
      renderSideList();
    });
    el.difficultySeg.addEventListener('click', e => {
      const b = e.target.closest('[data-diff]');
      if (!b) return;
      state.previewDifficulty = b.dataset.diff;
      audio.click();
      renderDifficulty();
    });
    $('#btn-start').onclick = startNewGame;
    el.btnContinue.onclick = () => {
      const save = game.readSave();
      if (save) restoreGame(save); else { updateIntroSave(); toast('Kayıt bulunamadı.', 'bad'); }
    };
    $('#btn-how').onclick = () => { audio.click(); showHelp(); };

    $('#btn-menu').onclick = () => { audio.click(); showMenu(); };
    $('#btn-journal').onclick = () => { audio.click(); el.leftPanel.classList.toggle('open'); };
    $('#btn-help').onclick = () => { audio.click(); showHelp(); };
    $('#btn-sound').onclick = () => { audio.toggle(); updateSoundIcon(); toast(audio.on ? 'Ses açıldı.' : 'Ses kapatıldı.'); };
    $('#btn-close-left').onclick = closeLeftPanel;
    $('#btn-close-right').onclick = () => { closeRightPanel(); state.selected = null; update(); };
    $('#btn-zoom-in').onclick = () => { audio.click(); map.zoomAt(1.22); };
    $('#btn-zoom-out').onclick = () => { audio.click(); map.zoomAt(0.82); };
    $('#btn-center').onclick = () => { audio.click(); map.fitMap(); };
    el.endTurn.onclick = () => { if (!state.modalOpen) game.endTurn(); };

    $$('.tab').forEach(t => t.onclick = () => {
      $$('.tab').forEach(x => x.classList.toggle('active', x === t));
      el.logList.classList.toggle('hidden', t.dataset.tab !== 'log');
      el.objectivesList.classList.toggle('hidden', t.dataset.tab !== 'objectives');
    });

    el.regionPanel.addEventListener('click', e => {
      const nb = e.target.closest('[data-neighbor]');
      if (nb) { audio.click(); onNeighborClick(nb.dataset.neighbor); return; }
      const act = e.target.closest('[data-action]');
      if (act) {
        if (!state.selected) return;
        if (act.dataset.action === 'recruit') game.recruit(state.selected);
        else if (act.dataset.action === 'fortify') game.fortify(state.selected);
        update();
      }
    });

    $('#btn-replay').onclick = () => { audio.click(); showIntro(); };
    $('#btn-end-menu').onclick = () => { audio.click(); showIntro(); };

    el.map.addEventListener('pointerdown', onPointerDown);
    el.map.addEventListener('pointermove', onPointerMove);
    el.map.addEventListener('pointerup', onPointerUp);
    el.map.addEventListener('pointercancel', onPointerCancel);
    el.map.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !drag.active) { state.hovered = null; el.tooltip.classList.add('hidden'); } });
    el.map.addEventListener('wheel', e => {
      if (state.mode !== 'game' || state.modalOpen) return;
      e.preventDefault();
      const [x, y] = pointerPos(e);
      map.zoomAt(e.deltaY < 0 ? 1.12 : 0.89, x, y);
    }, { passive: false });
    el.map.addEventListener('contextmenu', e => {
      e.preventDefault();
      state.selected = null;
      closeRightPanel();
      update();
    });

    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (state.modalOpen) {
          if (!state.currentEvent) closeModal();
        } else if (state.selected) {
          state.selected = null; closeRightPanel(); update();
        }
      }
      if (state.mode === 'game' && !state.modalOpen && !state.aiThinking) {
        if (e.key === '+' || e.key === '=') map.zoomAt(1.18);
        if (e.key === '-') map.zoomAt(0.85);
        if (e.key === ' ') { e.preventDefault(); if (!state.over) game.endTurn(); }
      }
    });
    document.addEventListener('pointerdown', () => audio.init(), { once: true });
    window.addEventListener('resize', () => {
      if (state.mode === 'game') update();
    });
  }

  // motorun çağırdığı arayüz kancaları
  ui.update = update;
  ui.updateLog = updateLog;
  ui.closePanels = closePanels;
  ui.openLeftPanel = openLeftPanel;
  ui.openRightPanel = openRightPanel;
  ui.selectRegion = selectRegion;
  ui.clickMap = clickMap;
  ui.showAttackDialog = showAttackDialog;
  ui.showMoveDialog = showMoveDialog;

  init();
})();
