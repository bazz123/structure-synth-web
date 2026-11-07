'use strict';
// Render settings, the live view's lighting, CPU and GPU path tracing, and image
// export at a chosen size. This loads before the page script, so anything it
// uses from the page (renderer, camera, lastResult, status...) is read at call
// time, never while this file loads.

const byId = id => document.getElementById(id);

// Samples per pixel for each quality preset. The GPU path tracer also gets a
// bounce count; the CPU raytracer keeps its fixed one-bounce lighting.
const PRESETS = {
  preview: { cpu: 4, gpu: 16, bounces: 2 },
  standard: { cpu: 16, gpu: 128, bounces: 3 },
  high: { cpu: 64, gpu: 512, bounces: 4 },
  ultra: { cpu: 256, gpu: 2048, bounces: 6 },
};
const EXPORT_SIZES = [
  ['1280x720', '1280 × 720'], ['1920x1080', '1920 × 1080'], ['2560x1440', '2560 × 1440'],
  ['3840x2160', '3840 × 2160 (4K)'], ['1024x1024', '1024 × 1024'], ['2048x2048', '2048 × 2048'],
  ['1080x1920', '1080 × 1920 (portrait)'], ['custom', 'Custom'],
];
const MAX_EXPORT_SIDE = 16384;
const RENDER_DEFAULTS = {
  shadows: true, ao: true, light: 1, ambient: 1, shadowStrength: 0.65, aoStrength: 0.5, azimuth: 39, elevation: 48,
  engine: 'auto', samples: 0, bounces: 0,
  exportSize: '1920x1080', exportW: 1920, exportH: 1080, lockAspect: true, transparent: false, exportSource: 'path',
};
const renderSettings = (() => {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('ssw-render') || '{}') || {}; } catch (e) { /* storage blocked */ }
  return Object.assign({}, RENDER_DEFAULTS, saved);
})();
function saveRenderSettings() {
  try { localStorage.setItem('ssw-render', JSON.stringify(renderSettings)); } catch (e) { /* storage blocked */ }
}

const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vnorm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const megabytes = bytes => bytes < 1e6 ? '< 1 MB' : Math.round(bytes / 1e6).toLocaleString('en-US') + ' MB';

// ---------- Live view ----------

let viewportFx = null;
function attachViewport(renderer, scene, camera, controls) {
  viewportFx = new ViewportFx(renderer, scene, camera);
  viewportFx.apply(renderSettings);
  controls.addEventListener('start', () => { viewportFx.interacting = true; });
  controls.addEventListener('end', () => { viewportFx.interacting = false; draw(); });
}

// ---------- Jobs ----------

// `job` is what the view shows over the live render: a CPU raytrace that ends
// when it finishes, or a GPU view that keeps refining until it's stopped.
let job = null;
const gpuState = { tracer: null, promise: null, error: '' };

function renderOverlayActive() { return !!(job && job.kind === 'gpu'); }

function setRenderButton(running) { byId('render').textContent = running ? 'Stop' : 'Raytrace'; }

function hideShot() {
  shot.hidden = true;
  if (renderer) byId('hint').hidden = false;
}

function stopRender() {
  if (!job) return;
  const j = job;
  job = null;
  j.stopped = true;
  if (j.kind === 'cpu') j.handle.stop();
  if (j.kind === 'gpu') {
    j.canvas.hidden = true;
    if (!j.looping && j.target) j.target.destroy();
    if (renderer) byId('hint').hidden = false;
    draw();
  }
  setRenderButton(false);
  byId('bar').style.width = '0';
}

// Before a rebuild: a CPU raytrace is out of date, but a GPU view stays and
// picks up the new model when the build finishes.
function beforeBuild() {
  if (job && job.kind === 'cpu') stopRender();
  hideShot();
}

function onSceneBuilt(r) {
  if (viewportFx) viewportFx.setBounds(r.bounds);
  if (job && job.kind === 'gpu') {
    job.sceneDirty = true;
    runGpuLoop(job);
  }
}

function onCameraChange() {
  if (job && job.kind === 'gpu') {
    job.restart = true;
    runGpuLoop(job);
  } else {
    if (job && job.kind === 'cpu') stopRender();
    hideShot();
  }
}

function viewPixelSize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  return { width: Math.max(1, Math.round(view.clientWidth * dpr)), height: Math.max(1, Math.round(view.clientHeight * dpr)) };
}

// Only a real change in pixel size gets a new GPU target.
function onViewResize() {
  if (!job || job.kind !== 'gpu' || !job.target) return;
  const { width, height } = viewPixelSize();
  if (width === job.target.width && height === job.target.height) return;
  job.resize = true;
  runGpuLoop(job);
}

function currentCamera() {
  if (!renderer) return fallbackCam;
  const p = camera.position, t = controls.target, u = camera.up;
  return { pos: [p.x, p.y, p.z], target: [t.x, t.y, t.z], up: [u.x, u.y, u.z], fov: camera.fov };
}

function lightForTracers() {
  return { azimuth: renderSettings.azimuth, elevation: renderSettings.elevation, intensity: renderSettings.light, ambient: renderSettings.ambient };
}

function qualityPreset() { return PRESETS[byId('quality').value] || PRESETS.standard; }

function cpuSamples() {
  if (renderSettings.samples > 0) return renderSettings.samples;
  const q = byId('quality').value;
  // A script's samples value N means N x N per pixel; it sets Standard quality.
  const scriptSamples = parseInt(lastResult.settings.raytracer.samples, 10);
  if (q === 'standard' && scriptSamples > 0) return Math.min(64, scriptSamples * scriptSamples);
  return qualityPreset().cpu;
}
function gpuSamples() { return renderSettings.samples > 0 ? renderSettings.samples : qualityPreset().gpu; }
function gpuBounces() { return renderSettings.bounces > 0 ? renderSettings.bounces : qualityPreset().bounces; }

function sceneMessage(r, cam, width, height, extra) {
  return Object.assign({
    boxes: r.boxes, spheres: r.spheres, cylinders: r.cylinders, grids: r.grids, lines: r.lines, dots: r.dots, tris: r.tris,
    classes: r.classes, bounds: r.bounds, raytracer: r.settings.raytracer, background: r.settings.background,
    camera: cam, width, height, light: lightForTracers(),
  }, extra);
}

// ---------- CPU raytracer ----------

// Renders in tiles on several workers. onTile gets each finished tile.
function runCpuRender({ r, cam, width, height, samples, transparent, onTile, onDone, onError }) {
  const size = 48, tiles = [];
  for (let y = 0; y < height; y += size) for (let x = 0; x < width; x += size) {
    tiles.push({ x, y, w: Math.min(size, width - x), h: Math.min(size, height - y) });
  }
  const cx = width / 2, cy = height / 2;
  tiles.sort((a, b) => Math.hypot(b.x - cx, b.y - cy) - Math.hypot(a.x - cx, a.y - cy));
  const count = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
  const total = tiles.length, t0 = performance.now(), workers = [];
  let done = 0, stopped = false;
  const message = sceneMessage(r, cam, width, height, { type: 'scene', samples, transparent });
  const handle = { stop() { stopped = true; workers.forEach(w => w.terminate()); }, total };
  for (let i = 0; i < count; i++) {
    const w = new Worker('raytrace.js');
    workers.push(w);
    const giveTile = () => { const t = tiles.pop(); if (t) w.postMessage(Object.assign({ type: 'tile' }, t)); };
    w.onmessage = e => {
      if (stopped) return;
      const m = e.data;
      if (m.type === 'ready') { giveTile(); return; }
      done++;
      onTile(m, done / total);
      if (done === total) { handle.stop(); onDone(performance.now() - t0); } else giveTile();
    };
    w.onerror = () => { if (stopped) return; handle.stop(); onError(new Error('The CPU raytracer stopped. Try a smaller model or size.')); };
    w.postMessage(message);
  }
  return handle;
}

function startCpuView(note) {
  const r = lastResult, samples = cpuSamples();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(view.clientWidth * dpr)), height = Math.max(1, Math.round(view.clientHeight * dpr));
  shot.width = width; shot.height = height;
  const ctx = shot.getContext('2d');
  if (renderer) { draw(); ctx.drawImage(glCanvas, 0, 0, width, height); }
  shot.hidden = false;
  byId('hint').hidden = true;
  const j = { kind: 'cpu' };
  job = j;
  setRenderButton(true);
  status((note ? note + ' ' : '') + 'Raytracing on the CPU...');
  j.handle = runCpuRender({
    r, cam: currentCamera(), width, height, samples, transparent: false,
    onTile(m, fraction) {
      ctx.putImageData(new ImageData(m.px, m.w, m.h), m.x, m.y);
      byId('bar').style.width = (fraction * 100) + '%';
    },
    onDone(ms) {
      if (job !== j) return;
      job = null;
      setRenderButton(false);
      byId('bar').style.width = '0';
      recordPerformance('CPU', width, height, samples, ms);
      status((note ? note + ' ' : '') + 'Raytraced ' + width + ' x ' + height + ' at ' + samples + ' samples in ' + (ms / 1000).toFixed(1) + ' s on the CPU. Drag to return to the live view.');
    },
    onError(err) { if (job === j) { stopRender(); status(err.message); } },
  });
}

// ---------- GPU path tracer ----------

function ensureGpu() {
  if (gpuState.tracer && !gpuState.tracer.lost) return Promise.resolve(gpuState.tracer);
  if (!window.GpuPathTracer || !navigator.gpu) {
    gpuState.error = 'WebGPU isn\'t available in this browser.';
    updateGpuInfo();
    return Promise.reject(new Error(gpuState.error));
  }
  if (!gpuState.promise) {
    gpuState.promise = GpuPathTracer.create().then(t => {
      gpuState.tracer = t;
      gpuState.error = '';
      t.onLost = onGpuLost;
      updateGpuInfo();
      return t;
    }).catch(e => {
      gpuState.promise = null;
      gpuState.error = e.message;
      updateGpuInfo();
      throw e;
    });
  }
  return gpuState.promise;
}

function onGpuLost(message) {
  gpuState.tracer = null;
  gpuState.promise = null;
  gpuState.error = 'The graphics device was lost (' + message + '). The next render tries to reconnect.';
  updateGpuInfo();
  if (job && job.kind === 'gpu') {
    stopRender();
    status('The GPU renderer stopped because the graphics device was lost. Click Raytrace to try again, or choose the CPU engine.');
  }
}

// Picks the engine for a path-traced render. Auto and GPU fall back to the CPU
// when WebGPU can't start; the note says so.
async function pickEngine() {
  if (renderSettings.engine === 'cpu') return { engine: 'cpu', note: '' };
  try {
    await ensureGpu();
    return { engine: 'gpu', note: '' };
  } catch (e) {
    return { engine: 'cpu', note: 'GPU unavailable (' + e.message + '), so the CPU renderer is used.' };
  }
}

function packScene(r, cam, width, height) {
  return new Promise((resolve, reject) => {
    const w = new Worker('raytrace.js');
    w.onmessage = e => { w.terminate(); resolve(e.data.packed); };
    w.onerror = () => { w.terminate(); reject(new Error('Preparing the scene for the GPU failed. The model may be too large.')); };
    w.postMessage(sceneMessage(r, cam, width, height, { type: 'pack', samples: 1 }));
  });
}

function gpuViewParams(cam, packed, opts) {
  const fw = vnorm(vsub(cam.target, cam.pos)), right = vnorm(vcross(fw, cam.up)), up = vcross(right, fw);
  const az = renderSettings.azimuth * Math.PI / 180, el = renderSettings.elevation * Math.PI / 180;
  const lr = Math.sin(az) * Math.cos(el), lu = Math.sin(el), lb = Math.cos(az) * Math.cos(el);
  const lightDir = vnorm([0, 1, 2].map(k => right[k] * lr + up[k] * lu - fw[k] * lb));
  const rt = lastResult.settings.raytracer;
  const vec = (v, n) => { const a = v === undefined ? null : String(v).replace(/[\[\]]/g, ' ').trim().split(/[\s,]+/).map(Number); return a && a.length === n && a.every(isFinite) ? a : null; };
  const phong = vec(rt.phong, 3) || [0.6, 0.6, 0.2];
  const dof = vec(rt.dof, 2);
  const dist = Math.hypot(...vsub(cam.target, cam.pos));
  return {
    pos: cam.pos, fw, right, up, tanH: Math.tan(cam.fov * Math.PI / 360),
    lens: dof ? dof[1] * packed.diag * 0.05 : 0, focus: dof ? dist * Math.max(0.05, dof[0] * 4) : 1,
    lightDir, sun: renderSettings.light, sky: phong[0] * renderSettings.ambient,
    bg: lastResult.settings.background, bounces: opts.bounces, transparent: !!opts.transparent,
    shadows: packed.shadows, softness: 0.02,
  };
}

async function startGpuView() {
  const tracer = gpuState.tracer;
  const j = { kind: 'gpu', tracer, canvas: byId('gpuView'), restart: false, resize: false, sceneDirty: false, stopped: false, looping: false };
  job = j;
  setRenderButton(true);
  status('Preparing the scene for the GPU...');
  try {
    await gpuPrepare(j);
  } catch (e) {
    if (job !== j) return;
    stopRender();
    startCpuView('GPU render failed (' + e.message + '), so the CPU renderer is used.');
    return;
  }
  if (j.stopped) { if (j.target) j.target.destroy(); return; }
  j.canvas.hidden = false;
  byId('hint').hidden = true;
  runGpuLoop(j);
}

async function gpuPrepare(j) {
  const { width, height } = viewPixelSize();
  const packed = await packScene(lastResult, currentCamera(), width, height);
  if (j.stopped) return;
  j.tracer.setScene(packed);
  j.packed = packed;
  gpuNewTarget(j);
}

function gpuNewTarget(j) {
  const { width, height } = viewPixelSize();
  if (j.target) j.target.destroy();
  j.target = j.tracer.createTarget(width, height, j.canvas);
  j.t0 = performance.now();
}

// Traces whole-image samples until the target count, presenting each one.
// A camera move, resize or rebuild restarts the count instead of stopping.
async function runGpuLoop(j) {
  if (j.looping || j.stopped || !j.target) return;
  j.looping = true;
  try {
    for (;;) {
      if (j.stopped) break;
      if (j.sceneDirty) {
        j.sceneDirty = false; j.resize = false;
        status('Updating the GPU scene...');
        await gpuPrepare(j);
        if (j.stopped) break;
      } else if (j.resize) {
        j.resize = false;
        gpuNewTarget(j);
      }
      if (j.restart) { j.restart = false; j.target.frames = 0; j.t0 = performance.now(); }
      const spp = gpuSamples(), bounces = gpuBounces();
      if (j.target.frames >= spp) {
        const ms = performance.now() - j.t0;
        recordPerformance('GPU', j.target.width, j.target.height, spp, ms, bounces);
        status('Path traced ' + j.target.width + ' x ' + j.target.height + ' at ' + spp + ' samples and ' + bounces + ' bounces in ' + (ms / 1000).toFixed(1) + ' s on the GPU. Drag to look around; it refines again. Click Stop for the live view.');
        byId('bar').style.width = '0';
        break;
      }
      const ok = await j.tracer.traceFrame(j.target, gpuViewParams(currentCamera(), j.packed, { bounces }), () => j.stopped || j.restart || j.sceneDirty || j.resize);
      if (j.stopped) break;
      if (!ok) continue;
      j.tracer.present(j.target, false);
      byId('bar').style.width = (j.target.frames / spp * 100) + '%';
      status('Path tracing on the GPU: ' + j.target.frames + ' of ' + spp + ' samples');
      await new Promise(r => setTimeout(r, 0));
    }
  } catch (e) {
    if (!j.stopped) {
      if (job === j) stopRender();
      status('The GPU render stopped: ' + e.message);
    }
  } finally {
    j.looping = false;
    if (j.stopped && j.target) { j.target.destroy(); j.target = null; }
  }
}

async function startRender() {
  if (job) { stopRender(); status('Render stopped'); return; }
  if (!lastResult) return;
  hideShot();
  const choice = await pickEngine();
  if (job) return;
  if (choice.engine === 'gpu') startGpuView();
  else startCpuView(choice.note);
}

// The image the view shows right now, for Save PNG.
async function captureCurrentImage() {
  if (job && job.kind === 'gpu' && job.target && job.target.frames) {
    const t = job.target;
    const px = await job.tracer.readPixels(t, false);
    return imageToBlob(px, t.width, t.height);
  }
  if (!shot.hidden) return new Promise(resolve => shot.toBlob(resolve, 'image/png'));
  draw();
  return new Promise(resolve => glCanvas.toBlob(resolve, 'image/png'));
}

function imageToBlob(pixels, width, height) {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  c.getContext('2d').putImageData(new ImageData(pixels, width, height), 0, 0);
  return new Promise(resolve => c.toBlob(resolve, 'image/png'));
}

// ---------- Export ----------

let exportJob = null;

function exportSize() {
  return { width: Math.round(renderSettings.exportW), height: Math.round(renderSettings.exportH) };
}

function estimateExportBytes() {
  const { width, height } = exportSize(), px = width * height;
  if (renderSettings.exportSource === 'viewport') return px * 4 * 7;
  const prims = lastResult ? lastResult.stats.objects : 0;
  if (renderSettings.engine !== 'cpu' && navigator.gpu) return window.GpuPathTracer ? GpuPathTracer.estimateBytes(prims, prims * 2, width, height) + px * 8 : px * 28;
  return px * 8 + prims * 200;
}

function exportProgress(fraction, text) {
  byId('exportBar').style.width = (fraction * 100) + '%';
  byId('exportStatus').textContent = text;
}

async function runExport() {
  if (exportJob) { exportJob.cancelled = true; if (exportJob.cancel) exportJob.cancel(); return; }
  if (!lastResult || !lastResult.stats.objects) { exportProgress(0, 'Build a script that draws something first.'); return; }
  const { width, height } = exportSize();
  if (!(width >= 1 && height >= 1 && width <= MAX_EXPORT_SIDE && height <= MAX_EXPORT_SIDE)) {
    exportProgress(0, 'Width and height must each be between 1 and ' + MAX_EXPORT_SIDE.toLocaleString('en-US') + ' pixels.');
    return;
  }
  const transparent = renderSettings.transparent, source = renderSettings.exportSource;
  const ej = { cancelled: false };
  exportJob = ej;
  byId('exportRun').textContent = 'Cancel';
  const cam = currentCamera(), r = lastResult, t0 = performance.now();
  const name = 'structure-synth-' + width + 'x' + height + '.png';
  try {
    let blob, engineLabel = 'Viewport', samples = 1, bounces;
    if (source === 'viewport') {
      exportProgress(0.5, 'Rendering the viewport at ' + width + ' × ' + height + '...');
      blob = await viewportFx.renderToBlob(width, height, transparent);
    } else {
      const choice = await pickEngine();
      if (job && job.kind === 'gpu') stopRender();
      if (choice.engine === 'gpu') {
        engineLabel = 'GPU';
        samples = gpuSamples(); bounces = gpuBounces();
        exportProgress(0, 'Preparing the scene for the GPU...');
        const tracer = gpuState.tracer;
        const packed = await packScene(r, cam, width, height);
        if (ej.cancelled) return;
        tracer.setScene(packed);
        const target = tracer.createTarget(width, height, null);
        try {
          const params = Object.assign(gpuViewParams(cam, packed, { bounces, transparent }), {});
          while (target.frames < samples) {
            const ok = await tracer.traceFrame(target, params, () => ej.cancelled);
            if (ej.cancelled || !ok) break;
            exportProgress(target.frames / samples, 'Path tracing on the GPU: ' + target.frames + ' of ' + samples + ' samples');
          }
          if (ej.cancelled) return;
          if (tracer.lost) throw new Error('the graphics device was lost');
          exportProgress(1, 'Reading the image back...');
          blob = await imageToBlob(await tracer.readPixels(target, transparent), width, height);
        } finally {
          target.destroy();
        }
      } else {
        engineLabel = 'CPU';
        samples = cpuSamples();
        if (choice.note) exportProgress(0, choice.note);
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        await new Promise((resolve, reject) => {
          const handle = runCpuRender({
            r, cam, width, height, samples, transparent,
            onTile(m, fraction) { ctx.putImageData(new ImageData(m.px, m.w, m.h), m.x, m.y); exportProgress(fraction, (choice.note ? choice.note + ' ' : '') + 'Raytracing on the CPU: ' + Math.round(fraction * 100) + '%'); },
            onDone: resolve, onError: reject,
          });
          ej.cancel = () => { handle.stop(); resolve(); };
        });
        if (ej.cancelled) return;
        blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      }
    }
    if (ej.cancelled) return;
    if (!blob) throw new Error('the browser could not encode the PNG; try a smaller size');
    const ms = performance.now() - t0;
    if (source !== 'viewport') recordPerformance(engineLabel, width, height, samples, ms, bounces);
    exportProgress(1, 'Done: ' + width + ' × ' + height + ' in ' + (ms / 1000).toFixed(1) + ' s (' + megabytes(blob.size) + ' PNG).');
    if (!await trySave(name, blob)) showSaveImage(blob);
  } catch (e) {
    exportProgress(0, 'Export failed: ' + e.message);
  } finally {
    if (ej.cancelled) exportProgress(0, 'Export canceled.');
    exportJob = null;
    byId('exportRun').textContent = 'Export PNG';
  }
}

// ---------- Settings panel ----------

let lastPerformance = null;
function recordPerformance(engine, width, height, samples, ms, bounces) {
  lastPerformance = { engine, width, height, samples, ms, bounces };
  const rate = width * height * samples / (ms / 1000) / 1e6;
  byId('perfInfo').textContent = engine + ': ' + width + ' × ' + height + ', ' + samples + ' samples' + (bounces ? ', ' + bounces + ' bounces' : '') +
    ', ' + (ms / 1000).toFixed(2) + ' s, ' + rate.toFixed(1) + ' million samples per second';
}

function updateGpuInfo() {
  const el = byId('gpuInfo');
  if (!el) return;
  if (gpuState.tracer) el.textContent = 'GPU ready: ' + gpuState.tracer.name + ' (WebGPU)';
  else if (gpuState.error) el.textContent = 'GPU not in use: ' + gpuState.error;
  else el.textContent = navigator.gpu ? 'WebGPU is available. The GPU starts on the first render.' : 'WebGPU isn\'t available in this browser, so the CPU renderer is used.';
}

function updateExportFields() {
  const s = renderSettings;
  byId('exportSize').value = s.exportSize;
  byId('exportW').value = s.exportW;
  byId('exportH').value = s.exportH;
  const px = s.exportW * s.exportH;
  byId('exportMemory').textContent = 'About ' + megabytes(estimateExportBytes()) + ' of memory, ' + (px / 1e6).toFixed(1) + ' megapixels.' +
    (px > 16e6 ? ' Large images take a while and may fail on devices with little memory.' : '');
}

function initRenderSettings() {
  const s = renderSettings;
  const sel = byId('exportSize');
  EXPORT_SIZES.forEach(([v, label]) => { const o = document.createElement('option'); o.value = v; o.textContent = label; sel.appendChild(o); });

  const changed = (restart) => {
    saveRenderSettings();
    if (viewportFx) { viewportFx.apply(s); draw(); }
    if (restart && job && job.kind === 'gpu') { job.restart = true; runGpuLoop(job); }
  };
  const bindCheck = (id, key, restart) => {
    const el = byId(id);
    el.checked = !!s[key];
    el.addEventListener('change', () => { s[key] = el.checked; changed(restart); });
  };
  const bindRange = (id, key, restart, fmt) => {
    const el = byId(id), out = byId(id + 'Out');
    el.value = s[key];
    if (out) out.textContent = fmt(s[key]);
    el.addEventListener('input', () => { s[key] = parseFloat(el.value); if (out) out.textContent = fmt(s[key]); changed(restart); });
  };
  const pct = v => Math.round(v * 100) + '%', deg = v => Math.round(v) + '°';
  bindCheck('vpShadows', 'shadows', false);
  bindCheck('vpAo', 'ao', false);
  bindRange('vpLight', 'light', true, pct);
  bindRange('vpAmbient', 'ambient', true, pct);
  bindRange('vpShadowStrength', 'shadowStrength', false, pct);
  bindRange('vpAoStrength', 'aoStrength', false, pct);
  bindRange('vpAzimuth', 'azimuth', true, deg);
  bindRange('vpElevation', 'elevation', true, deg);

  const engine = byId('ptEngine');
  engine.value = s.engine;
  engine.addEventListener('change', () => { s.engine = engine.value; saveRenderSettings(); updateExportFields(); });
  const intField = (id, key, max) => {
    const el = byId(id);
    el.value = s[key] || '';
    el.addEventListener('change', () => {
      const v = Math.round(parseFloat(el.value));
      s[key] = v > 0 ? Math.min(max, v) : 0;
      el.value = s[key] || '';
      saveRenderSettings();
      if (job && job.kind === 'gpu') runGpuLoop(job);
    });
  };
  intField('ptSamples', 'samples', 65536);
  intField('ptBounces', 'bounces', 16);
  const showPreset = () => {
    const p = qualityPreset();
    byId('ptSamples').placeholder = p.gpu + ' GPU, ' + p.cpu + ' CPU';
    byId('ptBounces').placeholder = String(p.bounces);
  };
  showPreset();
  byId('quality').addEventListener('change', () => { showPreset(); if (job && job.kind === 'gpu') { job.restart = true; runGpuLoop(job); } });

  // Export size: a preset, or custom fields with an optional locked ratio.
  sel.addEventListener('change', () => {
    s.exportSize = sel.value;
    if (sel.value !== 'custom') { const [w, h] = sel.value.split('x').map(Number); s.exportW = w; s.exportH = h; }
    saveRenderSettings(); updateExportFields();
  });
  const sizeField = (id, key, other) => {
    const el = byId(id);
    el.addEventListener('change', () => {
      const v = Math.max(1, Math.min(MAX_EXPORT_SIDE, Math.round(parseFloat(el.value) || 1)));
      if (s.lockAspect && s[key]) s[other] = Math.max(1, Math.min(MAX_EXPORT_SIDE, Math.round(s[other] * v / s[key])));
      s[key] = v;
      s.exportSize = 'custom';
      saveRenderSettings(); updateExportFields();
    });
  };
  sizeField('exportW', 'exportW', 'exportH');
  sizeField('exportH', 'exportH', 'exportW');
  bindCheck('exportLock', 'lockAspect', false);
  bindCheck('exportTransparent', 'transparent', false);
  const orient = (kind) => {
    const long = Math.max(s.exportW, s.exportH), short = Math.min(s.exportW, s.exportH);
    if (kind === 'landscape') { s.exportW = long; s.exportH = short; }
    if (kind === 'portrait') { s.exportW = short; s.exportH = long; }
    if (kind === 'square') { s.exportW = long; s.exportH = long; }
    const match = EXPORT_SIZES.find(([v]) => v === s.exportW + 'x' + s.exportH);
    s.exportSize = match ? match[0] : 'custom';
    saveRenderSettings(); updateExportFields();
  };
  byId('exportLandscape').addEventListener('click', () => orient('landscape'));
  byId('exportPortrait').addEventListener('click', () => orient('portrait'));
  byId('exportSquare').addEventListener('click', () => orient('square'));
  const source = byId('exportSource');
  source.value = s.exportSource;
  source.addEventListener('change', () => { s.exportSource = source.value; saveRenderSettings(); updateExportFields(); });
  byId('exportRun').addEventListener('click', runExport);

  const panel = byId('settingsPanel'), toggle = byId('renderSettings');
  const open = show => { panel.hidden = !show; toggle.setAttribute('aria-expanded', String(show)); if (show) updateExportFields(); };
  toggle.addEventListener('click', () => open(panel.hidden));
  byId('settingsClose').addEventListener('click', () => open(false));
  updateGpuInfo();
  updateExportFields();
  byId('render').addEventListener('click', startRender);
}

// For comparing the engines on one scene at a fixed size and sample count.
async function benchmarkRenderers({ width = 960, height = 540, samples = 16, bounces = [1, 3] } = {}) {
  const r = lastResult, cam = currentCamera(), out = { objects: r.stats.objects, width, height, samples };
  out.cpuMs = await new Promise((resolve, reject) => runCpuRender({ r, cam, width, height, samples, transparent: false, onTile() {}, onDone: resolve, onError: reject }));
  try {
    const tracer = await ensureGpu();
    const t0 = performance.now();
    const packed = await packScene(r, cam, width, height);
    tracer.setScene(packed);
    out.gpuSetupMs = performance.now() - t0;
    for (const b of bounces) {
      const target = tracer.createTarget(width, height, null);
      const params = gpuViewParams(cam, packed, { bounces: b });
      await tracer.traceFrame(target, params);
      target.frames = 0;
      const t1 = performance.now();
      while (target.frames < samples) await tracer.traceFrame(target, params);
      out['gpuMs_' + b + 'bounce'] = performance.now() - t1;
      target.destroy();
    }
  } catch (e) { out.gpuError = e.message; }
  return out;
}
