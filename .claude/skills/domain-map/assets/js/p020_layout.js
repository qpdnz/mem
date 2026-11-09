// ---- layout: 格子への配置 ----
// 定義に at: [列, 行] があればそれを使い、無い物だけを自動で置く。
// 自動配置は「親→子」を左→右へ並べる層分けと、隣の層の位置に寄せる並べ替え。

function autoCells(ids, links, sortKey, fixed) {
  const set = new Set(ids);
  const succ = new Map(ids.map((id) => [id, []]));
  const pred = new Map(ids.map((id) => [id, []]));
  for (const [from, to] of links) {
    if (!set.has(from) || !set.has(to) || from === to) continue;
    succ.get(from).push(to);
    pred.get(to).push(from);
  }

  // 循環は深さ優先で見つけた戻り辺を無視して切る
  const state = new Map();
  const back = new Set();
  const visit = (id) => {
    state.set(id, 1);
    for (const next of succ.get(id)) {
      if (state.get(next) === 1) back.add(id + '::' + next);
      else if (!state.has(next)) visit(next);
    }
    state.set(id, 2);
  };
  for (const id of ids) if (!state.has(id)) visit(id);
  const forward = (from, to) => !back.has(from + '::' + to);

  const layer = new Map();
  const depth = (id, guard = new Set()) => {
    if (layer.has(id)) return layer.get(id);
    guard.add(id);
    let d = 0;
    for (const p of pred.get(id)) {
      if (!forward(p, id) || guard.has(p)) continue;
      d = Math.max(d, depth(p, guard) + 1);
    }
    layer.set(id, d);
    return d;
  };
  for (const id of ids) depth(id);

  // 子だけを持つ根は、最も近い子の手前まで右へ寄せて長い辺を減らす
  for (const id of [...ids].sort((a, b) => layer.get(b) - layer.get(a))) {
    const outs = succ.get(id).filter((to) => forward(id, to));
    if (pred.get(id).length === 0 && outs.length > 0) {
      layer.set(id, Math.max(0, Math.min(...outs.map((to) => layer.get(to))) - 1));
    }
  }

  const columns = [];
  for (const id of ids) {
    const c = layer.get(id);
    (columns[c] ||= []).push(id);
  }
  const order = new Map();
  columns.forEach((col) => {
    col.sort((a, b) => sortKey(a) - sortKey(b));
    col.forEach((id, i) => order.set(id, i));
  });

  for (let pass = 0; pass < 6; pass++) {
    const down = pass % 2 === 0;
    const range = down ? columns.map((_, i) => i) : columns.map((_, i) => columns.length - 1 - i);
    for (const c of range) {
      const col = columns[c];
      if (!col) continue;
      const bary = new Map();
      for (const id of col) {
        const ns = (down ? pred.get(id) : succ.get(id)).filter((n) => order.has(n));
        bary.set(id, ns.length ? ns.reduce((sum, n) => sum + order.get(n), 0) / ns.length : order.get(id));
      }
      col.sort((a, b) => bary.get(a) - bary.get(b) || sortKey(a) - sortKey(b));
      col.forEach((id, i) => order.set(id, i));
    }
  }

  // 行は、左隣の層にいる親の行へ揃える。揃えられなければ下へ詰める
  const cells = new Map();
  const taken = new Set();
  for (const [id, at] of fixed) {
    cells.set(id, at);
    taken.add(at[0] + ',' + at[1]);
  }
  columns.forEach((col, c) => {
    if (!col) return;
    let next = 0;
    for (const id of col) {
      if (cells.has(id)) continue;
      const parents = pred.get(id).map((p) => cells.get(p)).filter(Boolean);
      let row = parents.length ? Math.round(parents.reduce((sum, at) => sum + at[1], 0) / parents.length) : next;
      row = Math.max(row, next);
      while (taken.has(c + ',' + row)) row++;
      cells.set(id, [c, row]);
      taken.add(c + ',' + row);
      next = row + 1;
    }
  });
  return cells;
}

function cellsFor(items, links, sortKey) {
  const fixed = new Map();
  const auto = [];
  for (const item of items) {
    if (Array.isArray(item.at) && item.at.length === 2) fixed.set(item.id, [item.at[0], item.at[1]]);
    else auto.push(item.id);
  }
  if (auto.length === 0) return fixed;
  const all = items.map((item) => item.id);
  const cells = autoCells(all, links, sortKey, fixed);
  if (fixed.size > 0) {
    // 手で置いた物がある時は、自動の物を手置きの右の空き列へ寄せて衝突を避ける
    const maxCol = Math.max(...[...fixed.values()].map((at) => at[0]));
    const taken = new Set([...fixed.values()].map((at) => at[0] + ',' + at[1]));
    for (const id of auto) {
      const at = cells.get(id);
      let [c, r] = at;
      if (taken.has(c + ',' + r)) c = maxCol + 1 + c;
      while (taken.has(c + ',' + r)) r++;
      cells.set(id, [c, r]);
      taken.add(c + ',' + r);
    }
  }
  return cells;
}

function gridGeometry(cells, sizes, gapX, gapY, options = {}) {
  let cols = 0, rows = 0;
  for (const [c, r] of cells.values()) {
    cols = Math.max(cols, c + 1);
    rows = Math.max(rows, r + 1);
  }
  const colW = new Array(cols).fill(options.minCol || 60);
  const rowH = new Array(rows).fill(options.minRow || 24);
  for (const [id, [c, r]] of cells) {
    const size = sizes.get(id);
    colW[c] = Math.max(colW[c], size.w);
    rowH[r] = Math.max(rowH[r], size.h);
  }
  const colX = [], rowY = [];
  let x = 0;
  for (let c = 0; c < cols; c++) { colX[c] = x; x += colW[c] + gapX; }
  let y = 0;
  for (let r = 0; r < rows; r++) { rowY[r] = y; y += rowH[r] + gapY; }

  const rects = new Map();
  for (const [id, [c, r]] of cells) {
    const size = sizes.get(id);
    const w = options.stretch ? colW[c] : size.w;
    const left = colX[c] + (colW[c] - w) / 2;
    const top = options.valign === 'top' ? rowY[r] : rowY[r] + (rowH[r] - size.h) / 2;
    rects.set(id, { x: left, y: top, w, h: size.h, c, r });
  }
  return {
    cols, rows, colX, colW, rowY, rowH, gapX, gapY, rects,
    width: Math.max(0, x - gapX),
    height: Math.max(0, y - gapY),
  };
}

// 縦の通り道 g は「列 g の右側の隙間」。-1 は左端の外側。
function vGutterCenter(geo, g) {
  if (g < 0) return geo.colX[0] - geo.gapX / 2;
  if (g >= geo.cols - 1) return geo.colX[geo.cols - 1] + geo.colW[geo.cols - 1] + geo.gapX / 2;
  return geo.colX[g] + geo.colW[g] + geo.gapX / 2;
}
// 横の通り道 k は「行 k の上側の隙間」。rows は下端の外側。
function hGutterCenter(geo, k) {
  if (k <= 0) return geo.rowY[0] - geo.gapY / 2;
  if (k >= geo.rows) return geo.rowY[geo.rows - 1] + geo.rowH[geo.rows - 1] + geo.gapY / 2;
  return geo.rowY[k - 1] + geo.rowH[k - 1] + geo.gapY / 2;
}
