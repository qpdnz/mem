// 地図の箱の配置 (at) を、線の交差と長さが減るように探して定義へ書き込む。
//
// 使い方:
//   node layout.mjs <map.json>                 探すだけ (点を表示)
//   node layout.mjs <map.json> --write         実体の at を書き込む
//   node layout.mjs <map.json> --write --flow --screens   業務と画面の at も探し直す
//
// 開くたびに探すと、24実体でページの表示が 0.2秒 → 1.6秒 に延びた (実測 2026-09-18)。
// 配置は定義の一部として一度だけ決め、図はそれを読むだけにする。
// 下書きの層分け (autoCells) は描画側の assets/js/20_layout.js をそのまま読み込み、二重に持たない。

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const layoutContext = {};
vm.createContext(layoutContext);
vm.runInContext(readFileSync(join(here, '..', 'assets', 'js', '20_layout.js'), 'utf8') + '\nthis.autoCells = autoCells;', layoutContext);

// 格子の上で箱を入れ替え・移動する焼きなまし。評価は箱の中心どうしの線分で近似する
// (経路を実際に引くより桁違いに軽い)。動かした箱に触れる項だけを引き直す差分評価。
function optimize(cells, links, seed, groupOf) {
  const ids = [...cells.keys()];
  const pos = new Map(ids.map((id) => [id, cells.get(id).slice()]));
  const edges = links.filter(([a, b]) => a !== b && pos.has(a) && pos.has(b));
  const incident = new Map(ids.map((id) => [id, []]));
  edges.forEach(([a, b], i) => { incident.get(a).push(i); incident.get(b).push(i); });
  const width = Math.max(...ids.map((id) => pos.get(id)[0])) + 2;
  const height = Math.max(...ids.map((id) => pos.get(id)[1])) + 2;

  const side = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  const pairCost = (i, j) => {
    const [a, b] = edges[i], [c, d] = edges[j];
    if (a === c || a === d || b === c || b === d) return 0;
    const pa = pos.get(a), pb = pos.get(b), pc = pos.get(c), pd = pos.get(d);
    return side(pc, pd, pa) * side(pc, pd, pb) < 0 && side(pa, pb, pc) * side(pa, pb, pd) < 0 ? 6 : 0;
  };
  const throughCost = (i, id) => {
    const [a, b] = edges[i];
    if (id === a || id === b) return 0;
    const p = pos.get(a), q = pos.get(b), cell = pos.get(id);
    if ((q[0] - p[0]) * (cell[1] - p[1]) !== (q[1] - p[1]) * (cell[0] - p[0])) return 0;
    const within = cell[0] >= Math.min(p[0], q[0]) && cell[0] <= Math.max(p[0], q[0])
      && cell[1] >= Math.min(p[1], q[1]) && cell[1] <= Math.max(p[1], q[1]);
    return within ? 4 : 0;
  };
  // 長さ・同じ列で離れた相手 (回り込みになる)・親が子より右 を足す
  const lengthCost = (i) => {
    const [a, b] = edges[i];
    const pa = pos.get(a), pb = pos.get(b);
    const dx = Math.abs(pa[0] - pb[0]), dy = Math.abs(pa[1] - pb[1]);
    return dx * 1.2 + dy + (dx === 0 && dy > 1 ? 3 : 0) + (pa[0] > pb[0] ? 1.5 : 0);
  };
  const areaCost = () => new Set(ids.map((id) => pos.get(id)[0])).size * new Set(ids.map((id) => pos.get(id)[1])).size * 0.15;
  // 同じ層 (色) の箱どうしは近くに置く。色で読む図なので、交差が同じなら固まっている方を採る
  const cohesionCost = (x, y) => {
    const group = groupOf(x);
    if (!group || group !== groupOf(y)) return 0;
    const px = pos.get(x), py = pos.get(y);
    return (Math.abs(px[0] - py[0]) + Math.abs(px[1] - py[1])) * 0.1;
  };
  const partial = (moved) => {
    const affected = new Set();
    for (const id of moved) for (const i of incident.get(id)) affected.add(i);
    let total = 0;
    for (const i of affected) {
      total += lengthCost(i);
      for (const id of ids) total += throughCost(i, id);
      for (let j = 0; j < edges.length; j++) {
        if (j !== i && !(affected.has(j) && j < i)) total += pairCost(i, j);
      }
    }
    for (let i = 0; i < edges.length; i++) {
      if (!affected.has(i)) for (const id of moved) total += throughCost(i, id);
    }
    for (const id of moved) {
      for (const other of ids) {
        if (other !== id && !(moved.includes(other) && other < id)) total += cohesionCost(id, other);
      }
    }
    return total;
  };
  let current = areaCost();
  ids.forEach((x, i) => { for (let j = i + 1; j < ids.length; j++) current += cohesionCost(x, ids[j]); });
  edges.forEach((_, i) => {
    current += lengthCost(i);
    for (const id of ids) current += throughCost(i, id);
    for (let j = i + 1; j < edges.length; j++) current += pairCost(i, j);
  });

  let state = seed | 0;
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let x = Math.imul(state ^ (state >>> 15), 1 | state);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const occupant = new Map(ids.map((id) => [pos.get(id).join(','), id]));
  let best = current;
  let bestPos = new Map(ids.map((id) => [id, pos.get(id).slice()]));
  const steps = 1200 * ids.length;
  for (let step = 0; step < steps; step++) {
    const temperature = 4 * Math.pow(0.01, step / steps);
    const id = ids[Math.floor(random() * ids.length)];
    const from = pos.get(id).slice();
    const to = [Math.floor(random() * width), Math.floor(random() * height)];
    const other = occupant.get(to.join(','));
    if (other === id) continue;
    const moved = other ? [id, other] : [id];
    const before = partial(moved) + areaCost();
    pos.set(id, to);
    if (other) pos.set(other, from);
    const next = current - before + partial(moved) + areaCost();
    if (next <= current || random() < Math.exp((current - next) / temperature)) {
      occupant.delete(from.join(','));
      occupant.set(to.join(','), id);
      if (other) occupant.set(from.join(','), other);
      current = next;
      if (current < best - 1e-9) { best = current; bestPos = new Map(ids.map((k) => [k, pos.get(k).slice()])); }
    } else {
      pos.set(id, from);
      if (other) pos.set(other, to);
    }
  }
  const usedCols = [...new Set(ids.map((id) => bestPos.get(id)[0]))].sort((x, y) => x - y);
  const usedRows = [...new Set(ids.map((id) => bestPos.get(id)[1]))].sort((x, y) => x - y);
  const result = new Map(ids.map((id) => [id, [usedCols.indexOf(bestPos.get(id)[0]), usedRows.indexOf(bestPos.get(id)[1])]]));
  return { cells: result, cost: Math.round(best * 10) / 10 };
}

// 下書き: いま書いてある at (欠けた物は空き位置へ) と、at を無視した層分けの2つから探す
function starts(items, links, sort) {
  const layered = layoutContext.autoCells(items.map((item) => item.id), links, sort, new Map());
  const fromAt = new Map();
  const taken = new Set();
  for (const item of items) {
    if (Array.isArray(item.at) && !taken.has(item.at.join(','))) {
      fromAt.set(item.id, item.at.slice());
      taken.add(item.at.join(','));
    }
  }
  for (const item of items) {
    if (fromAt.has(item.id)) continue;
    let [c, r] = layered.get(item.id);
    while (taken.has(c + ',' + r)) r++;
    fromAt.set(item.id, [c, r]);
    taken.add(c + ',' + r);
  }
  return fromAt.size && items.some((item) => Array.isArray(item.at)) ? [['at', fromAt], ['層分け', layered]] : [['層分け', layered]];
}

function place(label, items, links, sort, groupOf = () => null) {
  if (items.length < 2) return null;
  let chosen = null;
  for (const [name, cells] of starts(items, links, sort)) {
    for (const seed of [0x2f6e2b1, 0x51ed27, 0x9e3779b1, 0x7f4a7c15]) {
      const result = optimize(cells, links, seed, groupOf);
      console.log(`${label}: 下書き=${name} 種=${seed.toString(16)} 点=${result.cost}`);
      if (!chosen || result.cost < chosen.cost) chosen = { ...result, name, seed };
    }
  }
  console.log(`${label}: 採用 下書き=${chosen.name} 点=${chosen.cost}`);
  return chosen.cells;
}

function dump(value, indent = 0) {
  const inline = JSON.stringify(value);
  if (inline.length + indent <= 150 || typeof value !== 'object' || value === null || !Object.keys(value).length) return inline;
  const pad = ' '.repeat(indent), inner = ' '.repeat(indent + 2);
  if (Array.isArray(value)) return '[\n' + value.map((v) => inner + dump(v, indent + 2)).join(',\n') + '\n' + pad + ']';
  return '{\n' + Object.entries(value).map(([k, v]) => `${inner}${JSON.stringify(k)}: ${dump(v, indent + 2)}`).join(',\n') + '\n' + pad + '}';
}

const [file, ...flags] = process.argv.slice(2);
if (!file) {
  console.error('使い方: node layout.mjs <map.json> [--write] [--flow] [--screens]');
  process.exit(1);
}
const map = JSON.parse(readFileSync(file, 'utf8'));
const layerIndex = new Map((map.layers || []).map((layer, i) => [layer.id, i]));
const entities = map.entities || [];
const entityIndex = new Map(entities.map((entity, i) => [entity.id, i]));
const entityCells = place('実体', entities, (map.relations || []).map((r) => [r.from, r.to]),
  (id) => (layerIndex.get(entities[entityIndex.get(id)].layer) ?? 99) * 1000 + entityIndex.get(id),
  (id) => entities[entityIndex.get(id)].layer);
const apply = (items, cells) => { if (cells) for (const item of items) { item.at = cells.get(item.id); delete item.erAt; } };
apply(entities, entityCells);
if (flags.includes('--flow') && map.flow) {
  const steps = map.flow.steps || [];
  const index = new Map(steps.map((step, i) => [step.id, i]));
  apply(steps, place('業務', steps, (map.flow.links || []).map((l) => [l.from, l.to]), (id) => index.get(id)));
}
if (flags.includes('--screens') && map.screens) {
  const index = new Map(map.screens.map((screen, i) => [screen.id, i]));
  apply(map.screens, place('画面', map.screens, (map.screenLinks || []).map((l) => [l.from, l.to]), (id) => index.get(id)));
}
if (flags.includes('--write')) {
  writeFileSync(file, dump(map) + '\n', 'utf8');
  console.log(`書き込んだ: ${file}`);
}
