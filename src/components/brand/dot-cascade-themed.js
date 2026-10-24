/** Dot Cascade — transparent Canvas 2D, no assets or runtime dependencies. */
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const finite = (n, fallback) => Number.isFinite(n) ? n : fallback;
const jobs = new Set();
let sharedRaf = 0;
function tick(now) {
  sharedRaf = 0;
  jobs.forEach(job => job(now));
  if (jobs.size) sharedRaf = requestAnimationFrame(tick);
}
function subscribe(job) {
  jobs.add(job);
  if (!sharedRaf) sharedRaf = requestAnimationFrame(tick);
}
function unsubscribe(job) {
  jobs.delete(job);
  if (!jobs.size && sharedRaf) {
    cancelAnimationFrame(sharedRaf);
    sharedRaf = 0;
  }
}

/** Mount on a canvas; pointer events are read from its container, not captured. */
export function createDotCascade(canvas, options = {}, host = canvas.parentElement || canvas) {
  const surface = canvas.parentElement || host;
  let ctx;
  try { ctx = canvas.getContext('2d'); } catch { ctx = null; }
  if (!ctx) return {update() {}, destroy() {}, getStats: () => ({supported: false})};
  const settings = {
    spacing: 22.5, dotRadius: 1.1, startOpacity: .24, endOpacity: 0,
    direction: 'top-to-bottom',
    hoverRadius: 150, displacement: 3, fps: 60, interactive: true, color: '#FFFFFF',
  };
  const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let destroyed = false, visible = !('IntersectionObserver' in window);
  let width = 0, height = 0, scaleX = 1, scaleY = 1, gap = 22.5, dotR = 1.1;
  let columns = 0, rows = 0, maxShift = 3;
  let pointerInside = false, pointerInitialized = false, clientX = 0, clientY = 0;
  let pointerX = 0, pointerY = 0, targetX = 0, targetY = 0, level = 0;
  let previousRegion = null, lastFrame = -Infinity, lastTime = 0;
  let frames = 0, lastDotCount = 0, lastArea = 0;
  const offset = 1;
  const reduced = () => !!(motion && motion.matches);
  const enabled = () => !destroyed && visible && !document.hidden && !reduced() && settings.interactive;

  function allCells() { return {left:0, right:columns - 1, top:0, bottom:rows - 1}; }
  function affectedRegion() {
    if (level <= .0001 || !width || !height) return null;
    const reach = settings.hoverRadius + gap;
    const left = Math.max(0, Math.floor((pointerX - reach - offset) / gap));
    const right = Math.min(columns - 1, Math.ceil((pointerX + reach - offset) / gap));
    const top = Math.max(0, Math.floor((pointerY - reach - offset) / gap));
    const bottom = Math.min(rows - 1, Math.ceil((pointerY + reach - offset) / gap));
    return left <= right && top <= bottom ? {left, right, top, bottom} : null;
  }
  function overlaps(a,b) {
    return a.left <= b.right && b.left <= a.right && a.top <= b.bottom && b.top <= a.bottom;
  }
  function merge(a,b) {
    return {left:Math.min(a.left,b.left), right:Math.max(a.right,b.right), top:Math.min(a.top,b.top), bottom:Math.max(a.bottom,b.bottom)};
  }

  function drawRegion(region, clear) {
    if (!region || destroyed) return;
    const x0 = offset + (region.left - .5) * gap;
    const y0 = offset + (region.top - .5) * gap;
    const rw = (region.right - region.left + 1) * gap;
    const rh = (region.bottom - region.top + 1) * gap;
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    if (clear) ctx.clearRect(x0 - 1, y0 - 1, rw + 2, rh + 2);
    lastArea += Math.max(0, Math.min(width, x0 + rw) - Math.max(0, x0)) * Math.max(0, Math.min(height, y0 + rh) - Math.max(0, y0));
    const hoverR = settings.hoverRadius, radiusSquared = hoverR * hoverR;
    const vertical = settings.direction === 'top-to-bottom' || settings.direction === 'bottom-to-top';
    const reversed = settings.direction === 'bottom-to-top' || settings.direction === 'right-to-left';
    const firstLine = vertical ? region.top : region.left;
    const lastLine = vertical ? region.bottom : region.right;
    const firstPoint = vertical ? region.left : region.top;
    const lastPoint = vertical ? region.right : region.bottom;
    for (let line = firstLine; line <= lastLine; line++) {
      let fade = clamp(line * gap / Math.max(1, (vertical ? height : width) - offset), 0, 1);
      if (reversed) fade = 1 - fade;
      const opacity = settings.startOpacity + (settings.endOpacity - settings.startOpacity) * fade;
      if (opacity <= 0) continue;
      ctx.fillStyle = settings.color;
      ctx.globalAlpha = opacity;
      ctx.beginPath();
      for (let point = firstPoint; point <= lastPoint; point++) {
        const x = offset + (vertical ? point : line) * gap;
        const y = offset + (vertical ? line : point) * gap;
        let px = x, py = y;
        if (level > .0001) {
          const dx = x - pointerX, dy = y - pointerY;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared < radiusSquared) {
            const f = 1 - distanceSquared / radiusSquared;
            const influence = f * f * level;
            // A continuous outward field, zero both at the center and boundary.
            const shift = maxShift * 3.5 / hoverR * influence;
            px += dx * shift; py += dy * shift;
          }
        }
        ctx.moveTo(px + dotR, py);
        ctx.arc(px, py, dotR, 0, Math.PI * 2);
        lastDotCount++;
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function paintAll() {
    if (!width || !height || destroyed) return;
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    lastDotCount = 0; lastArea = 0;
    drawRegion(allCells(), false);
    previousRegion = affectedRegion();
    frames++;
  }
  function paintLocal() {
    const next = affectedRegion();
    lastDotCount = 0; lastArea = 0;
    if (previousRegion && next && overlaps(previousRegion,next)) drawRegion(merge(previousRegion,next), true);
    else {
      if (previousRegion) drawRegion(previousRegion, true);
      if (next) drawRegion(next, true);
    }
    previousRegion = next;
    frames++;
  }
  function stop(reset) {
    unsubscribe(frame);
    lastTime = 0; lastFrame = -Infinity;
    if (reset) {
      level = 0; pointerInside = false; pointerInitialized = false;
      if (previousRegion) paintLocal();
    }
  }

  function resize() {
    if (destroyed) return;
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) { stop(true); return; }
    const density = Math.min(1.5, window.devicePixelRatio || 1, Math.sqrt(1500000 / (r.width * r.height)));
    const bw = Math.max(2, Math.floor(r.width * density)), bh = Math.max(2, Math.floor(r.height * density));
    const nextGap = Math.max(settings.spacing, Math.sqrt(r.width * r.height / 16000));
    const changed = width !== r.width || height !== r.height || bw !== canvas.width || bh !== canvas.height || gap !== nextGap || dotR !== Math.min(settings.dotRadius,nextGap * .15);
    if (!changed) return;
    width = r.width; height = r.height;
    canvas.width = bw; canvas.height = bh;
    scaleX = bw / width; scaleY = bh / height;
    gap = nextGap; dotR = Math.min(settings.dotRadius,gap * .15);
    maxShift = Math.min(settings.displacement, gap * .5 - dotR - 2);
    columns = Math.max(1, Math.ceil((width - offset) / gap));
    rows = Math.max(1, Math.ceil((height - offset) / gap));
    pointerInitialized = false; level = 0; previousRegion = null;
    paintAll();
    if (pointerInside && enabled()) subscribe(frame);
  }
  function frame(now) {
    if (!enabled()) { stop(true); return; }
    const interval = 1000 / settings.fps;
    if (now - lastFrame < interval - .5) return;
    if (!Number.isFinite(lastFrame) || now - lastFrame > interval * 2) lastFrame = now;
    else lastFrame += interval;
    const dt = lastTime ? Math.min(.05,(now - lastTime) / 1000) : 1 / 60;
    lastTime = now;
    if (pointerInside) {
      const r = canvas.getBoundingClientRect();
      targetX = clientX - r.left; targetY = clientY - r.top;
      if (!pointerInitialized) {
        pointerX = targetX; pointerY = targetY; pointerInitialized = true;
      }
    }
    const positionEase = 1 - Math.exp(-6 * dt);
    pointerX += (targetX - pointerX) * positionEase;
    pointerY += (targetY - pointerY) * positionEase;
    const targetLevel = pointerInside ? 1 : 0;
    const responseRate = pointerInside ? 4 : 3;
    level += (targetLevel - level) * (1 - Math.exp(-responseRate * dt));
    const settled = Math.abs(targetX - pointerX) < .025 && Math.abs(targetY - pointerY) < .025 && Math.abs(targetLevel - level) < .001;
    if (settled) { pointerX = targetX; pointerY = targetY; level = targetLevel; }
    paintLocal();
    if (settled) stop(false);
  }
  function pointerMove(event) {
    if (!enabled() || event.pointerType === 'touch') return;
    clientX = event.clientX; clientY = event.clientY; pointerInside = true;
    subscribe(frame);
  }
  function pointerLeave() {
    pointerInside = false;
    if (enabled() && level > 0) subscribe(frame); else stop(true);
  }
  function onScroll() {
    if (pointerInside && enabled()) {
      const r = canvas.getBoundingClientRect();
      if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) pointerLeave();
      else subscribe(frame);
    }
  }
  function onState() {
    if (!enabled()) stop(true);
    else resize();
  }
  function update(next = {}) {
    if (destroyed) return;
    if ('spacing' in next) settings.spacing = clamp(finite(next.spacing,22.5),12,80);
    if ('dotRadius' in next) settings.dotRadius = clamp(finite(next.dotRadius,1.1),.6,3);
    if ('startOpacity' in next || 'topOpacity' in next) settings.startOpacity = clamp(finite(next.startOpacity ?? next.topOpacity,.24),0,1);
    if ('endOpacity' in next || 'bottomOpacity' in next) settings.endOpacity = clamp(finite(next.endOpacity ?? next.bottomOpacity,0),0,1);
    if (['top-to-bottom','bottom-to-top','left-to-right','right-to-left'].includes(next.direction)) settings.direction = next.direction;
    if ('hoverRadius' in next) settings.hoverRadius = clamp(finite(next.hoverRadius,150),60,240);
    if ('displacement' in next) settings.displacement = clamp(finite(next.displacement,3),0,12);
    if ('fps' in next) settings.fps = clamp(finite(next.fps,60),15,60);
    if ('interactive' in next) settings.interactive = !!next.interactive;
    if ('color' in next && typeof next.color === 'string') settings.color = next.color;
    stop(true);
    resize();
    maxShift = Math.min(settings.displacement, gap * .5 - dotR - 2);
    paintAll();
  }

  const pointerEvents = 'PointerEvent' in window;
  host.addEventListener(pointerEvents ? 'pointermove' : 'mousemove', pointerMove, {passive:true});
  host.addEventListener(pointerEvents ? 'pointerleave' : 'mouseleave', pointerLeave, {passive:true});
  host.addEventListener(pointerEvents ? 'pointercancel' : 'blur', pointerLeave, {passive:true});
  document.addEventListener('scroll', onScroll, {capture:true,passive:true});
  document.addEventListener('visibilitychange', onState);
  window.addEventListener('blur', pointerLeave);
  let ro = null, io = null;
  if ('ResizeObserver' in window) { ro = new ResizeObserver(resize); ro.observe(canvas); }
  else window.addEventListener('resize',resize,{passive:true});
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; onState(); });
    io.observe(canvas);
  }
  if (motion) {
    if (motion.addEventListener) motion.addEventListener('change',onState);
    else if (motion.addListener) motion.addListener(onState);
  }
  update(options);
  canvas.style.opacity = '1';
  surface.setAttribute('data-dots-ready','true');

  return {
    update,
    getStats: () => ({
      supported:true, frames, animating:jobs.has(frame), reducedMotion:reduced(),
      width,height, bufferWidth:canvas.width, bufferHeight:canvas.height,
      bufferBytes:canvas.width * canvas.height * 4, dotCount:columns * rows,
      lastPaintedDots:lastDotCount, lastPaintedArea:lastArea, spacing:gap, influence:level,
    }),
    destroy() {
      if (destroyed) return;
      stop(false); destroyed = true;
      host.removeEventListener(pointerEvents ? 'pointermove' : 'mousemove',pointerMove);
      host.removeEventListener(pointerEvents ? 'pointerleave' : 'mouseleave',pointerLeave);
      host.removeEventListener(pointerEvents ? 'pointercancel' : 'blur',pointerLeave);
      document.removeEventListener('scroll',onScroll,true);
      document.removeEventListener('visibilitychange',onState);
      window.removeEventListener('blur',pointerLeave);
      if (ro) ro.disconnect(); else window.removeEventListener('resize',resize);
      if (io) io.disconnect();
      if (motion) {
        if (motion.removeEventListener) motion.removeEventListener('change',onState);
        else if (motion.removeListener) motion.removeListener(onState);
      }
      surface.removeAttribute('data-dots-ready');
      canvas.style.opacity = '0';
    },
  };
}
