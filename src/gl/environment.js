import * as THREE from 'three';

const valueNoise = /* glsl */ `
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }
`;

const fbm = /* glsl */ `
  ${valueNoise}
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
`;

const fog = /* glsl */ `
  uniform float uFogDensity;
  float fogAlpha(vec3 world) { return exp(-length(world - cameraPosition) * uFogDensity); }
`;

// The water itself: a full-screen gradient that darkens with depth, light
// shafts and caustics near the surface, bioluminescent haze in the deep.
// Plus "marine snow", slow specks drifting up past the camera.
export class Abyss {
  constructor({ scene, pixelRatio = 1, count = 900 }) {
    this.waterMaterial = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform float uDepth;
        uniform float uTime;
        uniform float uAspect;
        uniform vec3 uTint;
        varying vec2 vUv;
        ${valueNoise}
        vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }

        void main() {
          vec2 uv = vUv;
          float d = uDepth;
          vec3 surfaceTop = toLinear(vec3(0.20, 0.44, 0.52));
          vec3 surfaceLow = toLinear(vec3(0.03, 0.10, 0.15));
          vec3 twilightTop = toLinear(vec3(0.05, 0.13, 0.20));
          vec3 twilightLow = toLinear(vec3(0.01, 0.03, 0.06));
          vec3 abyssTop = toLinear(vec3(0.012, 0.02, 0.04));
          vec3 abyssLow = vec3(0.0);

          float a = smoothstep(0.0, 0.42, d);
          float b = smoothstep(0.42, 1.0, d);
          vec3 top = mix(mix(surfaceTop, twilightTop, a), abyssTop, b);
          vec3 low = mix(mix(surfaceLow, twilightLow, a), abyssLow, b);
          vec3 color = mix(low, top, pow(uv.y, 1.35));

          // slanted light shafts from the surface, gone by the twilight zone
          float slant = (uv.x - 0.5) * uAspect + (1.0 - uv.y) * 0.32;
          float shafts = noise(vec2(slant * 6.5, uTime * 0.07)) * noise(vec2(slant * 15.0 + 7.0, uTime * 0.11 + 3.0));
          shafts = smoothstep(0.18, 0.72, shafts) * smoothstep(0.05, 1.0, uv.y);
          color += toLinear(vec3(0.55, 0.85, 0.9)) * shafts * 0.2 * (1.0 - smoothstep(0.0, 0.34, d));

          // surface caustics shimmer along the very top in the first screen
          float caustic = noise(vec2(uv.x * uAspect * 18.0, uTime * 0.6)) * noise(vec2(uv.x * uAspect * 31.0 - uTime * 0.4, 2.0));
          color += toLinear(vec3(0.7, 0.95, 1.0)) * caustic * smoothstep(0.8, 1.0, uv.y) * 0.2 * (1.0 - smoothstep(0.0, 0.18, d));

          // faint bioluminescent haze in the deep
          float haze = noise(uv * vec2(uAspect, 1.0) * 2.2 + vec2(uTime * 0.015, -uTime * 0.01));
          vec3 hazeColor = mix(toLinear(vec3(0.22, 0.02, 0.14)), toLinear(vec3(0.0, 0.14, 0.2)), uv.x);
          color += hazeColor * smoothstep(0.45, 0.9, haze) * smoothstep(0.35, 1.0, d) * 0.35;

          gl_FragColor = vec4(color * uTint, 1.0);
        }
      `,
      uniforms: {
        uDepth: { value: 0 },
        uTime: { value: 0 },
        uAspect: { value: 1 },
        uTint: { value: new THREE.Color(1, 1, 1) },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.waterMaterial);
    this.water.frustumCulled = false;
    this.water.renderOrder = -10;
    scene.add(this.water);

    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 16;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 10;
      positions[i * 3 + 2] = -11 + Math.random() * 14;
      seeds[i] = Math.random();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    this.snowMaterial = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uRise;
        uniform float uPixelRatio;
        attribute float aSeed;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          float span = 10.0;
          p.y = mod(p.y + uTime * 0.035 * (0.4 + aSeed) + uRise + span * 0.5, span) - span * 0.5;
          p.x += sin(uTime * 0.17 + aSeed * 31.0) * 0.12;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float depthFade = smoothstep(-12.0, -4.0, mv.z) * (1.0 - smoothstep(-1.2, 0.0, mv.z));
          gl_PointSize = (1.5 + aSeed * 3.5) * uPixelRatio * (5.0 / max(0.6, -mv.z));
          vAlpha = (0.12 + aSeed * 0.4) * depthFade;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float alpha = smoothstep(0.5, 0.0, d) * vAlpha * uOpacity;
          if (alpha < 0.004) discard;
          gl_FragColor = vec4(vec3(0.78, 0.93, 1.0), alpha);
        }
      `,
      uniforms: {
        uTime: { value: 0 },
        uRise: { value: 0 },
        uPixelRatio: { value: pixelRatio },
        uOpacity: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.snow = new THREE.Points(geometry, this.snowMaterial);
    this.snow.frustumCulled = false;
    this.snow.renderOrder = 1;
    scene.add(this.snow);
  }

  get tint() {
    return this.waterMaterial.uniforms.uTint.value;
  }

  resize(width, height, pixelRatio) {
    this.waterMaterial.uniforms.uAspect.value = width / Math.max(1, height);
    this.snowMaterial.uniforms.uPixelRatio.value = pixelRatio;
  }

  update({ time, depth, rise, opacity }) {
    this.waterMaterial.uniforms.uTime.value = time;
    this.waterMaterial.uniforms.uDepth.value = depth;
    this.snowMaterial.uniforms.uTime.value = time;
    this.snowMaterial.uniforms.uRise.value = rise;
    this.snowMaterial.uniforms.uOpacity.value = opacity;
  }
}

// Seasonal drift: one point cloud that wraps around the camera and draws
// itself as petals, fireflies, maple leaves or snow depending on uniforms.
export class Drift {
  constructor({ scene, tier = 'high' }) {
    const count = tier === 'high' ? 3200 : 1300;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      positions.set([(Math.random() - 0.5) * 36, (Math.random() - 0.5) * 22, (Math.random() - 0.5) * 36], i * 3);
      seeds[i] = Math.random();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

    this.uniforms = {
      uTime: { value: 0 },
      uTravel: { value: 0 },
      uFall: { value: 0.25 },
      uSway: { value: 0.35 },
      uPetal: { value: 1 },
      uLeaf: { value: 0 },
      uFirefly: { value: 0 },
      uCamera: { value: new THREE.Vector3() },
      uSpan: { value: new THREE.Vector3(36, 22, 36) },
      uOpacity: { value: 0.9 },
      uPixelRatio: { value: 1 },
      uColorA: { value: new THREE.Color('#ffd3e2') },
      uColorB: { value: new THREE.Color('#ff9ec0') },
    };
    this.points = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: /* glsl */ `
          uniform float uTime;
          uniform float uTravel;
          uniform float uFall;
          uniform float uSway;
          uniform float uPixelRatio;
          uniform vec3 uCamera;
          uniform vec3 uSpan;
          attribute float aSeed;
          varying float vSeed;
          varying float vAngle;
          varying float vFade;
          void main() {
            vec3 p = position;
            p.y += -uTime * uFall * (0.5 + aSeed) + uTravel * 0.35;
            p.x += sin(uTime * (0.3 + aSeed * 0.5) + aSeed * 30.0) * uSway;
            p.z += cos(uTime * 0.23 + aSeed * 17.0) * uSway * 0.5;
            // wrap around the camera: an endless medium
            vec3 rel = p - uCamera;
            rel = mod(rel + uSpan * 0.5, uSpan) - uSpan * 0.5;
            p = uCamera + rel;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            float distance = max(0.4, -mv.z);
            gl_PointSize = min((2.4 + aSeed * 3.4) * uPixelRatio * (10.0 / distance), 150.0 * uPixelRatio);
            vSeed = aSeed;
            vAngle = aSeed * 6.2831 + uTime * (aSeed - 0.5) * 1.4;
            // near pieces are soft, far ones fade into the water
            vFade = smoothstep(-19.0, -8.0, mv.z) * (1.0 - smoothstep(-0.6, -0.1, mv.z))
              * (1.0 - smoothstep(2.5, 6.0, 1.0 / max(0.15, distance) * 6.0) * 0.55);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uPetal;
          uniform float uLeaf;
          uniform float uFirefly;
          uniform float uTime;
          uniform float uOpacity;
          uniform vec3 uColorA;
          uniform vec3 uColorB;
          varying float vSeed;
          varying float vAngle;
          varying float vFade;
          void main() {
            vec2 q = gl_PointCoord - 0.5;
            float c = cos(vAngle);
            float s = sin(vAngle);
            q = mat2(c, -s, s, c) * q;
            // petal: a rounded teardrop with a notch; snow / spark: a soft dot
            vec2 pq = q * vec2(1.7, 1.15) + vec2(0.0, 0.08);
            float petal = smoothstep(0.42, 0.3, length(pq)) * (1.0 - smoothstep(0.06, 0.0, abs(q.x)) * step(0.28, q.y));
            float disc = smoothstep(0.5, 0.0, length(q));
            // maple leaf: slender pointed lobes fanning from the base
            vec2 lq = q * 2.3 + vec2(0.0, 0.32);
            float leaf = step(length(lq - vec2(0.0, 0.04)), 0.16);
            for (int i = 0; i < 7; i++) {
              float fi = float(i);
              float a = (fi < 0.5) ? 0.0 : ((mod(fi, 2.0) < 0.5 ? -1.0 : 1.0) * (0.698 * floor((fi + 1.0) / 2.0)));
              float len = (fi < 0.5) ? 0.95 : (fi < 2.5 ? 0.9 : (fi < 4.5 ? 0.74 : 0.44));
              vec2 axis = vec2(sin(a), cos(a));
              float along = dot(lq, axis) / len;
              float across = abs(lq.x * axis.y - lq.y * axis.x);
              float halfWidth = (along > 0.0 && along < 1.0) ? 0.155 * pow(sin(3.14159 * pow(along, 0.8)), 1.3) * pow(1.0 - along, 0.14) : -1.0;
              leaf = max(leaf, step(across, halfWidth));
            }
            leaf = max(leaf, step(abs(lq.x), 0.018) * step(lq.y, 0.0) * step(-0.42, lq.y));
            float shape = mix(mix(disc, petal, uPetal), min(1.0, leaf), uLeaf);
            float alpha = shape * uOpacity * vFade * (0.35 + vSeed * 0.65);
            // fireflies: each glows and goes dark on its own slow rhythm
            float blink = smoothstep(0.55, 1.0, sin(uTime * (0.45 + vSeed * 0.9) + vSeed * 57.0));
            alpha *= mix(1.0, 0.08 + blink * 1.6, uFirefly);
            if (alpha < 0.01) discard;
            vec3 color = mix(uColorA, uColorB, vSeed) * mix(1.0, 0.8 + (q.y + 0.5) * 0.4, uPetal);
            color *= 1.0 + uFirefly * 1.4;
            gl_FragColor = vec4(color, alpha);
          }
        `,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    scene.add(this.points);
  }

  setPixelRatio(ratio) {
    this.uniforms.uPixelRatio.value = ratio;
  }

  update({ time, travel, camera }) {
    this.uniforms.uCamera.value.copy(camera);
    this.uniforms.uTime.value = time;
    this.uniforms.uTravel.value = travel;
  }
}

// The world around the creatures: a rippling surface far overhead, sand dunes
// below and slanted pillars of light, all fading with fog and depth.
export class Ocean {
  constructor(scene) {
    this.uniforms = {
      uTime: { value: 0 },
      uDepth: { value: 0 },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uFogDensity: { value: 0.022 },
    };
    const uniforms = this.uniforms;

    this.surface = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 420, 1, 1),
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: /* glsl */ `
          varying vec3 vWorld;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vWorld = w.xyz;
            gl_Position = projectionMatrix * viewMatrix * w;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform float uDepth;
          uniform vec3 uTint;
          varying vec3 vWorld;
          ${fbm}
          ${fog}
          void main() {
            vec2 p = vWorld.xz;
            float window = exp(-length(p) / 70.0);
            float ripples = fbm(p * 0.06 + vec2(uTime * 0.03, -uTime * 0.02));
            float lines = smoothstep(0.55, 0.62, fbm(p * 0.12 - vec2(uTime * 0.05, uTime * 0.04) + ripples));
            vec3 deep = vec3(0.04, 0.14, 0.2);
            vec3 light = vec3(0.62, 0.9, 0.98);
            vec3 color = mix(deep, light, window * (0.55 + ripples * 0.45)) + light * lines * window * 0.35;
            float strength = pow(1.0 - uDepth, 2.2);
            gl_FragColor = vec4(color * uTint, fogAlpha(vWorld) * strength * 0.85);
          }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.surface.rotation.x = Math.PI / 2;
    this.surface.renderOrder = -5;
    this.surface.frustumCulled = false;

    const dunes = new THREE.PlaneGeometry(360, 360, 160, 160);
    dunes.rotateX(-Math.PI / 2);
    this.seabed = new THREE.Mesh(
      dunes,
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: /* glsl */ `
          uniform float uTime;
          varying vec3 vWorld;
          ${fbm}
          float dunes(vec2 p) { return fbm(p * 0.035) * 7.0 + sin(p.x * 0.09 + fbm(p * 0.02) * 4.0) * 1.4; }
          void main() {
            vec3 p = position;
            p.y += dunes(p.xz);
            vec4 w = modelMatrix * vec4(p, 1.0);
            vWorld = w.xyz;
            gl_Position = projectionMatrix * viewMatrix * w;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform float uDepth;
          uniform vec3 uTint;
          varying vec3 vWorld;
          ${fbm}
          ${fog}
          void main() {
            vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
            float light = 0.35 + 0.65 * max(n.y, 0.0);
            vec3 sand = mix(vec3(0.08, 0.12, 0.14), vec3(0.2, 0.26, 0.26), fbm(vWorld.xz * 0.3));
            float caustic = smoothstep(0.58, 0.66, fbm(vWorld.xz * 0.18 + vec2(uTime * 0.04, uTime * 0.03))) * (1.0 - uDepth);
            vec3 color = sand * light * (0.5 + (1.0 - uDepth) * 0.7) + vec3(0.5, 0.8, 0.85) * caustic * 0.25;
            // bioluminescent specks in the deep
            vec2 cell = floor(vWorld.xz * 1.6);
            float speck = step(0.996, hash21(cell)) * (0.5 + 0.5 * sin(uTime * 1.3 + hash21(cell + 3.0) * 20.0));
            color += vec3(0.5, 0.9, 1.0) * speck * uDepth * 0.9;
            gl_FragColor = vec4(color * uTint, fogAlpha(vWorld) * 0.95);
          }
        `,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.seabed.renderOrder = -6;
    this.seabed.frustumCulled = false;

    const shaftMaterial = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorld;
        void main() {
          vUv = uv;
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uDepth;
        uniform vec3 uTint;
        varying vec2 vUv;
        varying vec3 vWorld;
        ${fog}
        void main() {
          float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
          float shaft = pow(across, 3.0) * smoothstep(0.0, 0.7, vUv.y) * (0.75 + 0.25 * sin(uTime * 0.4 + vWorld.x));
          float strength = pow(1.0 - uDepth, 1.8);
          gl_FragColor = vec4(vec3(0.6, 0.9, 1.0) * uTint, shaft * strength * 0.14 * (0.3 + fogAlpha(vWorld) * 0.7));
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.pillars = new THREE.Group();
    for (let i = 0; i < 9; i += 1) {
      const angle = (i / 9) * Math.PI * 2 + Math.random() * 0.4;
      const distance = 26 + Math.random() * 40;
      const pillar = new THREE.Mesh(new THREE.PlaneGeometry(4 + Math.random() * 7, 48, 1, 1), shaftMaterial);
      pillar.position.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance - 10);
      pillar.rotation.z = (Math.random() - 0.5) * 0.25;
      pillar.renderOrder = -4;
      pillar.frustumCulled = false;
      this.pillars.add(pillar);
    }
    scene.add(this.surface, this.seabed, this.pillars);
  }

  update({ time, depth, tint, camera }) {
    this.uniforms.uTime.value = time;
    this.uniforms.uDepth.value = depth;
    this.uniforms.uTint.value.copy(tint);
    // the surface climbs away and the floor rises as we sink
    this.surface.position.y = 18 + depth * 40;
    this.seabed.position.y = -24 + depth * 6;
    this.pillars.children.forEach((pillar) => pillar.lookAt(camera.x, pillar.position.y, camera.z));
  }
}

// Glass bubbles rushing past the lens while travelling between works.
export class Bubbles {
  constructor(scene, { count = 260 } = {}) {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      positions.set([(Math.random() - 0.5) * 7, (Math.random() - 0.5) * 5, -1.2 - Math.random() * 6], i * 3);
      seeds[i] = Math.random();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    this.uniforms = {
      uTime: { value: 0 },
      uRise: { value: 0 },
      uStrength: { value: 0 },
      uPixelRatio: { value: 1 },
    };
    this.points = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: /* glsl */ `
          uniform float uTime;
          uniform float uRise;
          uniform float uPixelRatio;
          attribute float aSeed;
          varying float vSeed;
          void main() {
            vSeed = aSeed;
            vec3 p = position;
            // rise (faster for small ones), wobble, wrap
            p.y = mod(p.y + uRise * (0.7 + aSeed * 1.3) + 2.5, 5.0) - 2.5;
            p.x += sin(uTime * (2.0 + aSeed * 3.0) + aSeed * 40.0) * 0.06;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = (6.0 + aSeed * 26.0) * uPixelRatio * (3.0 / -mv.z);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uStrength;
          varying float vSeed;
          void main() {
            vec2 q = gl_PointCoord - 0.5;
            float r = length(q);
            if (r > 0.5) discard;
            // a glass bubble: bright thin rim, clear centre, one highlight
            float rim = smoothstep(0.5, 0.44, r) - smoothstep(0.44, 0.32, r) * 0.85;
            float glint = smoothstep(0.12, 0.0, length(q - vec2(-0.16, 0.16)));
            float a = (rim * 0.55 + glint * 0.8) * uStrength * (0.5 + vSeed * 0.5);
            gl_FragColor = vec4(vec3(0.78, 0.94, 1.0) * a, a);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
    this.rise = 0;
  }

  update({ camera, time, dt, strength, pixelRatio }) {
    const visible = strength > 0.002;
    this.points.visible = visible;
    if (!visible) return;
    this.rise += dt * (0.6 + strength * 2.4);
    // the bubbles ride with the camera, so they always sit in front of it
    this.points.position.copy(camera.position);
    this.points.quaternion.copy(camera.quaternion);
    this.uniforms.uTime.value = time;
    this.uniforms.uRise.value = this.rise;
    this.uniforms.uStrength.value = strength;
    this.uniforms.uPixelRatio.value = pixelRatio;
  }
}
