// ---- core: 定義の読込・色・索引・小道具 ----
const MAP = JSON.parse(document.getElementById('map-data').textContent);

const PALETTE = {
  blue: { c: '#3d63c9', ct: '#eef2fb', cb: '#cdd9f3', ci: '#2c4a9e' },
  orange: { c: '#d68a2e', ct: '#fcf3e6', cb: '#efdab8', ci: '#955810' },
  green: { c: '#2f9468', ct: '#eaf5ee', cb: '#c4e3d1', ci: '#1f6b4a' },
  purple: { c: '#7453d6', ct: '#f1ecfb', cb: '#dbcff5', ci: '#5535b0' },
  teal: { c: '#1f8f9a', ct: '#e7f5f6', cb: '#c1e4e7', ci: '#146770' },
  red: { c: '#cf4b4b', ct: '#fbeceb', cb: '#f0cbca', ci: '#9c2f2f' },
  gold: { c: '#b38b1d', ct: '#faf4e1', cb: '#e8dcb2', ci: '#7f6211' },
  pink: { c: '#c94f8a', ct: '#fbedf4', cb: '#efcddf', ci: '#983567' },
  gray: { c: '#6b7280', ct: '#f1f2f4', cb: '#dadde2', ci: '#4b5160' },
};
const PALETTE_ORDER = ['blue', 'orange', 'green', 'purple', 'teal', 'red', 'gold', 'pink', 'gray'];

function mixHex(hex, other, t) {
  const p = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  const a = p(hex), b = p(other);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

function tone(color, index) {
  if (typeof color === 'string' && PALETTE[color]) return PALETTE[color];
  if (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) {
    return { c: color, ct: mixHex(color, '#ffffff', 0.9), cb: mixHex(color, '#ffffff', 0.72), ci: mixHex(color, '#000000', 0.25) };
  }
  return PALETTE[PALETTE_ORDER[(index || 0) % PALETTE_ORDER.length]];
}

function toneStyle(t) {
  return `--c:${t.c};--ct:${t.ct};--cb:${t.cb};--ci:${t.ci}`;
}

function h(tag, attrs, ...children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'style') node.setAttribute('style', value);
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    }
  }
  for (const child of children.flat()) {
    if (child === undefined || child === null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs || {})) node.setAttribute(key, value);
  return node;
}

function norm(text) {
  return String(text || '').normalize('NFKC').toLowerCase();
}

// ---- 索引 ----
const LAYERS = new Map((MAP.layers || []).map((layer, i) => [layer.id, { ...layer, tone: tone(layer.color, i) }]));
const ENTITIES = new Map((MAP.entities || []).map((entity) => [entity.id, entity]));
const RELATIONS = (MAP.relations || []).map((relation, i) => ({ ...relation, key: 'r' + i }));
const FLOW = MAP.flow || { steps: [], links: [] };
const ACTORS = new Map((FLOW.actors || []).map((actor, i) => [actor.id, { ...actor, tone: tone(actor.color, i + 2) }]));
const STEPS = new Map((FLOW.steps || []).map((step) => [step.id, step]));
const FLOW_LINKS = (FLOW.links || []).map((link, i) => ({ ...link, key: 'f' + i }));
const SCREENS = new Map((MAP.screens || []).map((screen) => [screen.id, screen]));
// 用語集は図ではなく読み物。並びは書いた順のまま、3列の札に流し込む
const TERM_COLS = 3;
const TERMS = new Map((MAP.terms || []).map((term, i) => [term.id, { ...term, at: [i % TERM_COLS, Math.floor(i / TERM_COLS)] }]));
const SCREEN_LINKS = (MAP.screenLinks || []).map((link, i) => ({ ...link, key: 's' + i }));

const GRAY = PALETTE.gray;
function entityTone(entity) {
  const layer = entity && LAYERS.get(entity.layer);
  return layer ? layer.tone : GRAY;
}
function stepTone(step) {
  const actor = step && ACTORS.get(step.actor);
  return actor ? actor.tone : GRAY;
}
function screenTone(screen) {
  const layer = screen && LAYERS.get(screen.layer);
  return layer ? layer.tone : PALETTE.purple;
}

// 語の色は、その語が指す最初の実体の層に合わせる。図で見た色のまま用語集に並ぶ
function termTone(term) {
  const layer = term && (term.see || []).map((id) => ENTITIES.get(id)).find(Boolean);
  return layer ? entityTone(layer) : GRAY;
}

function refEntityId(ref) {
  return String(ref || '').split('.')[0];
}

const USES = { stepsByEntity: new Map(), screensByEntity: new Map(), stepsByScreen: new Map(), termsByItem: new Map() };
for (const step of STEPS.values()) {
  for (const id of step.uses || []) {
    if (!USES.stepsByEntity.has(id)) USES.stepsByEntity.set(id, []);
    USES.stepsByEntity.get(id).push(step);
  }
  if (step.screen) {
    if (!USES.stepsByScreen.has(step.screen)) USES.stepsByScreen.set(step.screen, []);
    USES.stepsByScreen.get(step.screen).push(step);
  }
}
for (const screen of SCREENS.values()) {
  for (const id of screen.uses || []) {
    if (!USES.screensByEntity.has(id)) USES.screensByEntity.set(id, []);
    USES.screensByEntity.get(id).push(screen);
  }
}

for (const term of TERMS.values()) {
  for (const id of term.see || []) {
    if (!USES.termsByItem.has(id)) USES.termsByItem.set(id, []);
    USES.termsByItem.get(id).push(term);
  }
}

const COUNTS = {
  entities: ENTITIES.size,
  relations: RELATIONS.length,
  fields: [...ENTITIES.values()].reduce((sum, entity) => sum + (entity.fields || []).length, 0),
};

const VIEW_ORDER = ['concept', 'er', 'flow', 'screens', 'terms'];
const VIEW_LABEL = { concept: '概念図', er: 'ER図', flow: '業務フロー', screens: '画面UI', terms: '用語' };
function viewAvailable(view) {
  if (view === 'flow') return STEPS.size > 0;
  if (view === 'screens') return SCREENS.size > 0;
  if (view === 'terms') return TERMS.size > 0;
  return ENTITIES.size > 0;
}
function viewOfKind(kind) {
  return kind === 'step' ? 'flow' : kind === 'screen' ? 'screens' : kind === 'term' ? 'terms' : 'concept';
}

const STATE = {
  view: null,
  selected: null, // { kind: 'entity' | 'step' | 'screen' | 'term', id, field? }
  legend: null,   // 凡例で1色だけ残している時、その層 (または actor) の id
  views: {},
};

const $ = (id) => document.getElementById(id);
