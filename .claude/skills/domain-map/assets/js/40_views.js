// ---- views: 4つの図を同じ定義から組み立てる ----
const TABLE_GLYPH = '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="1.5" y="2" width="9" height="8" rx="1"/><path d="M1.5 5h9M5 5v5"/></svg>';
const NODE_KIND = { concept: 'entity', er: 'entity', flow: 'step', screens: 'screen', terms: 'term' };

function glyph() {
  const node = h('span', { class: 'glyph' });
  node.innerHTML = TABLE_GLYPH;
  return node;
}

function fieldKeys(field) {
  const raw = Array.isArray(field.key) ? field.key : String(field.key || '').split(/[\s,+/]+/);
  return raw.map((k) => k.trim().toUpperCase()).filter(Boolean);
}

function keyBadge(key) {
  return h('span', { class: 'badge ' + (key === 'PK' ? 'pk' : key === 'UQ' ? 'uq' : ''), text: key });
}

function fieldKeyOf(field) {
  return field.physical || field.name;
}

function nodeAttrs(kind, id, className, t) {
  return { class: 'node ' + className, style: toneStyle(t), 'data-kind': kind, 'data-id': id };
}

// 箱に触れている間だけ出す説明。箱の外へ絶対配置で置くので、箱の大きさも並びも変わらない
// 根拠: PO指摘 2026-09-18「ほかの図の箱もホバーで説明でるようにして」。
// それまで summary は右の欄にしか無く、1つ見るのに1回押す必要があった
function nodeDetail(head, summary, lines, terms) {
  if (!summary && !(lines || []).length) return null;
  return h('div', { class: 'n-detail' },
    head ? h('div', { class: 'nd-head', text: head }) : null,
    summary ? h('div', { class: 'nd-sum', text: summary }) : null,
    (lines || []).length ? h('ul', { class: 'nd-list' }, ...lines.map((line) => h('li', { text: line }))) : null,
    (terms || []).length ? h('div', { class: 'nd-terms', text: '語: ' + terms.join(' · ') }) : null);
}

// その箱に結びついた用語があれば、語だけ添える (説明は用語のタブで読む)
function termWords(id) {
  return (USES.termsByItem.get(id) || []).map((term) => term.word);
}

function entityDetail(entity) {
  const layer = LAYERS.get(entity.layer);
  return nodeDetail(layer ? layer.short || layer.label : '実体', entity.summary, entity.notes, termWords(entity.id));
}

function conceptNode(entity) {
  return h('div', nodeAttrs('entity', entity.id, 'n-concept', entityTone(entity)),
    glyph(),
    h('div', null,
      h('div', { class: 'nm', text: entity.name }),
      entity.physical ? h('div', { class: 'ph', text: entity.physical }) : null),
    entityDetail(entity));
}

function erNode(entity) {
  const layer = LAYERS.get(entity.layer);
  const rows = (entity.fields || []).map((field) => {
    const keys = fieldKeys(field);
    const main = keys.includes('PK') ? 'PK' : keys[0];
    return h('div', { class: 'er-row', 'data-field': fieldKeyOf(field) },
      h('span', { class: 'fn', text: field.name }),
      h('span', { class: 'fp', text: field.physical || '' }),
      main ? keyBadge(main) : h('span'));
  });
  return h('div', nodeAttrs('entity', entity.id, 'n-er', entityTone(entity)),
    h('div', { class: 'er-head' },
      glyph(),
      h('div', { class: 'er-title' },
        h('div', { class: 'nm', text: entity.name }),
        entity.physical ? h('div', { class: 'ph', text: entity.physical }) : null),
      layer ? h('span', { class: 'layer-pill', text: layer.short || layer.label }) : null),
    rows.length ? rows : h('div', { class: 'er-more', text: '項目の定義なし' }),
    entityDetail(entity));
}

// 用語の札。初めて読む人がまずここを見る。太字の語・1行の意味・紛らわしい点の印だけ出す
function termNode(term) {
  return h('div', nodeAttrs('term', term.id, 'n-term', termTone(term)),
    h('div', { class: 'term-head' },
      h('span', { class: 'nm', text: term.word }),
      term.confuse ? h('span', { class: 'term-warn', text: 'まぎらわしい' }) : null),
    term.short ? h('div', { class: 'term-short', text: term.short }) : null,
    // 触れている間だけ出す詳しい説明。札の高さは畳んだ状態で測るので、並びは動かない
    term.confuse || term.means ? h('div', { class: 'term-detail' },
      term.confuse ? h('div', { class: 'term-confuse' }, h('span', { class: 'term-confuse-head', text: 'まぎらわしい' }), h('span', { text: term.confuse })) : null,
      term.means ? h('div', { class: 'term-means', text: term.means }) : null) : null,
    (term.see || []).length ? h('div', { class: 'term-see', text: (term.see || []).map(seeName).filter(Boolean).join(' · ') }) : null);
}

// see は実体・業務・画面のどれでも指せる
function seeItem(id) {
  return ENTITIES.get(id) || STEPS.get(id) || SCREENS.get(id) || null;
}
function seeName(id) {
  const item = seeItem(id);
  return item ? (item.name || item.title) : null;
}
function seeKind(id) {
  return ENTITIES.has(id) ? 'entity' : STEPS.has(id) ? 'step' : SCREENS.has(id) ? 'screen' : null;
}

function stepNode(step) {
  const actor = ACTORS.get(step.actor);
  const uses = (step.uses || []).map((id) => ENTITIES.get(id)).filter(Boolean).map((entity) => entity.name);
  const screen = step.screen && SCREENS.get(step.screen);
  return h('div', nodeAttrs('step', step.id, 'n-flow', stepTone(step)),
    actor ? h('span', { class: 'actor', text: actor.label }) : null,
    h('div', { class: 'nm', text: step.title }),
    uses.length ? h('div', { class: 'uses', text: uses.join('・') }) : null,
    screen ? h('div', { class: 'scr', text: '画面 ' + (screen.no ? screen.no + ' ' : '') + screen.title }) : null,
    nodeDetail(actor ? actor.label : '業務', step.summary, step.does, termWords(step.id)));
}

function screenNode(screen) {
  return h('div', nodeAttrs('screen', screen.id, 'n-screen', screenTone(screen)),
    h('div', { class: 'sc-head' },
      h('span', { class: 'sc-no', text: screen.no || '—' }),
      h('span', { class: 'nm', text: screen.title }),
      screen.route ? h('span', { class: 'route', text: screen.route }) : null),
    renderMock(screen.mock || []),
    nodeDetail(screen.route || '画面', screen.summary, screen.does, termWords(screen.id)));
}

// ---- 画面の線画 ----
function renderMock(blocks) {
  const root = h('div', { class: 'mock' });
  for (const block of blocks) root.append(mockBlock(block));
  if (!blocks.length) root.append(h('div', { class: 'mk-text', text: '（線画なし）' }));
  return root;
}

function mockFields(pairs) {
  return h('div', { class: 'mk-fields', style: `--n:${Math.min(pairs.length, 4)}` },
    pairs.map(([label, value]) => h('div', { class: 'mk-field' }, h('b', { text: label }), h('span', { text: value ?? '' }))));
}

function mockGraph(count) {
  const n = Math.max(2, Math.min(12, Number(count) || 6));
  const box = h('div', { class: 'mk-graph' });
  const svg = s('svg', { viewBox: '0 0 200 58', preserveAspectRatio: 'none' });
  const pts = [];
  for (let i = 0; i < n; i++) {
    const col = i % 4, row = Math.floor(i / 4);
    pts.push({ x: 12 + col * 50 + ((i * 37) % 11), y: 8 + row * 18 + ((i * 53) % 7) });
  }
  for (let i = 1; i < n; i++) {
    const a = pts[Math.floor((i - 1) / 2)], b = pts[i];
    svg.append(s('path', { d: `M${a.x + 18},${a.y + 4} C${a.x + 34},${a.y + 4} ${b.x - 14},${b.y + 4} ${b.x},${b.y + 4}` }));
  }
  box.append(svg);
  for (const p of pts) box.append(h('i', { style: `left:${p.x / 2}%;top:${p.y}px` }));
  return box;
}

function mockBlock(block) {
  if (block === null || typeof block !== 'object') return h('div', { class: 'mk-text', text: String(block) });
  if ('h' in block) return h('div', { class: 'mk-h' }, block.h, block.tag ? h('span', { class: 'mk-tag', text: block.tag }) : null);
  if ('text' in block) return h('div', { class: 'mk-text', text: block.text });
  if ('input' in block) return h('div', { class: 'mk-input', text: block.input });
  if ('field' in block) return mockFields([[block.field, block.value]]);
  if ('fields' in block) return mockFields(block.fields);
  if ('list' in block) {
    return h('div', { class: 'mk-list' }, block.list.map((row) => h('div', null, [].concat(row).map((cell) => h('span', { text: cell })))));
  }
  if ('table' in block) {
    const table = block.table;
    return h('table', { class: 'mk-table' },
      h('thead', null, h('tr', null, (table.cols || []).map((col) => h('th', { text: col })))),
      h('tbody', null, (table.rows || []).map((row) => h('tr', null, row.map((cell) => h('td', { text: cell }))))));
  }
  if ('chips' in block) return h('div', { class: 'mk-chips' }, block.chips.map((chip, i) => h('span', { class: i === block.active ? 'on' : '', text: chip })));
  if ('tabs' in block) return h('div', { class: 'mk-tabs' }, block.tabs.map((tab, i) => h('span', { class: i === (block.active ?? 0) ? 'on' : '', text: tab })));
  if ('cards' in block) {
    return h('div', { class: 'mk-cards', style: `--n:${Math.min(block.cards.length, 4)}` },
      block.cards.map((card) => h('div', { class: 'mk-card' }, h('b', { text: card.title }), (card.lines || []).map((line) => h('span', { text: line })))));
  }
  if ('buttons' in block) {
    return h('div', { class: 'mk-buttons' }, block.buttons.map((button) => typeof button === 'string'
      ? h('span', { class: 'mk-btn', text: button })
      : h('span', { class: 'mk-btn' + (button.primary ? ' primary' : ''), text: button.label })));
  }
  if ('kpi' in block) return h('div', { class: 'mk-kpi' }, block.kpi.map(([label, value]) => h('div', null, h('b', { text: value }), h('span', { text: label }))));
  if ('split' in block) {
    const ratio = block.ratio || block.split.map(() => 1);
    return h('div', { class: 'mk-split', style: `grid-template-columns:${ratio.map((r) => r + 'fr').join(' ')}` },
      block.split.map((col) => h('div', null, [].concat(col).map(mockBlock))));
  }
  if ('log' in block) return h('div', { class: 'mk-log' }, block.log.map((line) => h('div', { text: line })));
  if ('graph' in block) return mockGraph(block.graph);
  return h('div', { class: 'mk-text', text: JSON.stringify(block) });
}

// ---- 図の組み立て ----
function markerDefs(kind) {
  const defs = s('defs');
  for (const [suffix, color] of [['', '#9aa0a8'], ['-hot', '#3f4650']]) {
    const marker = s('marker', {
      id: `${kind}-arrow${suffix}`, viewBox: '0 0 10 10', refX: '9', refY: '5',
      markerWidth: '8', markerHeight: '8', markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse',
    });
    marker.append(s('path', { d: 'M0,1 L9,5 L0,9 z', fill: color }));
    defs.append(marker);
  }
  return defs;
}

function relationEdges() {
  return RELATIONS.filter((r) => ENTITIES.has(r.from) && ENTITIES.has(r.to)).map((r) => ({
    key: r.key, from: r.from, to: r.to, label: r.label, dashed: !!r.optional, directed: false, ref: r,
  }));
}

function viewSpec(kind) {
  const entityIndex = new Map([...ENTITIES.keys()].map((id, i) => [id, i]));
  const layerIndex = new Map([...LAYERS.keys()].map((id, i) => [id, i]));
  const entitySort = (id) => (layerIndex.get(ENTITIES.get(id).layer) ?? 99) * 1000 + entityIndex.get(id);
  if (kind === 'concept') {
    return { items: [...ENTITIES.values()], make: conceptNode, edges: relationEdges(), gap: [92, 50], opts: { stretch: true, valign: 'center' }, sort: entitySort };
  }
  if (kind === 'er') {
    return {
      items: [...ENTITIES.values()].map((e) => ({ ...e, at: e.erAt || e.at })), make: erNode, edges: relationEdges(),
      gap: [120, 64], opts: { stretch: true, valign: 'top' }, sort: entitySort, rowPorts: true,
    };
  }
  if (kind === 'flow') {
    const index = new Map([...STEPS.keys()].map((id, i) => [id, i]));
    return {
      items: [...STEPS.values()], make: stepNode, sort: (id) => index.get(id), gap: [72, 56], opts: { stretch: false, valign: 'center' },
      edges: FLOW_LINKS.filter((l) => STEPS.has(l.from) && STEPS.has(l.to)).map((l) => ({
        key: l.key, from: l.from, to: l.to, label: l.label, dashed: !!l.dashed, directed: true, both: !!l.both, ref: l,
      })),
    };
  }
  if (kind === 'terms') {
    const index = new Map([...TERMS.keys()].map((id, i) => [id, i]));
    return { items: [...TERMS.values()], make: termNode, edges: [], sort: (id) => index.get(id), gap: [34, 26], opts: { stretch: true, valign: 'top' } };
  }
  const index = new Map([...SCREENS.keys()].map((id, i) => [id, i]));
  return {
    items: [...SCREENS.values()], make: screenNode, sort: (id) => index.get(id), gap: [96, 72], opts: { stretch: false, valign: 'top' },
    edges: SCREEN_LINKS.filter((l) => SCREENS.has(l.from) && SCREENS.has(l.to)).map((l) => ({
      key: l.key, from: l.from, to: l.to, label: l.label, dashed: !!l.dashed, directed: true, both: !!l.both, ref: l,
    })),
  };
}

function erPortResolver(nodeEls) {
  const rowCenter = new Map();
  for (const [id, el] of nodeEls) {
    const rows = new Map();
    const head = el.querySelector('.er-head');
    rows.set('', head ? head.offsetHeight / 2 : 16);
    for (const row of el.querySelectorAll('.er-row')) rows.set(row.dataset.field, row.offsetTop + row.offsetHeight / 2);
    rowCenter.set(id, rows);
  }
  return (edge, nodeId, end) => {
    const relation = edge.ref;
    const rows = rowCenter.get(nodeId);
    const child = ENTITIES.get(relation.to), parent = ENTITIES.get(relation.from);
    if (end === 'b') {
      const via = (child.fields || []).find((f) => fieldKeyOf(f) === relation.via || f.name === relation.via)
        || (child.fields || []).find((f) => refEntityId(f.ref) === relation.from);
      return via ? rows.get(fieldKeyOf(via)) : rows.get('');
    }
    const refField = String(((child.fields || []).find((f) => fieldKeyOf(f) === relation.via) || {}).ref || '').split('.')[1];
    const target = (parent.fields || []).find((f) => refField && (fieldKeyOf(f) === refField || f.name === refField))
      || (parent.fields || []).find((f) => fieldKeys(f).includes('PK'));
    return target ? rows.get(fieldKeyOf(target)) : rows.get('');
  };
}

function buildView(kind) {
  const spec = viewSpec(kind);
  const pan = h('div', { class: 'pan', 'data-view': kind, style: 'visibility:hidden' });
  const world = h('div', { class: 'world' });
  const svg = s('svg', { class: 'edges', width: '1', height: '1' });
  svg.append(markerDefs(kind));
  world.append(svg);
  pan.append(world);
  $('viewport').append(pan);

  const nodeEls = new Map();
  for (const item of spec.items) {
    const el = spec.make(item);
    world.append(el);
    nodeEls.set(item.id, el);
  }
  const sizes = new Map([...nodeEls].map(([id, el]) => [id, { w: el.offsetWidth, h: el.offsetHeight }]));
  const cells = cellsFor(spec.items, spec.edges.map((e) => [e.from, e.to]), spec.sort);
  const geo = gridGeometry(cells, sizes, spec.gap[0], spec.gap[1], spec.opts);
  for (const [id, rect] of geo.rects) {
    const el = nodeEls.get(id);
    el.style.left = rect.x + 'px';
    el.style.top = rect.y + 'px';
    if (spec.opts.stretch) el.style.width = rect.w + 'px';
  }

  const plans = routeEdges(geo, spec.edges, spec.rowPorts ? erPortResolver(nodeEls) : null);
  const edges = [];
  for (const plan of plans) {
    const edge = plan.edge;
    const path = s('path', { class: 'edge' + (edge.dashed ? ' dashed' : ''), d: roundedPath(plan.pts, 7) });
    // 矢印は向かう先の端へ。束の側から描いた (点列を逆にした) 線は始点側が向かう先になる
    const markers = !edge.directed ? [] : edge.both ? ['marker-start', 'marker-end'] : [plan.reverse ? 'marker-start' : 'marker-end'];
    for (const attr of markers) path.setAttribute(attr, `url(#${kind}-arrow)`);
    svg.append(path);
    const labelEl = edge.label && plan.labelSpecs.length ? h('div', { class: 'edge-label', text: edge.label }) : null;
    if (labelEl) world.append(labelEl);
    edges.push({ ...edge, path, labelEl, plan, markers });
  }
  const labels = edges.filter((e) => e.labelEl).map((e) => ({
    edge: e, w: e.labelEl.offsetWidth, h: e.labelEl.offsetHeight, specs: e.plan.labelSpecs,
  }));
  placeLabels(labels, geo, [...geo.rects.values()]);
  for (const label of labels) {
    label.edge.labelEl.style.left = label.x + 'px';
    label.edge.labelEl.style.top = label.y + 'px';
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (x, y) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); };
  for (const r of geo.rects.values()) { grow(r.x, r.y); grow(r.x + r.w, r.y + r.h); }
  for (const e of edges) for (const p of e.plan.pts) grow(p.x, p.y);
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 1; maxY = 1; }

  pan.style.visibility = '';
  const view = {
    kind, pan, world, nodeEls, geo, edges, cam: null, hover: null, zoomApplied: 1,
    bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
  };
  for (const [id, el] of nodeEls) {
    el.addEventListener('pointerenter', () => { view.hover = id; refreshHot(view); });
    el.addEventListener('pointerleave', () => { if (view.hover === id) view.hover = null; refreshHot(view); });
  }
  return view;
}

function refreshHot(view) {
  const hot = new Set();
  if (view.hover) hot.add(view.hover);
  const sel = STATE.selected;
  if (sel && sel.kind === NODE_KIND[view.kind] && view.nodeEls.has(sel.id)) hot.add(sel.id);
  for (const edge of view.edges) {
    const on = hot.has(edge.from) || hot.has(edge.to);
    edge.path.classList.toggle('hot', on);
    // 束で重なる線は、強調した方を上に重ね直す
    if (on) edge.path.parentNode.appendChild(edge.path);
    for (const attr of edge.markers) edge.path.setAttribute(attr, `url(#${view.kind}-arrow${on ? '-hot' : ''})`);
    if (edge.labelEl) edge.labelEl.classList.toggle('hot', on);
  }
}

function refreshSelection(view) {
  const sel = STATE.selected;
  for (const [id, el] of view.nodeEls) {
    const on = !!sel && sel.kind === NODE_KIND[view.kind] && sel.id === id;
    el.classList.toggle('selected', on);
    if (view.kind === 'er') {
      for (const row of el.querySelectorAll('.er-row')) row.classList.toggle('hit', on && !!sel.field && row.dataset.field === sel.field);
    }
  }
  refreshHot(view);
}
