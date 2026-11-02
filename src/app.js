(function () {
  'use strict';
  const GEO = window.GEO;
  const $ = s => document.querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const TOPICS = [
    { id: 'geo', name: '지정학·분쟁' }, { id: 'res', name: '자원·에너지' }, { id: 'env', name: '물·기후·환경' }, { id: 'land', name: '지형·자연재해' },
    { id: 'pop', name: '인구·도시·이주' }, { id: 'econ', name: '경제·교통·교역' }, { id: 'cult', name: '종교·민족·문화' }, { id: 'hist', name: '역사지리·유산' }];
  const TN = Object.fromEntries(TOPICS.map(t => [t.id, t.name]));
  const tc = id => `var(--t-${id})`;
  const C = {}; GEO.countries.forEach(c => { C[c.code] = c; c.bb = bboxOf(c.d); });
  const SP = {}; GEO.spots.forEach(s => SP[s.id] = s);
  const GROUPS = ['서남아시아', '코카서스', '중앙아시아', '남부아시아', '중국(신장)', '중국(티베트)'];
  function bboxOf(d) {
    const n = d.match(/-?\d+(\.\d+)?/g).map(Number); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i + 1 < n.length; i += 2) { x0 = Math.min(x0, n[i]); x1 = Math.max(x1, n[i]); y0 = Math.min(y0, n[i + 1]); y1 = Math.max(y1, n[i + 1]); }
    return [x0, y0, x1, y1];
  }
  const union = bbs => bbs.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])], [1e9, 1e9, -1e9, -1e9]);
  const HOME = union(GEO.countries.filter(c => c.code !== 'MDV').map(c => c.bb));

  /* ---------- 날짜 ---------- */
  const todayKST = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const TODAY = todayKST();
  const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400e3);
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const fmtDate = s => { const d = new Date(s + 'T00:00:00Z'); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${DOW[d.getUTCDay()]})`; };
  const ageLabel = a => a === 0 ? '오늘' : a === 1 ? '어제' : a + '일 전';

  /* ---------- 상태 ---------- */
  let ITEMS = [], DATA = null;
  const S = { view: 'map', sel: null, hover: null, topics: new Set(TOPICS.map(t => t.id)), aDate: 'all', aTopics: new Set(TOPICS.map(t => t.id)), aCountry: '' };
  const age = it => dayDiff(it.added, TODAY);
  const onMap = it => { const a = age(it); return a >= 0 && a <= 2; };
  const inWeek = it => { const a = age(it); return a >= 0 && a <= 6; };
  const placeName = code => C[code] ? C[code].name : code;

  /* ---------- 테마 ---------- */
  function setTheme(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem('gn_theme', t); } catch (e) { } }
  let theme; try { theme = localStorage.getItem('gn_theme'); } catch (e) { }
  if (!theme) theme = matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  setTheme(theme);
  $('#theme').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

  /* ---------- 지도 ---------- */
  const svg = $('#map'), world = $('#world'), overlay = $('#overlay'), wrap = $('#mapwrap');
  const T = { k: 1, x: 0, y: 0 };
  let kHome = 1, userMoved = false;
  const regPath = {};
  function buildWorld() {
    const g1 = el('g', {}, world), g2 = el('g', {}, world);
    GEO.context.forEach(c => el('path', { d: c.d, class: 'ctx' }, g1));
    GEO.countries.forEach(c => { regPath[c.code] = el('path', { d: c.d, class: 'reg', 'data-code': c.code }, g2); });
  }
  const size = () => [wrap.clientWidth, wrap.clientHeight];
  function fitT(bb, pad = 30, maxK) {
    const [W, H] = size(); const bw = Math.max(bb[2] - bb[0], 1), bh = Math.max(bb[3] - bb[1], 1);
    let k = Math.min((W - 2 * pad) / bw, (H - 2 * pad) / bh); if (maxK) k = Math.min(k, maxK);
    return { k, x: W / 2 - (bb[0] + bb[2]) / 2 * k, y: H / 2 - (bb[1] + bb[3]) / 2 * k };
  }
  function apply() { world.setAttribute('transform', `translate(${T.x} ${T.y}) scale(${T.k})`); renderOverlay(); }
  let anim = null;
  function animateTo(t, ms = 480) {
    cancelAnimationFrame(anim); const s = { ...T }, t0 = performance.now();
    const step = now => {
      const p = Math.min(1, (now - t0) / ms), e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const lk = Math.log(s.k) + (Math.log(t.k) - Math.log(s.k)) * e; const k = Math.exp(lk);
      // 화면 중심 기준으로 보간
      const [W, H] = size();
      const cs = [(W / 2 - s.x) / s.k, (H / 2 - s.y) / s.k], ct = [(W / 2 - t.x) / t.k, (H / 2 - t.y) / t.k];
      const cx = cs[0] + (ct[0] - cs[0]) * e, cy = cs[1] + (ct[1] - cs[1]) * e;
      T.k = k; T.x = W / 2 - cx * k; T.y = H / 2 - cy * k; apply();
      if (p < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }
  function home(animate) { const t = fitT(HOME, 18); kHome = t.k; if (animate) animateTo(t); else { Object.assign(T, t); apply(); } }
  function zoomAt(f, sx, sy) {
    const nk = Math.max(kHome * 0.7, Math.min(kHome * 14, T.k * f)); const r = nk / T.k;
    T.x = sx - (sx - T.x) * r; T.y = sy - (sy - T.y) * r; T.k = nk; userMoved = true; apply();
  }
  const scr = (wx, wy) => [wx * T.k + T.x, wy * T.k + T.y];

  // 포인터 팬/핀치
  const ptrs = new Map(); let dragMoved = 0, pinch0 = null, downId = null;
  svg.addEventListener('pointerdown', e => {
    const mk0 = e.target.closest && e.target.closest('.mk'); downId = mk0 ? mk0.dataset.id : null;
    svg.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); dragMoved = 0; cancelAnimationFrame(anim);
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: T.k }; }
  });
  svg.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) { hoverTip(e); return; }
    const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    const r = svg.getBoundingClientRect();
    if (ptrs.size === 1) {
      const dx = e.clientX - prev[0], dy = e.clientY - prev[1]; dragMoved += Math.abs(dx) + Math.abs(dy);
      if (dragMoved > 4) { svg.classList.add('drag'); T.x += dx; T.y += dy; userMoved = true; apply(); }
    } else if (ptrs.size === 2 && pinch0) {
      const [a, b] = [...ptrs.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); dragMoved += 10;
      const mx = (a[0] + b[0]) / 2 - r.left, my = (a[1] + b[1]) / 2 - r.top;
      zoomAt((pinch0.k * d / pinch0.d) / T.k, mx, my);
    }
  });
  const endPtr = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = null; if (!ptrs.size) setTimeout(() => svg.classList.remove('drag'), 0); };
  svg.addEventListener('pointerup', e => {
    const wasDrag = dragMoved > 4; endPtr(e);
    if (wasDrag) return;
    if (downId) select(downId, true);
    else if (S.sel) deselect();
  });
  svg.addEventListener('pointercancel', endPtr);
  svg.addEventListener('wheel', e => { e.preventDefault(); const r = svg.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  $('#zin').onclick = () => { const [W, H] = size(); zoomAt(1.5, W / 2, H / 2); };
  $('#zout').onclick = () => { const [W, H] = size(); zoomAt(1 / 1.5, W / 2, H / 2); };
  $('#zhome').onclick = () => { userMoved = false; home(true); };

  // 툴팁
  const tip = $('#tip');
  function hoverTip(e) {
    if (e.pointerType !== 'mouse') return;
    const mk = e.target.closest && e.target.closest('.mk');
    setHover(mk ? mk.dataset.id : null);
    if (!mk) { tip.classList.remove('on'); return; }
    const it = ITEMS.find(i => i.id === mk.dataset.id); if (!it) return;
    const r = wrap.getBoundingClientRect();
    tip.innerHTML = `<b style="color:${tc(it.topic)}">${esc(TN[it.topic])} · ${esc(ageLabel(age(it)))}</b>${esc(it.title)}`;
    let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14; if (x > r.width - 270) x = e.clientX - r.left - 270;
    tip.style.left = x + 'px'; tip.style.top = y + 'px'; tip.classList.add('on');
  }
  svg.addEventListener('pointerleave', () => { tip.classList.remove('on'); setHover(null); });
  function setHover(id) { if (id === S.hover) return; S.hover = id; paintCountries(); renderOverlay(); }

  /* ---------- 오버레이(라벨·연결선·마커) ---------- */
  function anchorOf(it) { if (it.spot && SP[it.spot]) return [SP[it.spot].x, SP[it.spot].y]; const c = C[it.country]; return c ? [c.ax, c.ay] : null; }
  function markerLayout() {
    const groups = new Map();
    ITEMS.filter(onMap).forEach(it => { const key = it.spot ? 'S' + it.spot : 'C' + it.country; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(it); });
    const pos = {};
    groups.forEach(list => {
      list.sort((a, b) => age(a) - age(b));
      const a = anchorOf(list[0]); if (!a) return; const [sx, sy] = scr(a[0], a[1]); const n = list.length;
      list.forEach((it, i) => {
        if (n === 1) { pos[it.id] = [sx, sy]; return; }
        const R = 10 + n * 2, ang = -Math.PI / 2 + i * 2 * Math.PI / n;
        pos[it.id] = [sx + Math.cos(ang) * R, sy + Math.sin(ang) * R];
      });
    });
    return pos;
  }
  function renderOverlay() {
    overlay.textContent = '';
    const gl = el('g', {}, overlay), ga = el('g', {}, overlay), gm = el('g', {}, overlay);
    const pos = markerLayout();
    const anchored = new Set(ITEMS.filter(onMap).map(it => it.spot ? null : it.country));
    // 국가 이름
    const placed = [];
    GEO.countries.map(c => ({ c, w: (c.bb[2] - c.bb[0]) * T.k, h: (c.bb[3] - c.bb[1]) * T.k })).sort((a, b) => b.w * b.h - a.w * a.h).forEach(({ c, w, h }) => {
      if (Math.max(w, h) < 38) return;
      const [x, y] = scr(c.ax, c.ay); const dy = anchored.has(c.code) ? 24 + Math.min(10, ITEMS.filter(i => onMap(i) && !i.spot && i.country === c.code).length * 3) : 4;
      const tw = c.name.length * 10.5, r = [x - tw / 2, y + dy - 11, x + tw / 2, y + dy + 3];
      if (placed.some(p => r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1])) return;
      placed.push(r);
      el('text', { x, y: y + dy, 'text-anchor': 'middle', class: 'lbl' }, gl).textContent = c.name;
    });
    // 접경 지점 이름
    const usedSpots = new Set(ITEMS.filter(onMap).map(i => i.spot).filter(Boolean));
    usedSpots.forEach(id => { const s = SP[id]; if (!s) return; const [x, y] = scr(s.x, s.y); el('text', { x: x + 14, y: y - 12, class: 'spotl' }, gl).textContent = s.name; });
    // 연결선
    ITEMS.filter(onMap).forEach(it => {
      const p = pos[it.id]; if (!p || !(it.related || []).length) return;
      const show = S.topics.has(it.topic); if (!show) return;
      it.related.forEach(code => {
        const c = C[code]; if (!c) return; const [x2, y2] = scr(c.ax, c.ay);
        const dx = x2 - p[0], dy = y2 - p[1], L = Math.hypot(dx, dy) || 1; const cx = (p[0] + x2) / 2 - dy / L * L * 0.18, cy = (p[1] + y2) / 2 + dx / L * L * 0.18;
        el('path', { d: `M${p[0]} ${p[1]}Q${cx} ${cy} ${x2} ${y2}`, class: 'arc' + (S.sel === it.id || S.hover === it.id ? ' on' : ''), stroke: tc(it.topic) }, ga);
        if (S.sel === it.id || S.hover === it.id) el('circle', { cx: x2, cy: y2, r: 3.5, fill: tc(it.topic) }, ga);
      });
    });
    // 마커 (선택된 것을 맨 위로)
    const top = id => id === S.sel || id === S.hover; const list = ITEMS.filter(onMap).sort((a, b) => top(a.id) - top(b.id) || age(b) - age(a));
    list.forEach(it => {
      const p = pos[it.id]; if (!p) return; const a = age(it), fresh = a === 0, sel = S.sel === it.id;
      const g = el('g', { class: 'mk' + (S.topics.has(it.topic) ? '' : ' dim') + (sel ? ' sel' : ''), transform: `translate(${p[0]} ${p[1]})`, tabindex: 0, role: 'button', 'aria-label': it.title, 'data-id': it.id }, gm);
      const hov = S.hover === it.id, s = (sel || hov ? 1.3 : 1) * (fresh ? 1 : 0.55), col = tc(it.topic);
      el('circle', { r: 14, fill: 'transparent' }, g); // 작은 마커도 누르기 쉽게
      if (it.spot) {
        const R = 12 * s, r = 7.5 * s;
        el('path', { d: `M0 ${-R}L${R} 0 0 ${R} ${-R} 0Z`, class: 'ring', stroke: col, 'stroke-width': 2 }, g);
        el('path', { d: `M0 ${-r}L${r} 0 0 ${r} ${-r} 0Z`, class: 'core', fill: col }, g);
      } else {
        el('circle', { r: 10.5 * s, class: 'ring', stroke: col, 'stroke-width': 2 }, g);
        el('circle', { r: 6.5 * s, class: 'core', fill: col }, g);
      }
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(it.id, true); } });
    });
  }
  function paintCountries() {
    const has = new Set(); ITEMS.filter(onMap).forEach(i => { if (S.topics.has(i.topic)) has.add(i.country); });
    const fid = S.hover || S.sel, it = fid ? ITEMS.find(i => i.id === fid) : null;
    for (const code in regPath) {
      const p = regPath[code]; p.classList.toggle('has', has.has(code));
      p.classList.toggle('sel', !!it && it.country === code);
      p.classList.toggle('rel', !!it && (it.related || []).includes(code));
      p.style.setProperty('--tc', it ? tc(it.topic) : '');
    }
  }

  /* ---------- 주제 칩 ---------- */
  function renderTopics() {
    const box = $('#topics'); box.innerHTML = '';
    TOPICS.forEach(t => {
      const n = ITEMS.filter(i => onMap(i) && i.topic === t.id).length;
      const b = document.createElement('button'); b.className = 'tchip' + (S.topics.has(t.id) ? ' on' : ' off') + (n ? '' : ' zero'); b.style.setProperty('--c', tc(t.id));
      b.innerHTML = `<i></i>${t.name}<em>${n}</em>`; b.title = '눌러서 지도·목록에서 켜고 끄기';
      b.onclick = () => {
        if (S.topics.size === TOPICS.length) { S.topics = new Set([t.id]); }
        else if (S.topics.has(t.id)) { S.topics.delete(t.id); if (!S.topics.size) S.topics = new Set(TOPICS.map(x => x.id)); }
        else S.topics.add(t.id);
        renderTopics(); renderList(); paintCountries(); renderOverlay();
      };
      box.appendChild(b);
    });
  }

  /* ---------- 목록 ---------- */
  function rowHTML(it, opts = {}) {
    const a = age(it); const where = it.spot && SP[it.spot] ? SP[it.spot].name : placeName(it.country);
    const rel = (it.related || []).length ? ` ↔ ${it.related.map(placeName).join('·')}` : '';
    return `<button class="item${S.sel === it.id ? ' sel' : ''}" data-id="${it.id}" style="--tc:${tc(it.topic)}"><span class="dw"><span class="dot${a === 0 ? '' : ' old'}"></span></span>
<span><div class="m"><b>${esc(TN[it.topic])}</b> · ${esc(where)}${esc(rel)} · ${esc(it.source)}${opts.badge && onMap(it) ? '<span class="badge">지도 표시 중</span>' : ''}${it.video ? '<span class="badge">▶ 영상</span>' : ''}</div>
      <h3>${esc(it.title)}</h3>${opts.short ? '' : `<p class="w">${esc(it.why)}</p>`}</span></button>`;
  }
  function renderList() {
    const box = $('#list'); const items = ITEMS.filter(i => onMap(i) && S.topics.has(i.topic));
    if (!items.length) { box.innerHTML = '<div class="empty">표시할 뉴스가 없어요. 위의 주제 필터를 확인해 주세요.</div>'; return; }
    let h = '';
    [0, 1, 2].forEach(a => {
      const day = items.filter(i => age(i) === a); if (!day.length) return;
      const d = new Date(Date.parse(TODAY) - a * 86400e3).toISOString().slice(0, 10);
      h += `<div class="dayh"><span>${ageLabel(a)} · ${fmtDate(d)}</span><span>${day.length}건</span></div>` + day.map(i => rowHTML(i)).join('');
    });
    box.innerHTML = h;
    box.querySelectorAll('.item').forEach(b => { b.onclick = () => select(b.dataset.id, true); b.onmouseenter = () => setHover(b.dataset.id); b.onmouseleave = () => setHover(null); });
  }

  /* ---------- 상세 ---------- */
  function related(it) {
    return ITEMS.filter(o => o.id !== it.id && inWeek(o) && o.topic === it.topic)
      .map(o => ({ o, s: (o.tags || []).some(t => (it.tags || []).includes(t)) ? 2 : 1 }))
      .sort((a, b) => (b.s - a.s) || (a.o.added < b.o.added ? 1 : a.o.added > b.o.added ? -1 : 0)).slice(0, 5);
  }
  function detailHTML(it, withBack) {
    const where = [it.spot && SP[it.spot] ? SP[it.spot].name : null, placeName(it.country)].filter(Boolean).join(' · ');
    const rel = (it.related || []).map(placeName).join(', ');
    const vidSame = it.video && it.video.url === it.url;
    const r = related(it);
    return `<div style="--tc:${tc(it.topic)}">
      ${withBack ? '<button class="back" data-back>← 목록으로</button>' : ''}
      <span class="tbadge"><i></i>${esc(TN[it.topic])}</span>
      <h2>${esc(it.title)}</h2>
      ${it.titleOrig ? `<p class="orig">${esc(it.titleOrig)}</p>` : ''}
      <div class="meta"><span><b>지역</b>${esc(where)}</span>${rel ? `<span><b>관련국</b>${esc(rel)}</span>` : ''}<span><b>기사</b>${esc(fmtDate(it.date))}</span><span><b>출처</b>${esc(it.source)}</span></div>
      ${onMap(it) ? '' : '<div class="offmap">3일이 지나 지도에서는 내려간 뉴스예요.</div>'}
      <div class="why"><h4>왜 지리적으로 읽어야 할까</h4><p>${esc(it.why)}</p></div>
      <div class="sec"><h4>요약 <span class="aitag">AI 작성</span></h4><p>${esc(it.summary)}</p></div>
      ${it.note ? `<div class="sec"><h4>해설</h4><p>${esc(it.note)}</p></div>` : ''}
      ${it.critique ? `<div class="sec crit"><h4>비평</h4><p>${esc(it.critique)}</p></div>` : ''}
      <div class="tags">${(it.tags || []).map(t => `<span>#${esc(t)}</span>`).join('')}</div>
      <div class="btns">
        <a class="pri" href="${esc(it.url)}" target="_blank" rel="noopener">${vidSame ? '▶ 영상 기사 보기' : '기사 원문 보기'} ↗</a>
        ${it.video && !vidSame ? `<a href="${esc(it.video.url)}" target="_blank" rel="noopener">▶ 영상 보기${it.video.dur ? ' (' + esc(it.video.dur) + ')' : ''} ↗</a>` : ''}
      </div>
      <div class="rel"><h4>연관 뉴스 ${r.length ? r.length + '건' : ''}</h4>${r.length ? r.map(x => rowHTML(x.o, { short: true, badge: true })).join('') : '<div class="note2">최근 1주일 안에 같은 주제의 뉴스가 아직 없어요.</div>'}</div>
      <p class="note2"><span class="aitag">AI 작성</span> '왜 지리적으로 읽어야 할까'·요약·해설·비평은 생성형 AI가 원문 기사를 바탕으로 작성했습니다. 사실관계는 원문 기사에서 확인해 주세요. 삭제 요청: <a href="mailto:a56500727@gmail.com">a56500727@gmail.com</a></p>
    </div>`;
  }
  const isMobile = () => matchMedia('(max-width:860px)').matches;
  function wireDetail(box) {
    box.querySelectorAll('.item').forEach(b => { b.onclick = () => select(b.dataset.id, true); b.onmouseenter = () => { if (S.view === 'map') setHover(b.dataset.id); }; b.onmouseleave = () => { if (S.view === 'map') setHover(null); }; });
    const bk = box.querySelector('[data-back]'); if (bk) bk.onclick = deselect;
  }
  function select(id, focus) {
    const it = ITEMS.find(i => i.id === id); if (!it) return;
    S.sel = id; tip.classList.remove('on');
    if (S.view === 'map') {
      if (onMap(it) && focus) {
        const bbs = [it.spot && SP[it.spot] ? [SP[it.spot].x - 350, SP[it.spot].y - 350, SP[it.spot].x + 350, SP[it.spot].y + 350] : C[it.country].bb, ...(it.related || []).filter(c => C[c]).map(c => C[c].bb)];
        const [W, H] = size();
        animateTo(fitT(union(bbs), Math.min(70, W * 0.12), kHome * 4)); userMoved = true;
      }
      paintCountries(); renderOverlay(); renderList();
      if (isMobile()) openSheet(it);
      else { $('#list').hidden = true; const d = $('#detail'); d.hidden = false; d.innerHTML = detailHTML(it, true); wireDetail(d); $('#sideScroll').scrollTop = 0; }
    } else openSheet(it);
  }
  function deselect() {
    S.sel = null; closeSheet(); $('#detail').hidden = true; $('#list').hidden = false;
    paintCountries(); renderOverlay(); renderList(); renderArchive();
  }
  const sheet = $('#sheet');
  function openSheet(it) {
    const d = $('#sdetail'); d.innerHTML = detailHTML(it, false); wireDetail(d);
    sheet.classList.toggle('desk', !isMobile()); sheet.classList.add('on'); sheet.querySelector('.pn').scrollTop = 0;
  }
  function closeSheet() { sheet.classList.remove('on'); }
  sheet.querySelector('.bd').onclick = () => { closeSheet(); if (S.view === 'map') deselect(); else { S.sel = null; renderArchive(); } };
  addEventListener('keydown', e => { if (e.key === 'Escape' && S.sel) deselect(); });

  /* ---------- 지난 뉴스 ---------- */
  function renderArchiveFilters() {
    const fd = $('#fDate'); fd.innerHTML = '';
    const days = [...Array(7)].map((_, i) => new Date(Date.parse(TODAY) - i * 86400e3).toISOString().slice(0, 10));
    const mk = (val, label, n) => { const b = document.createElement('button'); b.className = 'dchip' + (S.aDate === val ? ' on' : ''); b.innerHTML = `${label}<em>${n}</em>`; b.onclick = () => { S.aDate = val; renderArchiveFilters(); renderArchive(); }; fd.appendChild(b); };
    mk('all', '전체', ITEMS.filter(inWeek).length);
    days.forEach((d, i) => { const n = ITEMS.filter(it => it.added === d).length; const dd = new Date(d + 'T00:00:00Z'); mk(d, i === 0 ? '오늘' : `${dd.getUTCMonth() + 1}/${dd.getUTCDate()}(${DOW[dd.getUTCDay()]})`, n); });
    const ft = $('#fTopic'); ft.innerHTML = '';
    TOPICS.forEach(t => {
      const b = document.createElement('button'); b.className = 'tchip' + (S.aTopics.has(t.id) ? ' on' : ' off'); b.style.setProperty('--c', tc(t.id));
      b.innerHTML = `<i></i>${t.name}<em>${ITEMS.filter(i => inWeek(i) && i.topic === t.id).length}</em>`;
      b.onclick = () => {
        if (S.aTopics.size === TOPICS.length) S.aTopics = new Set([t.id]);
        else if (S.aTopics.has(t.id)) { S.aTopics.delete(t.id); if (!S.aTopics.size) S.aTopics = new Set(TOPICS.map(x => x.id)); }
        else S.aTopics.add(t.id);
        renderArchiveFilters(); renderArchive();
      };
      ft.appendChild(b);
    });
  }
  function buildCountrySelect() {
    const s = $('#fCountry'); s.innerHTML = '<option value="">전체 국가·지역</option>';
    GROUPS.forEach(g => {
      const cs = GEO.countries.filter(c => c.group === g).sort((a, b) => a.name.localeCompare(b.name, 'ko')); if (!cs.length) return;
      const og = document.createElement('optgroup'); og.label = g; cs.forEach(c => { const o = document.createElement('option'); o.value = c.code; o.textContent = c.name; og.appendChild(o); }); s.appendChild(og);
    });
    const og = document.createElement('optgroup'); og.label = '접경 지점'; GEO.spots.forEach(sp => { const o = document.createElement('option'); o.value = 'spot:' + sp.id; o.textContent = sp.name; og.appendChild(o); }); s.appendChild(og);
    s.onchange = () => { S.aCountry = s.value; renderArchive(); };
  }
  function renderArchive() {
    const c = S.aCountry;
    const items = ITEMS.filter(i => inWeek(i) && (S.aDate === 'all' || i.added === S.aDate) && S.aTopics.has(i.topic) &&
      (!c || (c.startsWith('spot:') ? i.spot === c.slice(5) : (i.country === c || (i.related || []).includes(c)))))
      .sort((a, b) => a.added < b.added ? 1 : a.added > b.added ? -1 : 0);
    const box = $('#alist');
    box.innerHTML = items.length ? items.map(i => rowHTML(i, { badge: true })).join('') : '<div class="empty">조건에 맞는 뉴스가 없어요.</div>';
    box.querySelectorAll('.item').forEach(b => b.onclick = () => select(b.dataset.id, false));
  }

  /* ---------- 화면 전환 ---------- */
  function setView(v) {
    S.view = v; document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    $('#vMap').hidden = v !== 'map'; $('#vArchive').hidden = v !== 'archive'; closeSheet();
    if (v === 'map') { requestAnimationFrame(() => { if (!userMoved) home(false); else apply(); }); }
    else { renderArchiveFilters(); renderArchive(); }
    try { if (location.hash !== '#' + v) history.replaceState(null, '', '#' + v); } catch (e) { }
  }
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => setView(b.dataset.view));
  addEventListener('hashchange', () => { const v = location.hash.slice(1); if (v === 'map' || v === 'archive') setView(v); });
  addEventListener('resize', () => { if (S.view !== 'map') return; if (!userMoved) home(false); else apply(); });

  /* ---------- 시작 ---------- */
  async function load() {
    let data = null;
    try { const r = await fetch('news.json', { cache: 'no-store' }); if (r.ok) data = await r.json(); } catch (e) { }
    if (!data) data = window.NEWS_FALLBACK || { items: [] };
    DATA = data; ITEMS = (data.items || []).filter(i => C[i.country] && TN[i.topic]);
    if (data.updated) { const d = new Date(data.updated); const k = new Date(d.getTime() + 9 * 3600e3); $('#upd').textContent = `매일 오전 7시 업데이트 · 최근 ${k.getUTCMonth() + 1}/${k.getUTCDate()} ${String(k.getUTCHours()).padStart(2, '0')}:${String(k.getUTCMinutes()).padStart(2, '0')}`; }
    buildWorld(); buildCountrySelect(); renderTopics(); renderList(); paintCountries();
    const v = location.hash.slice(1); setView(v === 'archive' ? 'archive' : 'map');
    window.__gn = { S, ITEMS, select, setView };
  }
  load();
})();
