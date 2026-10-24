import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import { initialCloud, textForm } from './forms.js';
import {
  Form,
  FORM_GLOW,
  positionShader,
  velocityShader,
  pointsVertexShader,
  pointsFragmentShader,
} from './particleShaders.js';

// One swarm of size² particles simulated on the GPU. It always holds a pair
// of forms (A → B) and a morph amount between them; the director sets the
// pair from the scroll position so the swarm flows from shape to shape.
export class ParticleSystem {
  constructor(renderer, { size = 512, halfFloat = false } = {}) {
    this.renderer = renderer;
    this.size = size;
    this.count = size * size;
    this.halfFloat = halfFloat;
    this.forms = {};
    this.current = null;
    this.next = null;
  }

  // `tasks` is a list of [name, build(size)] pairs. They run one per frame so
  // the loader can show progress and the page never freezes for long.
  async init({ tasks, onProgress }) {
    const size = this.size;
    for (let t = 0; t < tasks.length; t += 1) {
      const [name, build] = tasks[t];
      this.forms[name] = build(size);
      onProgress?.((t + 1) / tasks.length);
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }
    const first = this.forms[tasks[0][0]];

    this.gpu = new GPUComputationRenderer(size, size, this.renderer);
    if (this.halfFloat) this.gpu.setDataType(THREE.HalfFloatType);
    const position0 = this.gpu.createTexture();
    position0.image.data.set(initialCloud(size));
    const velocity0 = this.gpu.createTexture();
    this.positionVariable = this.gpu.addVariable('texturePosition', positionShader, position0);
    this.velocityVariable = this.gpu.addVariable('textureVelocity', velocityShader, velocity0);
    this.gpu.setVariableDependencies(this.positionVariable, [this.positionVariable, this.velocityVariable]);
    this.gpu.setVariableDependencies(this.velocityVariable, [this.positionVariable, this.velocityVariable]);

    this.sim = {
      uTime: { value: 0 },
      uDelta: { value: 0.016 },
      uMorph: { value: 0 },
      uFormA: { value: first.id },
      uFormB: { value: first.id },
      uTargetA: { value: first.position },
      uTargetB: { value: first.position },
      uCenterA: { value: first.center ?? this.zeroCenter() },
      uCenterB: { value: first.center ?? this.zeroCenter() },
      uSpring: { value: 0.6 },
      uNoise: { value: 2.2 },
      uFlight: { value: 5.5 },
      uScatter: { value: 0 },
      uDamping: { value: 0.9 },
      uPulse: { value: 0 },
      uPointer: { value: new THREE.Vector3(99, 99, 99) },
      uPointerVelocity: { value: new THREE.Vector3() },
      uPointerRadius: { value: 0.55 },
      uPointerStrength: { value: 0 },
    };
    this.velocityVariable.material.uniforms = this.sim;
    this.positionVariable.material.uniforms = { uDelta: this.sim.uDelta };
    const error = this.gpu.init();
    if (error) throw new Error(error);

    this.createPoints(first);
    this.current = first;
    this.next = first;
  }

  createPoints(form) {
    const refs = new Float32Array(this.count * 2);
    const rand = new Float32Array(this.count);
    for (let p = 0; p < this.count; p += 1) {
      refs[p * 2] = ((p % this.size) + 0.5) / this.size;
      refs[p * 2 + 1] = (Math.floor(p / this.size) + 0.5) / this.size;
      rand[p] = Math.random();
    }
    const geometry = new THREE.BufferGeometry();
    // positions come from the simulation texture; this attribute only sizes the draw
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.count * 3), 3));
    geometry.setAttribute('aRef', new THREE.BufferAttribute(refs, 2));
    geometry.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));

    this.render = {
      texturePosition: { value: null },
      textureVelocity: { value: null },
      uColorA: { value: form.color },
      uColorB: { value: form.color },
      uFormA: this.sim.uFormA,
      uFormB: this.sim.uFormB,
      uMorph: this.sim.uMorph,
      uGlowA: { value: FORM_GLOW[form.id] },
      uGlowB: { value: FORM_GLOW[form.id] },
      uPointSize: { value: 1.7 },
      uPixelRatio: { value: 1 },
      uFocus: { value: 6.2 },
      uAperture: { value: 0.09 },
      uOpacity: { value: 1 },
      uMaxPoint: { value: 14 },
      uTargetA: this.sim.uTargetA,
      uIgnite: { value: 1 },
      uIgniteMode: { value: 0 },
      uJelly: { value: 0 },
      uTime: this.sim.uTime,
      uPhase: { value: 0 },
      uOrient: { value: new THREE.Matrix3() },
      uOffset: { value: new THREE.Vector3() },
      uDrift: { value: new THREE.Vector3() },
      uHighlight: { value: -1 },
      uHighlightAmount: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      vertexShader: pointsVertexShader,
      fragmentShader: pointsFragmentShader,
      uniforms: this.render,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
  }

  setPixelRatio(ratio) {
    this.render.uPixelRatio.value = ratio;
  }

  zeroCenter() {
    if (!this.emptyCenter) {
      this.emptyCenter = new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType);
      this.emptyCenter.needsUpdate = true;
    }
    return this.emptyCenter;
  }

  // Build (or rebuild in place) a text form, e.g. the closing wordmark.
  addTextForm(name, lines, width) {
    let form = this.forms[name];
    if (form) {
      textForm(this.size, lines, { width, into: form });
      form.position.needsUpdate = true;
      form.color.needsUpdate = true;
    } else {
      form = { id: Form.TEXT, ...textForm(this.size, lines, { width }) };
      this.forms[name] = form;
    }
    return form;
  }

  // Morph from form a to form b by t (0 = a, 1 = b).
  setPair(a, b, t) {
    if (this.pairA !== a) {
      this.pairA = a;
      this.current = a;
      this.sim.uTargetA.value = a.position;
      this.sim.uCenterA.value = a.center ?? this.zeroCenter();
      this.sim.uFormA.value = a.id;
      this.render.uColorA.value = a.color;
      this.render.uGlowA.value = FORM_GLOW[a.id];
    }
    if (this.pairB !== b) {
      this.pairB = b;
      this.next = b;
      this.sim.uTargetB.value = b.position;
      this.sim.uCenterB.value = b.center ?? this.zeroCenter();
      this.sim.uFormB.value = b.id;
      this.render.uColorB.value = b.color;
      this.render.uGlowB.value = FORM_GLOW[b.id];
    }
    this.sim.uMorph.value = a === b ? 0 : t;
  }

  update(dt, time) {
    this.sim.uTime.value = time;
    this.sim.uDelta.value = dt;
    this.gpu.compute();
    this.render.texturePosition.value = this.gpu.getCurrentRenderTarget(this.positionVariable).texture;
    this.render.textureVelocity.value = this.gpu.getCurrentRenderTarget(this.velocityVariable).texture;
  }

  dispose() {
    this.gpu?.dispose();
    this.points?.geometry.dispose();
    this.material?.dispose();
    for (const form of Object.values(this.forms)) {
      form.position.dispose();
      form.color.dispose();
      form.center?.dispose();
    }
  }
}
