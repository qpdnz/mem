// ---- route: 直角の線を格子の隙間へ通す ----
// 線は「列の隙間 (縦)」と「行の隙間 (横)」だけを走り、箱の上を横切らない。
// 1. 箱の同じ辺から、同じ役割 (出る/入る)・同じ線種で出る線は束ねる。出入口を1つにし、
//    隙間を走る線 (幹) を共有する。どちらの端の幹を使うかは、束の大きい側に寄せる
// 2. 隙間ごとに、幹の並び順を「横切りが最も少ない順」で決め、重ならない幹は同じ車線に置く
// 3. 札は、その線だけが使う端 (束ねていない側) に置く
// 実測 2026-09-17: 束ねずに車線を上から順に割り当てていた旧版は、画面UIの11本で51交差
// (ホームから出る10本が格子状に交差した)。PO「この交差きになる、アルゴリズム見直せ」

const LANE_SPACING = 12;
const EXACT_ORDER_LIMIT = 11;

function routeEdges(geo, edges, portYOf) {
  const rects = geo.rects;
  const plans = [];

  // 1. 出る辺・入る辺と、経路の形 (h: 列をまたぐ / v: 同じ列の上下の隣 / c: 同じ列で右へ回る)
  for (const edge of edges) {
    const a = rects.get(edge.from), b = rects.get(edge.to);
    if (!a || !b || edge.from === edge.to) continue;
    let sa, sb, mode;
    if (a.c < b.c) { sa = 'R'; sb = 'L'; mode = 'h'; }
    else if (a.c > b.c) { sa = 'L'; sb = 'R'; mode = 'h'; }
    else {
      const lo = Math.min(a.r, b.r), hi = Math.max(a.r, b.r);
      let blocked = false;
      for (const other of rects.values()) {
        if (other.c === a.c && other.r > lo && other.r < hi) { blocked = true; break; }
      }
      if (portYOf || blocked) { sa = 'R'; sb = 'R'; mode = 'c'; }
      else if (a.r < b.r) { sa = 'B'; sb = 'T'; mode = 'v'; }
      else { sa = 'T'; sb = 'B'; mode = 'v'; }
    }
    plans.push({ edge, a, b, sa, sb, mode, reverse: false });
  }

  // 2. 束: 同じ箱・同じ辺・同じ役割・同じ線種
  const groups = new Map();
  const sideGroups = new Map();
  const groupOf = (nodeId, rect, side, role, dashed) => {
    const key = [nodeId, side, role, dashed ? 'd' : 's'].join('::');
    let group = groups.get(key);
    if (!group) {
      group = { key, nodeId, rect, side, role, plans: [], port: null };
      groups.set(key, group);
      const sideKey = nodeId + '::' + side;
      if (!sideGroups.has(sideKey)) sideGroups.set(sideKey, []);
      sideGroups.get(sideKey).push(group);
    }
    return group;
  };
  for (const plan of plans) {
    plan.ga = groupOf(plan.edge.from, plan.a, plan.sa, 'out', plan.edge.dashed);
    plan.gb = groupOf(plan.edge.to, plan.b, plan.sb, 'in', plan.edge.dashed);
    plan.ga.plans.push(plan);
    plan.gb.plans.push(plan);
  }

  // 3. 出入口: 辺の上に束を相手の位置の順で等間隔に置く。ER図は行の高さに固定する
  const isVertical = (side) => side === 'L' || side === 'R';
  const sideX = (r, side) => (side === 'R' ? r.x + r.w : r.x);
  const sideY = (r, side) => (side === 'B' ? r.y + r.h : r.y);
  for (const list of sideGroups.values()) {
    const r = list[0].rect, side = list[0].side;
    const along = (group) => {
      const others = group.plans.map((p) => (group.role === 'out' ? p.b : p.a));
      return others.reduce((sum, o) => sum + (isVertical(side) ? o.y + o.h / 2 : o.x + o.w / 2), 0) / others.length;
    };
    list.sort((g1, g2) => along(g1) - along(g2));
    list.forEach((group, i) => {
      const t = (i + 1) / (list.length + 1);
      group.port = isVertical(side) ? { x: sideX(r, side), y: r.y + r.h * t } : { x: r.x + r.w * t, y: sideY(r, side) };
    });
  }
  for (const plan of plans) {
    if (portYOf) {
      plan.pa = { x: sideX(plan.a, plan.sa), y: plan.a.y + portYOf(plan.edge, plan.edge.from, 'a') };
      plan.pb = { x: sideX(plan.b, plan.sb), y: plan.b.y + portYOf(plan.edge, plan.edge.to, 'b') };
    } else {
      plan.pa = plan.ga.port;
      plan.pb = plan.gb.port;
    }
  }

  // 4. 隣どうしで高さ (上下なら横位置) を揃えられる時は、束の小さい側を寄せて一直線にする
  if (!portYOf) {
    const sideFree = (group, value) => sideGroups.get(group.nodeId + '::' + group.side)
      .every((other) => other === group || Math.abs((isVertical(group.side) ? other.port.y : other.port.x) - value) >= 10);
    for (const plan of plans) {
      const { a, b, ga, gb } = plan;
      const single = (g) => g.plans.length === 1;
      if (plan.mode === 'h' && Math.abs(a.c - b.c) === 1) {
        const lo = Math.max(a.y, b.y) + 8, hi = Math.min(a.y + a.h, b.y + b.h) - 8;
        const inside = (v) => v >= lo && v <= hi;
        if (lo > hi) continue;
        if (single(gb) && inside(ga.port.y) && sideFree(gb, ga.port.y)) gb.port.y = ga.port.y;
        else if (single(ga) && inside(gb.port.y) && sideFree(ga, gb.port.y)) ga.port.y = gb.port.y;
        else if (single(ga) && single(gb) && sideFree(ga, (lo + hi) / 2) && sideFree(gb, (lo + hi) / 2)) ga.port.y = gb.port.y = (lo + hi) / 2;
      } else if (plan.mode === 'v') {
        const lo = Math.max(a.x, b.x) + 10, hi = Math.min(a.x + a.w, b.x + b.w) - 10;
        const inside = (v) => v >= lo && v <= hi;
        if (lo > hi) continue;
        if (single(gb) && inside(ga.port.x) && sideFree(gb, ga.port.x)) gb.port.x = ga.port.x;
        else if (single(ga) && inside(gb.port.x) && sideFree(ga, gb.port.x)) ga.port.x = gb.port.x;
      }
    }
  }
  const portId = (nodeId, side, p) => [nodeId, side, Math.round(p.x), Math.round(p.y)].join('::');
  const portCount = new Map();
  for (const plan of plans) {
    plan.portA = portId(plan.edge.from, plan.sa, plan.pa);
    plan.portB = portId(plan.edge.to, plan.sb, plan.pb);
    for (const id of [plan.portA, plan.portB]) portCount.set(id, (portCount.get(id) || 0) + 1);
  }

  // 5. 経路の候補: 線ごとに「どの幹・どの横の通り道を使うか」の選択肢を並べる
  const colSide = (col, g) => (col <= g ? 'L' : 'R');
  const rowSide = (row, k) => (row < k ? 'U' : 'D');
  const corridorFree = (y, c1, c2) => {
    const lo = Math.min(c1, c2), hi = Math.max(c1, c2);
    for (const r of rects.values()) {
      if (r.c > lo && r.c < hi && y > r.y - 8 && y < r.y + r.h + 8) return false;
    }
    return true;
  };
  const rowChoices = (plan) => {
    const { a, b } = plan;
    if (a.r === b.r) return [a.r + 1, a.r];
    const out = [];
    for (let k = Math.min(a.r, b.r) + 1; k <= Math.max(a.r, b.r); k++) out.push(k);
    return out;
  };
  for (const plan of plans) {
    const { a, b, pa, pb } = plan;
    const options = [];
    if (plan.mode === 'c') {
      options.push({ type: 'z', owner: 'a' }, { type: 'z', owner: 'b' });
    } else if (plan.mode === 'v') {
      if (Math.abs(pa.x - pb.x) < 1) options.push({ type: 'straight' });
      else options.push({ type: 'vz', owner: 'a' }, { type: 'vz', owner: 'b' });
    } else {
      plan.gA = a.c < b.c ? a.c : a.c - 1;
      plan.gB = a.c < b.c ? b.c - 1 : b.c;
      if (plan.gA === plan.gB) {
        if (Math.abs(pa.y - pb.y) < 1) options.push({ type: 'straight' });
        else options.push({ type: 'z', owner: 'a' }, { type: 'z', owner: 'b' });
      } else {
        // 間の列を横切れる高さがあれば、横の通り道を使わない経路も候補にする
        if (corridorFree(pb.y, a.c, b.c)) options.push({ type: 'z', owner: 'a' });
        if (corridorFree(pa.y, a.c, b.c)) options.push({ type: 'z', owner: 'b' });
        for (const k of rowChoices(plan)) options.push({ type: 'bus', k });
      }
    }
    plan.options = options;
    // 最初の選択: 束の大きい側の幹を使う。横の通り道しか無ければ最初の候補
    const owner = plan.gb.plans.length > plan.ga.plans.length ? 'b' : 'a';
    plan.choice = options.find((o) => o.owner === owner) || options.find((o) => o.owner) || options[0];
  }

  // 6. 選択から幹と通り道を組み、車線を決め、区間 (由来の札つき) を作る
  let trunkCount = 0;
  const build = (exactLimit, passes) => {
    const trunks = new Map();
    const trunkOf = (orient, slot, key) => {
      const id = [orient, slot, key].join('::');
      let trunk = trunks.get(id);
      if (!trunk) {
        trunk = { id, orient, slot, att: [], coord: orient === 'v' ? vGutterCenter(geo, slot) : hGutterCenter(geo, slot) };
        trunks.set(id, trunk);
      }
      return trunk;
    };
    // 付け根: 幹のどの位置から、どちら向き (L/R/U/D) に横線が出るか。port は同じ出入口どうしの合流を区別する
    const attach = (trunk, at, dir, port) => trunk.att.push({ at, dir, port, value: 0 });
    for (const plan of plans) {
      const { a, b, pa, pb, choice } = plan;
      plan.reverse = false;
      if (choice.type === 'straight') {
        plan.route = { type: 'straight' };
      } else if (choice.type === 'vz') {
        const k = Math.max(a.r, b.r);
        const trunk = trunkOf('h', k, (choice.owner === 'a' ? plan.ga : plan.gb).key);
        attach(trunk, () => pa.x, rowSide(a.r, k), plan.portA);
        attach(trunk, () => pb.x, rowSide(b.r, k), plan.portB);
        plan.route = { type: 'vz', trunk };
        plan.reverse = choice.owner === 'b';
      } else if (choice.type === 'z') {
        const slot = plan.mode === 'c' ? a.c : choice.owner === 'a' ? plan.gA : plan.gB;
        const trunk = trunkOf('v', slot, (choice.owner === 'a' ? plan.ga : plan.gb).key);
        attach(trunk, () => pa.y, plan.mode === 'c' ? 'L' : colSide(a.c, slot), plan.portA);
        attach(trunk, () => pb.y, plan.mode === 'c' ? 'L' : colSide(b.c, slot), plan.portB);
        plan.route = { type: 'z', trunk };
        plan.reverse = choice.owner === 'b';
      } else {
        const { gA, gB } = plan;
        const k = choice.k;
        const dir = gB > gA ? 1 : -1;
        const trunkA = trunkOf('v', gA, plan.ga.key);
        // 同じ幹から同じ向きへ出る線は同じ通り道を共有し、単独の降り先は同じ隙間へ降りる他の線と縦線を共有する
        const bus = trunkOf('h', k, 'bus::' + trunkA.id + '::' + dir);
        const trunkB = plan.gb.plans.length === 1 ? trunkOf('v', gB, 'drop::' + bus.id) : trunkOf('v', gB, plan.gb.key);
        attach(trunkA, () => pa.y, colSide(a.c, gA), plan.portA);
        attach(trunkA, () => bus.coord, dir > 0 ? 'R' : 'L', null);
        attach(trunkB, () => bus.coord, dir > 0 ? 'L' : 'R', null);
        attach(trunkB, () => pb.y, colSide(b.c, gB), plan.portB);
        attach(bus, () => trunkA.coord, rowSide(a.r, k), null);
        attach(bus, () => trunkB.coord, rowSide(b.r, k), null);
        plan.route = { type: 'bus', trunkA, bus, trunkB };
        plan.reverse = plan.gb.plans.length > plan.ga.plans.length;
      }
    }
    trunkCount = trunks.size;
    for (let pass = 0; pass < passes; pass++) {
      assignLanes(trunks, 'v', geo, exactLimit);
      assignLanes(trunks, 'h', geo, exactLimit);
    }
    for (const plan of plans) {
      const { pa, pb, route } = plan;
      const A = 'port:' + plan.portA, B = 'port:' + plan.portB;
      const pt = (x, y) => ({ x, y });
      let raw;
      if (route.type === 'straight') {
        raw = [[pt(pa.x, pa.y), pt(pb.x, pb.y), [A, B]]];
      } else if (route.type === 'z') {
        const x = route.trunk.coord;
        raw = [[pt(pa.x, pa.y), pt(x, pa.y), [A]], [pt(x, pa.y), pt(x, pb.y), ['trunk:' + route.trunk.id]], [pt(x, pb.y), pt(pb.x, pb.y), [B]]];
      } else if (route.type === 'vz') {
        const y = route.trunk.coord;
        raw = [[pt(pa.x, pa.y), pt(pa.x, y), [A]], [pt(pa.x, y), pt(pb.x, y), ['trunk:' + route.trunk.id]], [pt(pb.x, y), pt(pb.x, pb.y), [B]]];
      } else {
        const xA = route.trunkA.coord, xB = route.trunkB.coord, y = route.bus.coord;
        raw = [
          [pt(pa.x, pa.y), pt(xA, pa.y), [A]],
          [pt(xA, pa.y), pt(xA, y), ['trunk:' + route.trunkA.id]],
          [pt(xA, y), pt(xB, y), ['trunk:' + route.bus.id]],
          [pt(xB, y), pt(xB, pb.y), ['trunk:' + route.trunkB.id]],
          [pt(xB, pb.y), pt(pb.x, pb.y), [B]],
        ];
      }
      plan.segments = raw
        .filter(([p, q]) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y) > 0.5)
        .map(([p, q, tags]) => ({ p, q, tags }));
      if (!plan.segments.length) plan.segments = [{ p: pt(pa.x, pa.y), q: pt(pb.x, pb.y), tags: [A, B] }];
    }
  };

  // 採点: 横切り > 由来の違う線の重なり > 幹の本数 (束を崩さない) > 曲がり > 長さ
  // 実測 2026-09-17: 幹の本数を数えない版は、数pxの短縮で主キーから出る束が並走する線へ崩れた
  const score = () => {
    const segs = [];
    let bends = 0, length = 0;
    plans.forEach((plan, i) => {
      bends += Math.max(0, plan.segments.length - 1);
      for (const s of plan.segments) {
        length += Math.abs(s.q.x - s.p.x) + Math.abs(s.q.y - s.p.y);
        segs.push({
          i, tags: s.tags, h: Math.abs(s.p.y - s.q.y) < 0.5,
          x1: Math.min(s.p.x, s.q.x), x2: Math.max(s.p.x, s.q.x), y1: Math.min(s.p.y, s.q.y), y2: Math.max(s.p.y, s.q.y),
        });
      }
    });
    let crossings = 0, overlaps = 0;
    for (let x = 0; x < segs.length; x++) {
      const s = segs[x];
      for (let y = x + 1; y < segs.length; y++) {
        const t = segs[y];
        if (s.i === t.i) continue;
        if (s.h !== t.h) {
          const hs = s.h ? s : t, vs = s.h ? t : s;
          if (vs.x1 > hs.x1 + 1 && vs.x1 < hs.x2 - 1 && hs.y1 > vs.y1 + 1 && hs.y1 < vs.y2 - 1) crossings++;
        } else if (s.h ? Math.abs(s.y1 - t.y1) < 1 : Math.abs(s.x1 - t.x1) < 1) {
          const lo = s.h ? Math.max(s.x1, t.x1) : Math.max(s.y1, t.y1);
          const hi = s.h ? Math.min(s.x2, t.x2) : Math.min(s.y2, t.y2);
          if (hi - lo > 2 && !s.tags.some((tag) => t.tags.includes(tag))) overlaps++;
        }
      }
    }
    return crossings * 1000 + overlaps * 400 + trunkCount * 30 + bends * 6 + length * 0.02;
  };

  // 7. 局所探索: 線を1本ずつ別の候補へ替えてみて、全体の点が下がる物だけ採る
  build(6, 2);
  let best = score();
  for (let sweep = 0; sweep < 3; sweep++) {
    let improved = false;
    for (const plan of plans) {
      if (plan.options.length < 2) continue;
      let bestChoice = plan.choice;
      for (const option of plan.options) {
        if (option === bestChoice) continue;
        plan.choice = option;
        build(6, 2);
        const value = score();
        if (value < best - 1) { best = value; bestChoice = option; improved = true; }
      }
      plan.choice = bestChoice;
    }
    if (!improved) break;
  }
  build(EXACT_ORDER_LIMIT, 3);
  for (const plan of plans) {
    const pts = simplifyPath([plan.segments[0].p, ...plan.segments.map((s) => s.q)]);
    // 束の側から描き始めると、点線の間隔が共有区間で揃う
    plan.pts = plan.reverse ? pts.reverse() : pts;
  }

  const segmentsOf = (plan) => plan.pts.slice(0, -1).map((p, i) => ({ p, q: plan.pts[i + 1] }));
  const allSegments = plans.map(segmentsOf);
  const span = (seg, vertical) => (vertical
    ? [Math.min(seg.p.y, seg.q.y), Math.max(seg.p.y, seg.q.y)]
    : [Math.min(seg.p.x, seg.q.x), Math.max(seg.p.x, seg.q.x)]);
  const isShared = (index, seg) => {
    const vertical = Math.abs(seg.p.x - seg.q.x) < 0.5;
    const [lo, hi] = span(seg, vertical);
    return allSegments.some((list, other) => other !== index && list.some((o) => {
      if ((Math.abs(o.p.x - o.q.x) < 0.5) !== vertical) return false;
      if (vertical ? Math.abs(o.p.x - seg.p.x) > 0.5 : Math.abs(o.p.y - seg.p.y) > 0.5) return false;
      const [olo, ohi] = span(o, vertical);
      return Math.min(hi, ohi) - Math.max(lo, olo) > 2;
    }));
  };
  plans.forEach((plan, index) => {
    const specs = [];
    const pts = plan.pts;
    if (pts.length === 2) specs.push({ kind: 'line', p: pts[0], q: pts[1] });
    if (portCount.get(plan.portB) === 1) specs.push({ kind: 'end', rect: plan.b, side: plan.sb, port: plan.pb });
    if (portCount.get(plan.portA) === 1) specs.push({ kind: 'end', rect: plan.a, side: plan.sa, port: plan.pa });
    const length = (seg) => Math.abs(seg.q.x - seg.p.x) + Math.abs(seg.q.y - seg.p.y);
    const segments = allSegments[index].slice().sort((s1, s2) => length(s2) - length(s1));
    for (const seg of segments) {
      if (length(seg) > 24 && !isShared(index, seg)) specs.push({ kind: 'line', p: seg.p, q: seg.q });
    }
    if (segments.length) specs.push({ kind: 'line', p: segments[0].p, q: segments[0].q });
    plan.labelSpecs = specs;
  });
  return plans;
}

// t を u より前 (左・上) に置いた時に、互いの付け根の横線が相手の幹を横切る回数
function crossCost(t, u) {
  let cost = 0;
  for (const x of u.att) {
    if ((x.dir === 'L' || x.dir === 'U') && x.value > t.lo - 0.5 && x.value < t.hi + 0.5 && !(x.port && t.ports.has(x.port))) cost++;
  }
  for (const x of t.att) {
    if ((x.dir === 'R' || x.dir === 'D') && x.value > u.lo - 0.5 && x.value < u.hi + 0.5 && !(x.port && u.ports.has(x.port))) cost++;
  }
  return cost;
}

function assignLanes(trunks, orient, geo, exactLimit) {
  const bySlot = new Map();
  for (const trunk of trunks.values()) {
    if (trunk.orient !== orient) continue;
    for (const x of trunk.att) x.value = x.at();
    const values = trunk.att.map((x) => x.value);
    trunk.lo = Math.min(...values);
    trunk.hi = Math.max(...values);
    trunk.ports = new Set(trunk.att.map((x) => x.port).filter(Boolean));
    // 前向き (L/U) の付け根が多い幹ほど前に置くと、付け根の横線が短くなる (同点の時だけ効く)
    trunk.lean = trunk.att.reduce((sum, x) => sum + (x.dir === 'L' || x.dir === 'U' ? -1 : 1), 0) / trunk.att.length;
    if (!bySlot.has(trunk.slot)) bySlot.set(trunk.slot, []);
    bySlot.get(trunk.slot).push(trunk);
  }
  const overlaps = (t, u) => t.lo <= u.hi + 8 && u.lo <= t.hi + 8;
  for (const [slot, list] of bySlot) {
    const order = orderTrunks(list, exactLimit);
    const lanes = [];
    const laneOf = new Map();
    for (const t of order) {
      let lane = 0;
      for (const [u, uLane] of laneOf) {
        if (overlaps(u, t) || crossCost(u, t) + crossCost(t, u) > 0) lane = Math.max(lane, uLane + 1);
      }
      while (lanes[lane] && lanes[lane].some((u) => overlaps(u, t))) lane++;
      (lanes[lane] ||= []).push(t);
      laneOf.set(t, lane);
    }
    const n = lanes.length;
    const room = orient === 'v' ? geo.gapX : geo.gapY;
    const spacing = n > 1 ? Math.min(LANE_SPACING, (room - 20) / (n - 1)) : 0;
    const center = orient === 'v' ? vGutterCenter(geo, slot) : hGutterCenter(geo, slot);
    for (const [t, lane] of laneOf) t.coord = center + (lane - (n - 1) / 2) * spacing;
  }
}

// 並び順: 少なければ全順序から最小を厳密に、多ければ寄せてから隣どうしの入れ替えで詰める
function orderTrunks(list, exactLimit) {
  const n = list.length;
  if (n <= 1) return list.slice();
  const cost = list.map((t, i) => list.map((u, j) => (i === j ? 0 : crossCost(t, u) + (t.lean > u.lean ? 1e-3 : 0))));
  if (n <= exactLimit) {
    const size = 1 << n;
    const best = new Float64Array(size).fill(Infinity);
    const pick = new Int8Array(size).fill(-1);
    best[0] = 0;
    for (let mask = 0; mask < size; mask++) {
      const base = best[mask];
      if (base === Infinity) continue;
      for (let t = 0; t < n; t++) {
        if (mask & (1 << t)) continue;
        let add = 0;
        for (let u = 0; u < n; u++) if (mask & (1 << u)) add += cost[u][t];
        const next = mask | (1 << t);
        if (base + add < best[next]) { best[next] = base + add; pick[next] = t; }
      }
    }
    const order = [];
    for (let mask = size - 1; mask; mask &= ~(1 << pick[mask])) order.push(list[pick[mask]]);
    return order.reverse();
  }
  const idx = list.map((_, i) => i);
  const net = idx.map((i) => idx.reduce((sum, j) => sum + cost[i][j] - cost[j][i], 0));
  idx.sort((i, j) => net[i] - net[j]);
  for (let improved = true; improved;) {
    improved = false;
    for (let p = 0; p + 1 < n; p++) {
      const i = idx[p], j = idx[p + 1];
      if (cost[j][i] < cost[i][j]) { idx[p] = j; idx[p + 1] = i; improved = true; }
    }
  }
  return idx.map((i) => list[i]);
}

function simplifyPath(pts) {
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) continue;
    if (out.length >= 2) {
      const prev = out[out.length - 2];
      const straight = (Math.abs(prev.x - last.x) < 0.5 && Math.abs(last.x - p.x) < 0.5)
        || (Math.abs(prev.y - last.y) < 0.5 && Math.abs(last.y - p.y) < 0.5);
      if (straight) out.pop();
    }
    out.push(p);
  }
  return out;
}

function roundedPath(pts, radius) {
  if (pts.length < 2) return '';
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i - 1], c = pts[i], n = pts[i + 1];
    const l1 = Math.hypot(c.x - p.x, c.y - p.y), l2 = Math.hypot(n.x - c.x, n.y - c.y);
    const r = Math.min(radius, l1 / 2, l2 / 2);
    if (r < 0.5) { d += ` L${c.x.toFixed(1)},${c.y.toFixed(1)}`; continue; }
    const ax = c.x + ((p.x - c.x) / l1) * r, ay = c.y + ((p.y - c.y) / l1) * r;
    const bx = c.x + ((n.x - c.x) / l2) * r, by = c.y + ((n.y - c.y) / l2) * r;
    d += ` L${ax.toFixed(1)},${ay.toFixed(1)} Q${c.x.toFixed(1)},${c.y.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L${last.x.toFixed(1)},${last.y.toFixed(1)}`;
}

// 札の中心と、動かしてよい範囲 (その線に沿った1方向) を決める
function placeLabel(spec, w, h, geo) {
  const fixed = (x, y, axis) => ({ x, y, axis, min: axis === 'x' ? x : y, max: axis === 'x' ? x : y });
  if (spec.kind === 'line') {
    const { p, q } = spec;
    const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
    if (Math.abs(p.y - q.y) < 0.5) {
      const lo = Math.min(p.x, q.x) + w / 2 + 4, hi = Math.max(p.x, q.x) - w / 2 - 4;
      return lo <= hi ? { x: mx, y: p.y, axis: 'x', min: lo, max: hi } : fixed(mx, p.y, 'x');
    }
    const lo = Math.min(p.y, q.y) + h / 2 + 4, hi = Math.max(p.y, q.y) - h / 2 - 4;
    return lo <= hi ? { x: p.x, y: my, axis: 'y', min: lo, max: hi } : fixed(p.x, my, 'y');
  }
  const { rect: r, side, port } = spec;
  if (side === 'L' || side === 'R') {
    const inner = side === 'R' ? r.x + r.w : r.x;
    const outer = side === 'R'
      ? (r.c + 1 < geo.cols ? geo.colX[r.c + 1] : inner + geo.gapX)
      : (r.c > 0 ? geo.colX[r.c - 1] + geo.colW[r.c - 1] : inner - geo.gapX);
    const sign = side === 'R' ? 1 : -1;
    const near = inner + sign * (6 + w / 2), far = outer - sign * (4 + w / 2);
    if (sign * (far - near) >= 0) return { x: near, y: port.y, axis: 'x', min: Math.min(near, far), max: Math.max(near, far) };
    return fixed((inner + outer) / 2, port.y, 'x');
  }
  const inner = side === 'B' ? r.y + r.h : r.y;
  const outer = side === 'B'
    ? (r.r + 1 < geo.rows ? geo.rowY[r.r + 1] : inner + geo.gapY)
    : (r.r > 0 ? geo.rowY[r.r - 1] + geo.rowH[r.r - 1] : inner - geo.gapY);
  const sign = side === 'B' ? 1 : -1;
  const near = inner + sign * (6 + h / 2), far = outer - sign * (4 + h / 2);
  if (sign * (far - near) >= 0) return { x: port.x, y: near, axis: 'y', min: Math.min(near, far), max: Math.max(near, far) };
  return fixed(port.x, (inner + outer) / 2, 'y');
}

// 札を候補 (優先順) から選ぶ。各候補は線に沿って動かせる範囲を持つので、数か所を試し、
// 既に置いた札・箱と重ならず、優先度の高い候補を選ぶ。最後に残った重なりを relaxLabels で解く
function placeLabels(items, geo, obstacles) {
  const area = (a, b) => {
    const dx = Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2);
    const dy = Math.min(a.y + a.h / 2, b.y + b.h / 2) - Math.max(a.y - a.h / 2, b.y - b.h / 2);
    return dx > 0 && dy > 0 ? dx * dy : 0;
  };
  const boxes = obstacles.map((r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w, h: r.h }));
  const placed = [];
  const ordered = items.slice().sort((i1, i2) => i1.specs.length - i2.specs.length);
  for (const item of ordered) {
    let best = null, bestScore = Infinity;
    item.specs.forEach((spec, rank) => {
      const base = placeLabel(spec, item.w, item.h, geo);
      const start = base.axis === 'x' ? base.x : base.y;
      const tries = [start];
      for (let i = 0; i <= 6; i++) tries.push(base.min + ((base.max - base.min) * i) / 6);
      for (const value of tries) {
        const candidate = { ...base, w: item.w, h: item.h, x: base.axis === 'x' ? value : base.x, y: base.axis === 'y' ? value : base.y };
        let score = rank * 40 + Math.abs(value - start) * 0.05;
        for (const other of placed) score += area(candidate, other) * 6;
        for (const box of boxes) score += area(candidate, box) * 3;
        if (score < bestScore) { bestScore = score; best = candidate; }
      }
    });
    Object.assign(item, best);
    placed.push(item);
  }
  relaxLabels(items, obstacles);
}

// 札どうし・札と箱の重なりを、札ごとに許された1方向へずらして解く
function relaxLabels(items, obstacles) {
  const overlap = (a, b) => {
    const dx = Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2);
    const dy = Math.min(a.y + a.h / 2, b.y + b.h / 2) - Math.max(a.y - a.h / 2, b.y - b.h / 2);
    return dx > 0 && dy > 0 ? { dx, dy } : null;
  };
  const slide = (item, amount) => {
    if (item.max - item.min < 0.5) return;
    if (item.axis === 'x') item.x = Math.max(item.min, Math.min(item.max, item.x + amount));
    else item.y = Math.max(item.min, Math.min(item.max, item.y + amount));
  };
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      for (let j = i + 1; j < items.length; j++) {
        const b = items[j];
        const o = overlap(a, b);
        if (!o) continue;
        const alongA = a.axis === 'x' ? o.dx : o.dy;
        const dirA = (a.axis === 'x' ? a.x <= b.x : a.y <= b.y) ? -1 : 1;
        slide(a, dirA * (alongA / 2 + 1));
        const alongB = b.axis === 'x' ? o.dx : o.dy;
        const dirB = (b.axis === 'x' ? b.x < a.x : b.y < a.y) ? -1 : 1;
        slide(b, dirB * (alongB / 2 + 1));
        moved = true;
      }
      for (const r of obstacles) {
        const box = { x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w, h: r.h };
        const o = overlap(a, box);
        if (!o) continue;
        const dir = a.axis === 'x' ? (a.x < box.x ? -1 : 1) : (a.y < box.y ? -1 : 1);
        slide(a, dir * ((a.axis === 'x' ? o.dx : o.dy) + 2));
        moved = true;
      }
    }
    if (!moved) break;
  }
}
