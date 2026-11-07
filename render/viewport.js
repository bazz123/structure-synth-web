'use strict';
// Live view lighting: a sky light, a key light with soft shadows, and scalable
// ambient occlusion (SAO) as a post-process. Uses Three.js r128 and its
// examples/js post-processing scripts.
(function () {

// r128's SAO divides a world-space distance by a screen-scaled one, so the same
// settings darken a large model and barely touch a small one. Dividing by the
// model's radius as well makes the effect the same at any size.
function patchSaoShader() {
  const sh = THREE.SAOShader;
  if (!sh || sh.worldRadiusPatched) return;
  const patched = sh.fragmentShader
    .replace('uniform float scale;', 'uniform float scale;\nuniform float worldRadius;')
    .replace('/ scaledScreenDistance - bias)', '/ (scaledScreenDistance * worldRadius) - bias)');
  if (patched === sh.fragmentShader || patched.indexOf('worldRadius) - bias') < 0) return;
  sh.fragmentShader = patched;
  sh.uniforms.worldRadius = { value: 1 };
  sh.worldRadiusPatched = true;
}

const AO_SCALE = 0.2;

class ViewportFx {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.settings = null;
    this.center = new THREE.Vector3();
    this.radius = 1;
    this.interacting = false;

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.sky = new THREE.HemisphereLight(0xffffff, 0x8a8f96, 0.62);
    // The key light is split in two: the shadow strength sets how much of it
    // the shadowed part carries, since r128 lights have no shadow intensity.
    this.key = new THREE.DirectionalLight(0xffffff, 0.4);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.fill = new THREE.DirectionalLight(0xffffff, 0.2);
    scene.add(this.sky, this.key, this.key.target, this.fill, this.fill.target);

    this.composer = null;
    this.sao = null;
    try {
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      const target = renderer.capabilities.isWebGL2
        ? new THREE.WebGLMultisampleRenderTarget(size.x, size.y, { format: THREE.RGBAFormat })
        : new THREE.WebGLRenderTarget(size.x, size.y, { format: THREE.RGBAFormat });
      this.composer = new THREE.EffectComposer(renderer, target);
      this.renderPass = new THREE.RenderPass(scene, camera);
      this.composer.addPass(this.renderPass);
      patchSaoShader();
      this.sao = new THREE.SAOPass(scene, camera, false, true);
      // r128 clears its packed depth buffer to black, which means "nearest", so
      // empty background reads as a wall at the camera and darkens everything.
      // White means "farthest", where the AO shader skips the pixel.
      const sao = this.sao, renderOverride = sao.renderOverride.bind(sao);
      sao.renderOverride = (r, material, target, clearColor, clearAlpha) =>
        renderOverride(r, material, target, material === sao.depthMaterial ? 0xffffff : clearColor, clearAlpha);
      this.sao.params.saoBlurRadius = 6;
      this.sao.params.saoBlurStdDev = 3;
      this.sao.params.saoKernelRadius = 16;
      this.sao.params.saoBias = 0.2;
      this.composer.addPass(this.sao);
    } catch (e) {
      this.composer = null;
      this.aoError = e.message;
    }
  }

  apply(settings) {
    this.settings = settings;
    const light = 0.62 * settings.light;
    this.sky.intensity = 0.62 * settings.ambient;
    const shadowed = settings.shadows ? settings.shadowStrength : 0;
    this.key.intensity = light * shadowed;
    this.key.castShadow = settings.shadows;
    this.fill.intensity = light * (1 - shadowed);
    if (this.sao) this.sao.params.saoIntensity = settings.aoStrength * 0.5;
  }

  setBounds(b) {
    this.center.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
    this.radius = Math.max(1e-3, Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) / 2);
    const cam = this.key.shadow.camera, r = this.radius * 1.05;
    cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r;
    cam.near = this.radius * 0.05; cam.far = this.radius * 4;
    cam.updateProjectionMatrix();
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = this.radius * 0.004;
  }

  setSize(width, height, pixelRatio) {
    if (!this.composer) return;
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
  }

  // The light keeps its angle to the camera, matching both raytracers.
  placeLights() {
    const s = this.settings || { azimuth: 39, elevation: 48 };
    const az = s.azimuth * Math.PI / 180, el = s.elevation * Math.PI / 180;
    const m = this.camera.matrixWorld.elements;
    const right = new THREE.Vector3(m[0], m[1], m[2]).normalize();
    const up = new THREE.Vector3(m[4], m[5], m[6]).normalize();
    const back = new THREE.Vector3(m[8], m[9], m[10]).normalize();
    const dir = right.multiplyScalar(Math.sin(az) * Math.cos(el))
      .add(up.multiplyScalar(Math.sin(el)))
      .add(back.multiplyScalar(Math.cos(az) * Math.cos(el))).normalize();
    for (const l of [this.key, this.fill]) {
      l.position.copy(this.center).addScaledVector(dir, this.radius * 2);
      l.target.position.copy(this.center);
      l.target.updateMatrixWorld();
    }
  }

  // r128's SAO pass draws the scene background into its depth buffer, where it
  // reads as a surface at the camera and darkens everything. So the background
  // is taken off the scene and drawn as the first pass's clear color instead.
  renderWithAo(clearAlpha) {
    const bg = this.scene.background;
    this.scene.background = null;
    this.renderPass.clearColor = bg && bg.isColor ? bg : new THREE.Color(0, 0, 0);
    this.renderPass.clearAlpha = clearAlpha;
    try { this.composer.render(); } finally { this.scene.background = bg; }
  }

  // Scale relative to the far plane and the model, so the darkening is the
  // same for a model of any size and any zoom.
  updateAoScale() {
    if (!this.sao) return;
    this.sao.params.saoScale = AO_SCALE * this.camera.far / this.radius;
    const u = this.sao.saoMaterial.uniforms.worldRadius;
    if (u) u.value = this.radius;
  }

  // Skips ambient occlusion while the camera moves, to keep orbiting smooth.
  render() {
    this.camera.updateMatrixWorld();
    this.placeLights();
    const useAo = this.composer && this.settings && this.settings.ao && !this.interacting;
    // SAO's scale is relative to the camera's far plane; this keeps the
    // darkening the same for a model of any size.
    this.updateAoScale();
    if (useAo) this.renderWithAo(1);
    else this.renderer.render(this.scene, this.camera);
  }

  // Renders one frame at an exact size and returns it as a PNG blob, then
  // puts the view back. Ambient occlusion is left out of transparent images.
  renderToBlob(width, height, transparent) {
    const r = this.renderer;
    const size = r.getSize(new THREE.Vector2()), ratio = r.getPixelRatio(), aspect = this.camera.aspect;
    const background = this.scene.background;
    r.setPixelRatio(1);
    r.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this.composer) this.setSize(width, height, 1);
    if (transparent) { this.scene.background = null; r.setClearColor(0x000000, 0); }
    this.camera.updateMatrixWorld();
    this.placeLights();
    this.updateAoScale();
    if (!transparent && this.composer && this.settings.ao) this.renderWithAo(1);
    else r.render(this.scene, this.camera);
    const blob = new Promise(resolve => r.domElement.toBlob(resolve, 'image/png'));
    this.scene.background = background;
    r.setClearColor(0x000000, 1);
    r.setPixelRatio(ratio);
    r.setSize(size.x, size.y, false);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    if (this.composer) this.setSize(size.x, size.y, ratio);
    this.render();
    return blob;
  }
}

globalThis.ViewportFx = ViewportFx;
})();
