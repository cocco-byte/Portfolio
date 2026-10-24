import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ParticleSystem } from './ParticleSystem.js';
import { Abyss, Drift, Ocean, Bubbles } from './environment.js';
import { WorkPanels, layoutPanels } from './WorkPanels.js';
import { WaterShader, FinishShader } from './passes.js';

// One stroke of a swimming jellyfish: a quick contraction, a long release.
const stroke = (phase) =>
  phase < 0.3 ? Math.sin((phase / 0.3) * Math.PI * 0.5) : 0.5 + 0.5 * Math.cos(((phase - 0.3) / 0.7) * Math.PI);

// The renderer and everything in the water. The director moves `rig` (the
// camera), `fx` and the swarms' placement; the world animates and draws.
export class World {
  constructor({ canvas, reducedMotion = false, tier = 'high', lite = false, workCount = 0 }) {
    this.canvas = canvas;
    this.reducedMotion = reducedMotion;
    this.tier = tier;
    this.lite = lite;
    this.workCount = workCount;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
    this.rig = { x: 0, y: 3, z: 14, tx: 0, ty: 0, tz: 0, roll: 0.2, fov: 50, depth: 0 };
    this.fx = { trail: 0, warp: 0, bloom: 0.4, threshold: 0.7, exposure: 1, travel: 0 };
    this.parallax = 1;
    this.look = new THREE.Vector2();
    this.tilt = { x: 0, y: 0, active: false };
    this.aspectFit = 1;
    this.time = 0;
    this.last = performance.now();
    this.pointer = {
      ndc: new THREE.Vector2(),
      world: new THREE.Vector3(99, 99, 99),
      velocity: new THREE.Vector3(),
      active: false,
      energy: 0,
    };
    this.pulsePhase = 0;
    this.running = false;
    this.water = { strength: 0, front: -2, dir: 1 };
    this.frame = this.frame.bind(this);
    this.tmp = {
      ray: new THREE.Raycaster(),
      plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
      hit: new THREE.Vector3(),
      look: new THREE.Vector3(),
      ndc: new THREE.Vector3(),
      forward: new THREE.Vector3(),
      want: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      up: new THREE.Vector3(0, 1, 0),
      m4: new THREE.Matrix4(),
      center: new THREE.Vector3(0, 0, -15),
    };
  }

  async init({ flowerTasks, jellyTasks, onProgress }) {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.setClearColor(0x03050a, 1);
    this.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.lost = true;
      this.stop();
      window.dispatchEvent(new CustomEvent('world:gl-lost'));
    });

    const high = this.tier === 'high';
    this.abyss = new Abyss({ scene: this.scene, count: high ? 900 : 400 });

    // Two swarms: the "flower" carries the seasonal forms, the "jelly" is the
    // medusa that follows us down. 512² + 384² = 409,600 particles on high.
    const total = flowerTasks.length + jellyTasks.length;
    this.flower = new ParticleSystem(this.renderer, { size: high ? 512 : 256, halfFloat: !high });
    await this.flower.init({
      tasks: flowerTasks,
      onProgress: (p) => onProgress?.((p * flowerTasks.length) / total),
    });
    this.jelly = new ParticleSystem(this.renderer, { size: high ? 384 : 192, halfFloat: !high });
    await this.jelly.init({
      tasks: jellyTasks,
      onProgress: (p) => onProgress?.((flowerTasks.length + p * jellyTasks.length) / total),
    });
    this.flower.render.uPointSize.value = high ? 1.7 : 2.9;
    this.jelly.render.uPointSize.value = high ? 1.9 : 3.2;
    this.jelly.render.uJelly.value = 1;
    this.systems = [this.flower, this.jelly];
    for (const system of this.systems) {
      this.scene.add(system.points);
      this.guardUniforms(system);
    }

    this.drift = new Drift({ scene: this.scene, tier: this.tier });
    this.workPanels = new WorkPanels(this.scene, layoutPanels(this.workCount));
    this.ocean = new Ocean(this.scene);
    this.bubbles = new Bubbles(this.scene, { count: high ? 260 : 120 });
    this.jellyPhase = Math.random();
    this.createSchool();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.afterimage = new AfterimagePass(0);
    this.composer.addPass(this.afterimage);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.8, 0.7);
    this.composer.addPass(this.bloom);
    this.waterPass = new ShaderPass(WaterShader);
    this.waterPass.enabled = false;
    this.composer.addPass(this.waterPass);
    this.finish = new ShaderPass(FinishShader);
    this.composer.addPass(this.finish);
    this.composer.addPass(new OutputPass());
    await this.warmUp();
    this.resize();

    window.addEventListener(
      'pointermove',
      (event) => {
        if (event.pointerType !== 'touch') this.setPointer(event.clientX, event.clientY);
      },
      { passive: true },
    );
    document.documentElement.addEventListener('pointerleave', () => {
      this.pointer.active = false;
    });
    window.addEventListener('deviceorientation', (event) => {
      if (event.gamma == null || event.beta == null) return;
      this.tilt.x = THREE.MathUtils.clamp(event.gamma / 32, -1, 1);
      this.tilt.y = THREE.MathUtils.clamp((event.beta - 50) / 34, -1, 1);
      this.tilt.active = true;
    });
    document.addEventListener('visibilitychange', () => (document.hidden ? this.stop() : this.start()));
    this.start();
  }

  // Each swarm's draw sets its own per-frame uniforms just before rendering,
  // because the school below shares the jelly's material.
  guardUniforms(system) {
    const u = system.render;
    const baseSize = u.uPointSize.value;
    system.points.onBeforeRender = () => {
      const grow = Math.max(1, system.points.scale.x) ** 0.85;
      const isJelly = system === this.jelly;
      u.uOpacity.value = isJelly ? 1 : (this.flowerOpacity ?? 1);
      u.uAperture.value = this.lite ? 0 : 0.085;
      u.uMaxPoint.value = this.lite ? 7 : 22;
      u.uPointSize.value = baseSize * grow;
      u.uPhase.value = this.jellyPhase % 1;
      u.uJelly.value = isJelly ? 1 : 0;
      u.uIgniteMode.value = isJelly ? 1 : 2;
      u.uIgnite.value = isJelly ? (this.jellyIgnite ?? 1) : (this.ringIgnite ?? 1);
      if (isJelly && this.mainSwim) {
        u.uOrient.value.copy(this.mainSwim.orient);
        u.uOffset.value.copy(this.mainSwim.offset).multiplyScalar(Math.min(1, 1.6 / system.points.scale.x));
        u.uDrift.value.copy(this.mainSwim.velocity);
      } else {
        u.uOrient.value.identity();
        u.uOffset.value.set(0, 0, 0);
        u.uDrift.value.set(0, 0, 0);
      }
      system.material.uniformsNeedUpdate = true;
    };
  }

  // A school of smaller jellyfish in the distance. They reuse the medusa's
  // simulation (a subset of its particles) and only differ in placement.
  createSchool() {
    const jelly = this.jelly;
    const u = jelly.render;
    const baseSize = u.uPointSize.value;
    const source = jelly.points.geometry;
    const geometry = new THREE.BufferGeometry();
    for (const name of Object.keys(source.attributes)) geometry.setAttribute(name, source.getAttribute(name));
    geometry.setDrawRange(0, Math.floor(jelly.count * 0.45));
    this.schoolCount = 5;
    this.school = Array.from({ length: this.tier === 'high' ? 8 : 5 }, (_, i) => {
      const points = new THREE.Points(geometry, jelly.material);
      points.frustumCulled = false;
      points.renderOrder = 1;
      const near = i % 3 === 0;
      const member = {
        points,
        t: Math.random(),
        period: 2.3 + Math.random() * 1.7,
        x: (i / 8 - 0.5) * 20 + (Math.random() - 0.5) * 3,
        y: (Math.random() - 0.5) * 12,
        z: near ? -8 - Math.random() * 4 : -13 - Math.random() * 14,
        scale: near ? 0.6 + Math.random() * 0.3 : 0.8 + Math.random(),
        seed: Math.random() * 10,
        fade: 0,
        yaw: Math.random() * Math.PI * 2,
        heading: new THREE.Vector3(0, 1, 0),
        velocity: new THREE.Vector3(),
        orient: new THREE.Matrix3(),
      };
      points.onBeforeRender = () => {
        u.uOpacity.value = member.fade * 0.55;
        u.uAperture.value = this.lite ? 0 : 0.085;
        u.uMaxPoint.value = this.lite ? 5 : 16;
        u.uPointSize.value = baseSize * 1.45 * Math.max(1, member.scale) ** 0.85;
        u.uPhase.value = member.t % 1;
        u.uIgnite.value = 1;
        u.uJelly.value = 1;
        u.uOrient.value.copy(member.orient);
        u.uOffset.value.set(0, 0, 0);
        u.uDrift.value.copy(member.velocity).divideScalar(member.scale);
        jelly.material.uniformsNeedUpdate = true;
      };
      this.scene.add(points);
      return member;
    });
  }

  // Wander: the heading drifts on slow sine waves, leaning from vertical.
  steer(swimmer, dt, time, lean) {
    swimmer.yaw += (Math.sin(time * 0.11 + swimmer.seed) * 0.5 + Math.sin(time * 0.053 + swimmer.seed * 2.3) * 0.5) * dt * 0.6;
    const tilt = lean * (0.5 + 0.5 * Math.sin(time * 0.09 + swimmer.seed * 1.7));
    const want = this.tmp.want.set(Math.sin(tilt) * Math.cos(swimmer.yaw), Math.cos(tilt), Math.sin(tilt) * Math.sin(swimmer.yaw));
    swimmer.heading.lerp(want, 1 - Math.exp(-dt * 0.5)).normalize();
    this.tmp.quat.setFromUnitVectors(this.tmp.up, swimmer.heading);
    swimmer.orient.setFromMatrix4(this.tmp.m4.makeRotationFromQuaternion(this.tmp.quat));
  }

  // Thrust comes in pulses with each stroke; a current drifts it sideways
  // and it slowly sinks between strokes.
  swim(swimmer, dt, time, phase, thrust, current, sink) {
    const c = stroke(phase);
    const drift = time * 0.045 + swimmer.seed * 1.9;
    swimmer.velocity.addScaledVector(swimmer.heading, c * thrust * dt);
    swimmer.velocity.x += Math.cos(drift) * current * dt;
    swimmer.velocity.z += Math.sin(drift) * current * 0.6 * dt;
    swimmer.velocity.y -= sink * dt;
    swimmer.velocity.multiplyScalar(Math.exp(-dt * 1.2));
  }

  updateSchool(dt, time) {
    this.mainSwim ||= {
      seed: 3.7,
      yaw: 0.6,
      heading: new THREE.Vector3(0, 1, 0),
      velocity: new THREE.Vector3(),
      offset: new THREE.Vector3(),
      orient: new THREE.Matrix3(),
    };
    this.jellyPhase += dt / 2.8;
    const main = this.mainSwim;
    this.steer(main, dt, time, 0.32);
    this.swim(main, dt, time, this.jellyPhase % 1, 0.55, 0.1, 0.17);
    // the main medusa is leashed to its station
    const reach = main.offset.length();
    if (reach > 0.35) main.velocity.addScaledVector(main.offset, -((reach - 0.35) / reach) * 0.6 * dt);
    main.offset.addScaledVector(main.velocity, dt);

    const bounds = { x: 14, y: 7.5, z: 10 };
    const center = this.tmp.center;
    this.school.forEach((member, i) => {
      member.t += dt / member.period;
      this.steer(member, dt, time, 0.42);
      this.swim(member, dt, time, member.t % 1, 0.8 * member.scale, 0.16 * member.scale, 0.16 * member.scale);
      const dx = member.x - center.x;
      const dy = member.y - center.y;
      const dz = member.z - center.z;
      if (Math.abs(dx) > bounds.x) member.velocity.x -= Math.sign(dx) * 0.25 * dt;
      if (Math.abs(dy) > bounds.y) member.velocity.y -= Math.sign(dy) * 0.25 * dt;
      if (Math.abs(dz) > bounds.z) member.velocity.z -= Math.sign(dz) * 0.25 * dt;
      member.x += member.velocity.x * dt;
      member.y += member.velocity.y * dt;
      member.z += member.velocity.z * dt;

      let want = i < Math.min(this.schoolCount, this.maxSchool ?? 8) ? 1 : 0;
      // keep clear of the text: fade members that swim behind it
      const clear = this.schoolClear;
      if (clear) {
        const s = this.tmp.ndc.set(member.x, member.y, member.z).project(this.camera);
        if (s.x > clear[0] && s.x < clear[2] && s.y > clear[1] && s.y < clear[3]) want *= 0.1;
      }
      member.fade += (want - member.fade) * (1 - Math.exp(-dt * 2.4));
      const points = member.points;
      points.visible = member.fade > 0.01;
      points.position.set(member.x, member.y, member.z);
      points.scale.setScalar(member.scale);
    });
  }

  // Compile every shader up front so the first scroll doesn't hitch.
  async warmUp() {
    const hidden = [];
    this.scene.traverse((object) => {
      if (!object.visible) {
        hidden.push(object);
        object.visible = true;
      }
    });
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch {
      // compileAsync is an optimisation; rendering compiles lazily anyway
    }
    hidden.forEach((object) => {
      object.visible = false;
    });
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    this.composer?.render();
  }

  pixelRatio() {
    if (this.lite) return 0.5;
    return Math.min(window.devicePixelRatio || 1, this.tier === 'high' ? 1.75 : 1.5) * (this.qualityScale ?? 1);
  }

  resize() {
    if (!this.renderer) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const ratio = this.pixelRatio();
    this.width = width;
    this.height = height;
    const aspect = width / height;
    // portrait screens pull the camera back so the scene still fits
    this.aspectFit = aspect < 1 ? Math.min(1.9, 1.12 / Math.max(0.45, aspect)) : 1;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(width, height);
    this.bloom.resolution.set(width * 0.5, height * 0.5);
    this.finish.uniforms.uResolution.value.set(width * ratio, height * ratio);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.abyss.resize(width, height, ratio);
    for (const system of this.systems) system.setPixelRatio(ratio);
    this.drift.setPixelRatio(ratio);
  }

  setPointer(x, y) {
    this.pointer.ndc.set((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1);
    this.pointer.active = true;
  }

  start() {
    if (this.lost || this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
  }

  // Watch the frame rate; step quality down (resolution, particle count,
  // trails, school size) up to three times if it can't hold ~45fps.
  govern(dt) {
    if (this.lite || this.paused || document.hidden) return;
    const perf = (this.perf ??= { time: 0, frames: 0, level: 0, warmup: 3 });
    perf.time += dt;
    perf.frames += 1;
    if (perf.time < 1.5) return;
    const average = perf.time / perf.frames;
    perf.time = 0;
    perf.frames = 0;
    if (perf.warmup > 0) {
      perf.warmup -= 1;
      return;
    }
    if (average < 1 / 45 || perf.level >= 3) return;
    perf.level += 1;
    this.qualityScale = [1, 0.85, 0.72, 0.6][perf.level];
    this.noTrails = true;
    const share = [1, 0.8, 0.65, 0.5][perf.level];
    for (const system of this.systems) system.points.geometry.setDrawRange(0, Math.floor(system.count * share));
    this.maxSchool = [8, 6, 4, 3][perf.level];
    this.resize();
  }

  frame(now) {
    if (!this.running) return;
    const raw = Math.min(2, Math.max(0.001, (now - this.last) / 1000));
    this.govern(raw);
    const dt = this.paused ? 0 : Math.min(0.1, raw);
    this.last = now;
    this.time += dt;
    const time = this.time;
    const rig = this.rig;
    const fx = this.fx;
    const sway = this.reducedMotion ? 0 : this.parallax;

    // the camera leans toward the cursor (or the phone's tilt)
    const source = this.pointer.active ? this.pointer.ndc : this.tilt.active ? this.tilt : null;
    const ease = (v) => Math.sign(v) * Math.min(1, Math.abs(v)) ** 1.6;
    const follow = 1 - Math.exp(-dt * 2.2);
    this.look.x += ((source ? ease(source.x) : 0) - this.look.x) * follow;
    this.look.y += ((source ? ease(source.y) : 0) - this.look.y) * follow;
    const lx = this.look.x;
    const ly = this.look.y;

    this.tmp.look.set(rig.tx, rig.ty, rig.tz);
    this.camera.position.set(
      rig.tx + (rig.x - rig.tx) * this.aspectFit + lx * 1.4 * sway + Math.sin(time * 0.13) * 0.12 * sway,
      rig.ty + (rig.y - rig.ty) * this.aspectFit + ly * 0.7 * sway + Math.sin(time * 0.17) * 0.08 * sway,
      rig.tz + (rig.z - rig.tz) * this.aspectFit,
    );
    this.camera.up.set(Math.sin(rig.roll), Math.cos(rig.roll), 0);
    this.camera.lookAt(this.tmp.look);
    this.camera.rotateY(-lx * 1.05 * sway);
    this.camera.rotateX(ly * 0.4 * sway);
    if (this.camera.fov !== rig.fov) {
      this.camera.fov = rig.fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld();

    // project the cursor onto a plane through the look target
    const pointer = this.pointer;
    this.tmp.ray.setFromCamera(pointer.ndc, this.camera);
    this.tmp.plane.setFromNormalAndCoplanarPoint(this.camera.getWorldDirection(this.tmp.forward).negate(), this.tmp.look);
    if (pointer.active && this.tmp.ray.ray.intersectPlane(this.tmp.plane, this.tmp.hit)) {
      if (dt > 0) {
        const velocity = this.tmp.hit.clone().sub(pointer.world).divideScalar(dt);
        if (pointer.world.x > 90) velocity.set(0, 0, 0);
        pointer.velocity.lerp(velocity.clampLength(0, 12), 1 - Math.exp(-dt * 10));
      } else pointer.velocity.set(0, 0, 0);
      pointer.world.copy(this.tmp.hit);
      pointer.energy = Math.min(1, pointer.energy + pointer.velocity.length() * dt * 0.8);
    }
    pointer.energy *= Math.exp(-dt * 0.9);

    this.pulsePhase += dt / 2.6;
    const phase = this.pulsePhase % 1;
    const pulse = phase < 0.24 ? Math.sin((phase / 0.24) * Math.PI * 0.5) : 1 - THREE.MathUtils.smoothstep(phase, 0.24, 1);

    for (const system of this.systems) {
      const sim = system.sim;
      system.points.updateMatrixWorld();
      const scale = Math.max(0.2, system.points.scale.x);
      sim.uPointer.value.copy(system.points.worldToLocal(pointer.world.clone()));
      sim.uPointerVelocity.value.copy(pointer.velocity).multiplyScalar(0.12 / scale);
      sim.uPointerRadius.value = 0.55 / scale;
      sim.uPointerStrength.value = this.reducedMotion ? 0 : (1.2 + pointer.energy * 5) / scale;
      sim.uPulse.value = system === this.jelly ? 0 : pulse;
      if (!this.paused) system.update(dt, time);
    }

    this.abyss.update({ time, depth: rig.depth, rise: time * 0.02 + fx.travel * 0.22, opacity: 0.22 });
    this.drift.update({ time, travel: fx.travel, camera: this.camera.position });
    this.ocean.update({ time, depth: rig.depth, tint: this.abyss.tint, camera: this.camera.position });
    this.updateSchool(dt, time);

    const water = this.water;
    const wp = this.waterPass.uniforms;
    this.waterPass.enabled = water.strength > 0.002;
    wp.uTime.value = time;
    wp.uStrength.value = water.strength;
    wp.uFront.value = water.front;
    wp.uDir.value.set(water.dir, 0.32);
    wp.uAspect.value = this.camera.aspect;
    this.bubbles.update({ camera: this.camera, time, dt, strength: water.strength, pixelRatio: this.pixelRatio() });

    this.afterimage.uniforms.damp.value = this.reducedMotion ? 0 : fx.trail;
    this.afterimage.enabled = fx.trail > 0.01 && !this.reducedMotion && !this.lite && !this.noTrails;
    this.bloom.strength = fx.bloom;
    this.bloom.threshold = fx.threshold;
    this.renderer.toneMappingExposure = fx.exposure;
    this.finish.uniforms.uWarp.value = this.reducedMotion ? 0 : fx.warp;
    this.finish.uniforms.uTime.value = time;
    this.composer.render(dt);
    requestAnimationFrame(this.frame);
  }
}
