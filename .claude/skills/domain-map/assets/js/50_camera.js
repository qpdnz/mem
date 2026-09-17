// ---- camera: 移動・拡大縮小 ----
const ZOOM_MIN = 0.15;
const ZOOM_MAX = 2.5;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
let cameraAnimation = 0;

function stageSize() {
  const vp = $('viewport');
  return { w: vp.clientWidth, h: vp.clientHeight };
}

// 見出しの札と下の操作盤に隠れない範囲
function safeArea() {
  const { w, h } = stageSize();
  const brief = $('brief');
  const briefBottom = brief && !brief.hidden ? brief.offsetTop + brief.offsetHeight + 20 : 24;
  return { w, h, left: 36, right: 36, top: Math.min(briefBottom, h * 0.42), bottom: 84 };
}

const SUPPORTS_ZOOM = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('zoom', '0.5');

// 動かしている間は transform で引き伸ばし、止まったら zoom を入れ直して実寸で描き直させる。
// 止まっている間の位置は整数にする (小数の位置は文字の輪郭を半画素ずらしてにじませる)
function applyCamera(view, moving) {
  const { x, y, k } = view.cam;
  const tx = moving ? x : Math.round(x);
  const ty = moving ? y : Math.round(y);
  if (!SUPPORTS_ZOOM) {
    view.pan.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`;
  } else if (moving) {
    view.pan.style.transform = `translate(${tx}px, ${ty}px) scale(${k / (view.zoomApplied || 1)})`;
  } else {
    view.zoomApplied = k;
    view.world.style.zoom = k;
    view.pan.style.transform = `translate(${tx}px, ${ty}px)`;
  }
  const vp = $('viewport');
  const size = 22 * k;
  vp.style.backgroundSize = `${size}px ${size}px`;
  vp.style.backgroundPosition = `${tx}px ${ty}px`;
  $('zoom-value').textContent = Math.round(k * 100) + '%';
}

// 動かしている間だけ層を固定する (終わったら外して描き直させる)
let settleTimer = 0;
function setMoving(view, moving) {
  if (!view) return;
  clearTimeout(settleTimer);
  if (moving) {
    view.pan.classList.add('moving');
    return;
  }
  settleTimer = setTimeout(() => {
    view.pan.classList.remove('moving');
    applyCamera(view, false);
  }, 120);
}

function setCamera(view, target, animate) {
  cancelAnimationFrame(cameraAnimation);
  // 画面が隠れている間は requestAnimationFrame が止まる。動かす代わりに即座に置く
  if (!animate || !view.cam || document.hidden) {
    view.cam = { ...target };
    applyCamera(view);
    return;
  }
  const from = { ...view.cam };
  const { w, h } = stageSize();
  const cx = w / 2, cy = h / 2;
  const fromWorld = { x: (cx - from.x) / from.k, y: (cy - from.y) / from.k };
  const toWorld = { x: (cx - target.x) / target.k, y: (cy - target.y) / target.k };
  const start = performance.now();
  const duration = 560;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  setMoving(view, true);
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const e = ease(t);
    const k = Math.exp(Math.log(from.k) + (Math.log(target.k) - Math.log(from.k)) * e);
    const wx = fromWorld.x + (toWorld.x - fromWorld.x) * e;
    const wy = fromWorld.y + (toWorld.y - fromWorld.y) * e;
    view.cam = t < 1 ? { k, x: cx - wx * k, y: cy - wy * k } : { ...target };
    applyCamera(view, t < 1);
    if (t < 1) cameraAnimation = requestAnimationFrame(tick);
    else setMoving(view, false);
  };
  cameraAnimation = requestAnimationFrame(tick);
}

function fitView(view, animate) {
  if (!view) return;
  const area = safeArea();
  const b = view.bounds;
  const availW = Math.max(120, area.w - area.left - area.right);
  const availH = Math.max(120, area.h - area.top - area.bottom);
  const fit = Math.min(availW / Math.max(1, b.w), availH / Math.max(1, b.h), 1);
  const k = clamp(Math.max(fit, 0.32), ZOOM_MIN, ZOOM_MAX);
  // 全体が入るなら中央へ、入らない大きな図は左上から読めるように置く
  const x = b.w * k <= availW ? area.left + (availW - b.w * k) / 2 - b.x * k : area.left - b.x * k;
  const y = b.h * k <= availH ? area.top + (availH - b.h * k) / 2 - b.y * k : area.top - b.y * k;
  setCamera(view, { x, y, k }, animate);
}

// 最初に開く時の倍率。全体が入るならそのまま、入らないなら「文字が読める」を優先して
// 左上から見せる (小さい字を縮めるとにじむ。全体は % か f で見る)
const OPEN_MIN_ZOOM = 0.85;
function openView(view) {
  if (!view) return;
  const area = safeArea();
  const b = view.bounds;
  const availW = Math.max(120, area.w - area.left - area.right);
  const availH = Math.max(120, area.h - area.top - area.bottom);
  const fit = Math.min(availW / Math.max(1, b.w), availH / Math.max(1, b.h), 1);
  if (fit >= OPEN_MIN_ZOOM) {
    fitView(view, false);
    return;
  }
  const k = clamp(OPEN_MIN_ZOOM, ZOOM_MIN, ZOOM_MAX);
  setCamera(view, { k, x: area.left - b.x * k, y: area.top - b.y * k }, false);
}

function focusNode(view, id, animate) {
  const r = view.geo.rects.get(id);
  if (!r) return;
  const area = safeArea();
  const availW = Math.max(120, area.w - area.left - area.right);
  const availH = Math.max(120, area.h - area.top - area.bottom);
  let k = clamp(Math.max(view.cam ? view.cam.k : 1, 0.8), ZOOM_MIN, 1.2);
  k = Math.min(k, availW / (r.w + 120));
  k = clamp(k, ZOOM_MIN, ZOOM_MAX);
  const x = area.left + availW / 2 - (r.x + r.w / 2) * k;
  const y = r.h * k + 40 > availH
    ? area.top + 16 - r.y * k
    : area.top + availH / 2 - (r.y + r.h / 2) * k;
  setCamera(view, { x, y, k }, animate);
}

function zoomAt(view, factor, px, py) {
  if (!view || !view.cam) return;
  cancelAnimationFrame(cameraAnimation);
  const c = view.cam;
  const k = clamp(c.k * factor, ZOOM_MIN, ZOOM_MAX);
  const f = k / c.k;
  view.cam = { k, x: px - (px - c.x) * f, y: py - (py - c.y) * f };
  setMoving(view, true);
  applyCamera(view, true);
  setMoving(view, false);
}

function zoomCenter(factor) {
  const { w, h } = stageSize();
  zoomAt(STATE.views[STATE.view], factor, w / 2, h / 2);
}

function bindCanvas() {
  const vp = $('viewport');
  let drag = null;

  vp.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    const view = STATE.views[STATE.view];
    if (!view || !view.cam) return;
    cancelAnimationFrame(cameraAnimation);
    drag = {
      id: ev.pointerId, sx: ev.clientX, sy: ev.clientY, cx: view.cam.x, cy: view.cam.y, moved: false,
      node: ev.target.closest('.node'), row: ev.target.closest('.er-row'),
    };
    vp.setPointerCapture(ev.pointerId);
  });

  vp.addEventListener('pointermove', (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    const dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) > 4) {
      drag.moved = true;
      vp.classList.add('dragging');
      setMoving(STATE.views[STATE.view], true);
    }
    if (drag.moved) {
      const view = STATE.views[STATE.view];
      view.cam.x = drag.cx + dx;
      view.cam.y = drag.cy + dy;
      applyCamera(view, true);
    }
  });

  const end = (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    vp.classList.remove('dragging');
    if (drag.moved) setMoving(STATE.views[STATE.view], false);
    if (!drag.moved && ev.type === 'pointerup') {
      if (drag.node) {
        pauseDemo(false);
        selectItem({ kind: drag.node.dataset.kind, id: drag.node.dataset.id, field: drag.row ? drag.row.dataset.field : undefined }, { focus: false });
      } else {
        clearSelection();
      }
    }
    drag = null;
  };
  vp.addEventListener('pointerup', end);
  vp.addEventListener('pointercancel', end);

  vp.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const view = STATE.views[STATE.view];
    if (!view || !view.cam) return;
    const rect = vp.getBoundingClientRect();
    const px = ev.clientX - rect.left, py = ev.clientY - rect.top;
    const lineMode = ev.deltaMode === 1;
    const notch = lineMode || (ev.deltaX === 0 && Math.abs(ev.deltaY) >= 40 && Number.isInteger(ev.deltaY));
    if (ev.ctrlKey || notch) {
      const amount = lineMode ? ev.deltaY * 33 : ev.deltaY;
      zoomAt(view, Math.exp(-amount * (ev.ctrlKey ? 0.01 : 0.0016)), px, py);
    } else {
      cancelAnimationFrame(cameraAnimation);
      view.cam.x -= ev.deltaX;
      view.cam.y -= ev.deltaY;
      setMoving(view, true);
      applyCamera(view, true);
      setMoving(view, false);
    }
  }, { passive: false });
}
