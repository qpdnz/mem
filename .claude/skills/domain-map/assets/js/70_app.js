// ---- app: 選択・図の切替・検索・デモ・起動 ----
function itemOf(sel) {
  if (!sel) return null;
  return sel.kind === 'entity' ? ENTITIES.get(sel.id) : sel.kind === 'step' ? STEPS.get(sel.id) : sel.kind === 'screen' ? SCREENS.get(sel.id) : sel.kind === 'term' ? TERMS.get(sel.id) : null;
}

function selectItem(sel, options = {}) {
  const item = itemOf(sel);
  if (!item) return;
  STATE.selected = sel;
  if (sel.kind === 'entity') openPanel(entityPanel(item, sel.field), entityTone(item));
  else if (sel.kind === 'step') openPanel(stepPanel(item), stepTone(item));
  else if (sel.kind === 'term') openPanel(termPanel(item), termTone(item));
  else openPanel(screenPanel(item), screenTone(item));
  for (const view of Object.values(STATE.views)) refreshSelection(view);

  const view = STATE.views[STATE.view];
  const el = view && NODE_KIND[view.kind] === sel.kind ? view.nodeEls.get(sel.id) : null;
  if (el && options.focus) {
    const animate = options.animate !== false;
    // 詳細の欄が開いて図の幅が変わってから寄せる
    if (animate) requestAnimationFrame(() => focusNode(view, sel.id, true));
    else focusNode(view, sel.id, false);
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
  }
  const hit = sel.field && $('panel-body').querySelector('.p-field.hit');
  if (hit) requestAnimationFrame(() => hit.scrollIntoView({ block: 'center' }));
  writeHash();
}

function clearSelection() {
  STATE.selected = null;
  closePanel();
  for (const view of Object.values(STATE.views)) refreshSelection(view);
  writeHash();
}

function switchView(kind, options = {}) {
  if (!viewAvailable(kind)) return;
  if (!STATE.views[kind]) STATE.views[kind] = buildView(kind);
  for (const [k, v] of Object.entries(STATE.views)) v.pan.style.display = k === kind ? '' : 'none';
  STATE.view = kind;
  const view = STATE.views[kind];
  document.querySelectorAll('.dock-tab').forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.view === kind)));
  if (!view.cam) openView(view);
  else applyCamera(view);
  refreshSelection(view);
  renderLegend();
  applyLegendFilter(view);
  const sel = STATE.selected;
  if (options.focusSelected !== false && sel && NODE_KIND[kind] === sel.kind && view.nodeEls.has(sel.id)) focusNode(view, sel.id, true);
  if (sel) selectItem(sel, { focus: false });
  writeHash();
}

// ---- 位置を URL の # に残す (同じ場面を人へ渡せるように) ----
function writeHash() {
  const parts = [];
  if (STATE.view) parts.push('v=' + STATE.view);
  if (STATE.selected) {
    parts.push('s=' + encodeURIComponent(STATE.selected.kind + ':' + STATE.selected.id));
    if (STATE.selected.field) parts.push('f=' + encodeURIComponent(STATE.selected.field));
  }
  try { history.replaceState(null, '', '#' + parts.join('&')); } catch (_) { /* file:// 等で拒否されても表示は続ける */ }
}

function readHash() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  const [kind, ...rest] = decodeURIComponent(params.get('s') || '').split(':');
  const sel = kind && rest.length ? { kind, id: rest.join(':'), field: params.get('f') || undefined } : null;
  return { view: params.get('v'), sel: itemOf(sel) ? sel : null };
}

// ---- 凡例 ----
// 色が何を表しているかを図の中に置く。押すとその色だけ残して他を薄くする
// 根拠: PO指摘 2026-09-18「ER 色ついてるけど、なにがなんだか分からんな」。
// 層の名前は箱の中の小さな札にしか出ておらず、色と意味を結ぶ物がどこにも無かった
function legendGroups(kind) {
  if (kind === 'flow') {
    return { head: '色は「誰がやるか」', items: [...ACTORS.values()].map((a) => ({ id: a.id, name: a.label, note: a.note || '', tone: a.tone })) };
  }
  const items = [...LAYERS.values()].map((l) => ({ id: l.id, name: l.short || l.label, note: l.note || l.label, tone: l.tone }));
  return { head: kind === 'terms' ? '色は「その語が指す物の置き場」' : '色は「どこに在る物か」', items };
}

function applyLegendFilter(view) {
  const pick = STATE.legend;
  const kindOf = (id) => {
    const item = view.nodeEls.has(id) ? (ENTITIES.get(id) || STEPS.get(id) || SCREENS.get(id) || TERMS.get(id)) : null;
    if (!item) return null;
    if (view.kind === 'flow') return item.actor;
    if (view.kind === 'terms') { const e = (item.see || []).map((x) => ENTITIES.get(x)).find(Boolean); return e ? e.layer : null; }
    return item.layer;
  };
  for (const [id, el] of view.nodeEls) el.classList.toggle('dim', !!pick && kindOf(id) !== pick);
  for (const edge of view.edges) {
    const off = !!pick && (kindOf(edge.from) !== pick || kindOf(edge.to) !== pick);
    edge.path.classList.toggle('dim', off);
    if (edge.labelEl) edge.labelEl.classList.toggle('dim', off);
  }
}

function renderLegend() {
  const box = $('legend');
  const group = legendGroups(STATE.view);
  box.textContent = '';
  if (group.items.length < 2) { box.hidden = true; return; }
  box.hidden = false;
  box.append(h('div', { class: 'lg-head', text: group.head }));
  for (const item of group.items) {
    const on = STATE.legend === item.id;
    box.append(h('button', {
      type: 'button', class: 'lg-item', style: toneStyle(item.tone), 'aria-pressed': String(on),
      onclick: () => { STATE.legend = on ? null : item.id; renderLegend(); applyLegendFilter(STATE.views[STATE.view]); },
    },
    h('span', { class: 'lg-dot' }),
    h('span', { class: 'lg-name', text: item.name }),
    item.note && item.note !== item.name ? h('span', { class: 'lg-note', text: item.note }) : null));
  }
}

// ---- 検索 ----
const KIND_LABEL = { entity: '実体', field: '項目', step: '業務', screen: '画面', term: '用語' };
const SEARCH_INDEX = [];
// 語は先に出す。知らない言葉を引いた人が最初に欲しいのは説明であって、箱ではない
for (const term of TERMS.values()) {
  SEARCH_INDEX.push({ kind: 'term', id: term.id, main: term.word, sub: term.short || '', key: norm(term.word), hay: norm([term.word, term.reading, term.short, term.means, term.confuse].join(' ')), rank: 0 });
}
for (const entity of ENTITIES.values()) {
  SEARCH_INDEX.push({ kind: 'entity', id: entity.id, main: entity.name, sub: entity.physical || '', key: norm(entity.name + ' ' + (entity.physical || '')), hay: norm([entity.name, entity.physical, entity.summary].join(' ')), rank: 0 });
  for (const field of entity.fields || []) {
    SEARCH_INDEX.push({
      kind: 'field', id: entity.id, field: fieldKeyOf(field), main: entity.name + ' › ' + field.name,
      sub: [field.physical, field.type].filter(Boolean).join(' '), key: norm(field.name + ' ' + (field.physical || '')),
      hay: norm([entity.name, entity.physical, field.name, field.physical, field.note, (field.values || []).join(' ')].join(' ')), rank: 1,
    });
  }
}
for (const step of STEPS.values()) {
  SEARCH_INDEX.push({ kind: 'step', id: step.id, main: step.title, sub: (ACTORS.get(step.actor) || {}).label || '', key: norm(step.title), hay: norm([step.title, step.summary].join(' ')), rank: 2 });
}
for (const screen of SCREENS.values()) {
  SEARCH_INDEX.push({ kind: 'screen', id: screen.id, main: screen.title, sub: screen.route || '', key: norm(screen.title + ' ' + (screen.route || '')), hay: norm([screen.title, screen.route, screen.summary].join(' ')), rank: 3 });
}

function runSearch(query) {
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const first = tokens[0];
  return SEARCH_INDEX
    .filter((item) => tokens.every((t) => item.hay.includes(t)))
    .map((item) => ({ item, score: (item.key.startsWith(first) ? 0 : item.key.includes(first) ? 1 : 2) * 10 + item.rank }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 14)
    .map((hit) => hit.item);
}

function goTo(result) {
  if (result.kind === 'entity' || result.kind === 'field') {
    switchView(result.kind === 'field' || STATE.view === 'er' ? 'er' : 'concept', { focusSelected: false });
    selectItem({ kind: 'entity', id: result.id, field: result.field }, { focus: true });
  } else {
    switchView(result.kind === 'step' ? 'flow' : result.kind === 'term' ? 'terms' : 'screens', { focusSelected: false });
    selectItem({ kind: result.kind, id: result.id }, { focus: true });
  }
}

function bindSearch() {
  const input = $('search'), box = $('search-results');
  let results = [], active = 0;
  const render = () => {
    box.replaceChildren();
    if (!input.value.trim()) { box.hidden = true; return; }
    if (!results.length) box.append(h('div', { class: 'sr-empty', text: '見つかりません' }));
    results.forEach((result, i) => box.append(h('div', {
      class: 'sr-item', role: 'option', 'aria-selected': String(i === active),
      onpointerdown: (ev) => { ev.preventDefault(); choose(i); },
    }, h('span', { class: 'sr-kind', text: KIND_LABEL[result.kind] }), h('span', { class: 'sr-main', text: result.main }), h('span', { class: 'sr-sub', text: result.sub }))));
    box.hidden = false;
  };
  const choose = (i) => {
    const result = results[i];
    if (!result) return;
    box.hidden = true;
    input.blur();
    pauseDemo(false);
    goTo(result);
  };
  input.addEventListener('input', () => { results = runSearch(input.value); active = 0; render(); });
  input.addEventListener('focus', () => { if (input.value.trim()) { results = runSearch(input.value); render(); } });
  input.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 150));
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown') { active = Math.min(results.length - 1, active + 1); render(); ev.preventDefault(); }
    else if (ev.key === 'ArrowUp') { active = Math.max(0, active - 1); render(); ev.preventDefault(); }
    else if (ev.key === 'Enter') { choose(active); ev.preventDefault(); }
    else if (ev.key === 'Escape') { input.value = ''; box.hidden = true; input.blur(); }
  });
}

// ---- デモ: 定義の demo.steps を順に見せる ----
const DEMO = (() => {
  const source = MAP.demo || {};
  const normalize = (step) => {
    const target = step.target || (step.screen ? 'screen:' + step.screen : step.step ? 'step:' + step.step : step.entity ? 'entity:' + step.entity : '');
    const [kind, ...rest] = target.split(':');
    const sel = { kind, id: rest.join(':'), field: step.field };
    const item = itemOf(sel);
    return item ? { ...sel, title: step.title || item.title || item.name } : null;
  };
  let steps = (source.steps || []).map(normalize).filter(Boolean);
  if (!steps.length) {
    if (SCREENS.size) steps = [...SCREENS.values()].map((screen) => ({ kind: 'screen', id: screen.id, title: screen.title }));
    else if (STEPS.size) steps = [...STEPS.values()].map((step) => ({ kind: 'step', id: step.id, title: step.title }));
    else steps = [...ENTITIES.values()].slice(0, 12).map((entity) => ({ kind: 'entity', id: entity.id, title: entity.name }));
  }
  return { title: source.title || '順に見る', interval: Number(source.interval) || 3400, steps, index: -1, timer: 0, playing: false };
})();

function renderDemo() {
  $('demo-title').textContent = 'デモ実行 — ' + DEMO.title;
  $('demo-steps').replaceChildren(...DEMO.steps.map((step, i) => h('li', {
    class: i < DEMO.index ? 'done' : i === DEMO.index ? 'current' : '',
    onclick: () => demoGo(i),
  }, h('span', { class: 'num', text: i < DEMO.index ? '✓' : String(i + 1) }), h('span', { text: step.title }))));
}

function demoGo(i) {
  const step = DEMO.steps[i];
  if (!step) return;
  DEMO.index = i;
  $('demo').hidden = false;
  const view = step.kind === 'entity' ? (STATE.view === 'er' ? 'er' : 'concept') : viewOfKind(step.kind);
  switchView(view, { focusSelected: false });
  selectItem({ kind: step.kind, id: step.id, field: step.field }, { focus: true });
  renderDemo();
  clearTimeout(DEMO.timer);
  if (DEMO.playing) {
    DEMO.timer = setTimeout(() => {
      if (DEMO.index + 1 < DEMO.steps.length) demoGo(DEMO.index + 1);
      else { pauseDemo(false); DEMO.index = DEMO.steps.length; renderDemo(); }
    }, DEMO.interval);
  }
}

function playDemo() {
  DEMO.playing = true;
  $('play').classList.add('playing');
  $('play').setAttribute('aria-label', 'デモを一時停止');
  demoGo(DEMO.index < 0 || DEMO.index >= DEMO.steps.length - 1 ? 0 : DEMO.index + 1);
}

function pauseDemo(hide) {
  DEMO.playing = false;
  clearTimeout(DEMO.timer);
  $('play').classList.remove('playing');
  $('play').setAttribute('aria-label', 'デモを再生');
  if (hide) { DEMO.index = -1; $('demo').hidden = true; }
}

// ---- 起動 ----
function initBrief() {
  const meta = MAP.meta || {};
  document.title = meta.title || document.title;
  $('brief-title').textContent = meta.title || '地図';
  $('brief-client').textContent = meta.client || '';
  $('brief-product').textContent = meta.product || '';
  $('brief-sep').hidden = !(meta.client && meta.product);
  $('brief-counts').textContent = `${COUNTS.entities} 実体 / ${COUNTS.relations} 関連 / ${COUNTS.fields} 項目`;
  $('brief-desc').textContent = meta.description || '';
  $('brief-foot').textContent = [meta.generatedAt ? '作成 ' + meta.generatedAt : '', meta.basis || ''].filter(Boolean).join(' ・ ');
  if (meta.back && meta.back.href) {
    const back = $('brief-back');
    back.href = meta.back.href;
    back.textContent = meta.back.label || '← 戻る';
    back.hidden = false;
  }
}

function bindControls() {
  document.querySelectorAll('.dock-tab').forEach((tab) => {
    tab.hidden = !viewAvailable(tab.dataset.view);
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  });
  $('zoom-in').addEventListener('click', () => zoomCenter(1.2));
  $('zoom-out').addEventListener('click', () => zoomCenter(1 / 1.2));
  $('zoom-value').addEventListener('click', () => fitView(STATE.views[STATE.view], true));
  $('play').addEventListener('click', () => (DEMO.playing ? pauseDemo(false) : playDemo()));
  $('demo-close').addEventListener('click', () => pauseDemo(true));
  $('panel-close').addEventListener('click', () => { pauseDemo(false); clearSelection(); });
  window.addEventListener('resize', () => { const view = STATE.views[STATE.view]; if (view && view.cam) applyCamera(view); });
  document.addEventListener('keydown', (ev) => {
    if (ev.target.closest && ev.target.closest('input, textarea')) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.key === '/') { ev.preventDefault(); $('search').focus(); return; }
    if (ev.key === 'Escape') { if (!$('demo').hidden) pauseDemo(true); else clearSelection(); return; }
    const n = Number(ev.key);
    if (n >= 1 && n <= VIEW_ORDER.length) { const views = VIEW_ORDER.filter(viewAvailable); if (views[n - 1]) switchView(views[n - 1]); return; }
    if (ev.key === 'f') fitView(STATE.views[STATE.view], true);
    else if (ev.key === '+' || ev.key === '=') zoomCenter(1.2);
    else if (ev.key === '-') zoomCenter(1 / 1.2);
  });
}

function init() {
  initBrief();
  bindCanvas();
  bindControls();
  bindSearch();
  renderDemo();
  const start = readHash();
  const measure = /(^|[#&])measure(&|$)/.test(location.hash); // 図を開くと # が書き換わるので先に読む
  const first = (start.view && viewAvailable(start.view) && start.view) || VIEW_ORDER.find(viewAvailable);
  if (!first) {
    $('viewport').append(h('div', { class: 'float-card', style: 'left:50%;top:50%;transform:translate(-50%,-50%);padding:18px 22px', text: '定義に実体・業務・画面がありません' }));
    return;
  }
  switchView(first);
  if (start.sel) {
    const target = NODE_KIND[first] === start.sel.kind ? first : viewOfKind(start.sel.kind);
    if (target !== first) switchView(target, { focusSelected: false });
    selectItem(start.sel, { focus: true, animate: false });
  }
  // 作り手向け: 自動配置の結果を at 形式で取り出す (console で domainMap.layout())
  window.domainMap = {
    layout: (kind = STATE.view) => {
      const view = STATE.views[kind];
      return view ? Object.fromEntries([...view.geo.rects].map(([id, r]) => [id, [r.c, r.r]])) : null;
    },
    view: (kind) => switchView(kind),
    select: (kind, id, field) => selectItem({ kind, id, field }, { focus: true }),
    crossings: () => Object.fromEntries(VIEW_ORDER.filter(viewAvailable).map((kind) => {
      const started = performance.now();
      if (!STATE.views[kind]) STATE.views[kind] = buildView(kind);
      return [kind, { ...countCrossings(STATE.views[kind]), buildMs: Math.round(performance.now() - started) }];
    })),
  };
  // #measure を付けて開くと、4図の交差数を html 要素の data-crossings へ書く (headless で測るため)
  if (measure) {
    const initMs = Math.round(performance.now());
    document.documentElement.dataset.crossings = JSON.stringify({ initMs, ...window.domainMap.crossings() });
    switchView(first);
  }
}

// 別々の線どうしが直角に横切る点の数。同じ幹を共有して重なる所と、幹から枝が出る所は数えない
function countCrossings(view) {
  const segs = [];
  view.edges.forEach((edge, i) => {
    const pts = edge.plan.pts;
    for (let j = 0; j + 1 < pts.length; j++) {
      const p = pts[j], q = pts[j + 1];
      const horizontal = Math.abs(p.y - q.y) < 0.5;
      if (horizontal && Math.abs(p.x - q.x) < 0.5) continue;
      segs.push({ i, horizontal, x1: Math.min(p.x, q.x), x2: Math.max(p.x, q.x), y1: Math.min(p.y, q.y), y2: Math.max(p.y, q.y) });
    }
  });
  let count = 0;
  const pairs = new Map();
  for (const s of segs) {
    if (!s.horizontal) continue;
    for (const t of segs) {
      if (t.horizontal || t.i === s.i) continue;
      if (t.x1 > s.x1 + 1 && t.x1 < s.x2 - 1 && s.y1 > t.y1 + 1 && s.y1 < t.y2 - 1) {
        count++;
        const name = (e) => `${e.from}>${e.to}`;
        const key = [name(view.edges[s.i]), name(view.edges[t.i])].sort().join(' x ');
        pairs.set(key, (pairs.get(key) || 0) + 1);
      }
    }
  }
  const worst = [...pairs].sort((p1, p2) => p2[1] - p1[1]).slice(0, 12).map(([key, n]) => `${n} ${key}`);
  return { edges: view.edges.length, crossings: count, worst };
}

init();
