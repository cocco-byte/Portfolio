// The loading screen: a sinking water column drawn in raw WebGL (three.js
// isn't ready yet), with the percentage written in a few thousand drifting
// points. When loading completes the numerals scatter into marine snow and
// the visitor chooses to enter with or without sound.

const SCRAMBLE = '#/+×';

const seaVertex = `
attribute vec2 position;
varying vec2 vUv;
void main() { vUv = position * 0.5 + 0.5; gl_Position = vec4(position, 0.0, 1.0); }
`;

const seaFragment = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uDepth;
uniform float uExit;
varying vec2 vUv;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; } return v; }

void main() {
  vec2 uv = vUv;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y);
  float d = clamp(uDepth + uExit * 0.25, 0.0, 1.0);

  // the water column: turquoise near the light, deepening as we sink
  vec3 top = mix(vec3(0.24, 0.62, 0.7), vec3(0.04, 0.17, 0.22), smoothstep(0.0, 1.0, d));
  vec3 bottom = mix(vec3(0.03, 0.17, 0.23), vec3(0.006, 0.022, 0.035), smoothstep(0.0, 0.9, d));
  vec3 col = mix(bottom, top, pow(uv.y, 1.25));

  // the surface overhead: rippling light, climbing away as we sink
  float surfaceY = 1.02 + d * 0.9;
  float nearSurface = smoothstep(0.35, 0.0, surfaceY - uv.y);
  float ripple = fbm(vec2(p.x * 2.4 + uTime * 0.05, uTime * 0.07));
  float lines = smoothstep(0.62, 0.7, fbm(vec2(p.x * 5.5, p.x * 1.3 + uTime * 0.11) + ripple * 1.6));
  col += vec3(0.62, 0.92, 0.98) * nearSurface * (0.45 * ripple + 0.55 * lines) * (1.0 - d);

  // shafts of light falling from above
  float angle = atan(p.x + 0.25, 1.9 - uv.y);
  float shafts = fbm(vec2(angle * 7.0, uTime * 0.05)) * fbm(vec2(angle * 17.0 + 3.0, uTime * 0.03));
  col += vec3(0.55, 0.88, 0.95) * pow(shafts, 1.6) * smoothstep(0.0, 1.0, uv.y) * 0.55 * (1.0 - d * 0.8);

  // marine snow: three depths, drifting up past us as we sink
  for (int layer = 0; layer < 3; layer++) {
    float l = float(layer);
    float scale = 16.0 + l * 13.0;
    vec2 q = p * scale + vec2(0.0, -(uTime * (0.18 + l * 0.1) + uDepth * (5.0 + l * 6.0)));
    vec2 id = floor(q);
    vec2 f = fract(q) - 0.5;
    float h = hash(id);
    vec2 off = vec2(hash(id + 1.3), hash(id + 2.7)) - 0.5;
    off.x += sin(uTime * 0.4 + h * 20.0) * 0.12;
    float r = length(f - off * 0.7);
    float speck = smoothstep(0.09 + 0.05 * h, 0.0, r) * step(0.72, h);
    col += vec3(0.78, 0.94, 0.98) * speck * (0.12 + l * 0.12);
  }

  // quiet vignette and the dive on entering
  col *= mix(1.0, smoothstep(1.35, 0.25, length((uv - 0.5) * vec2(aspect, 1.0))), 0.55);
  col *= 1.0 - uExit * 0.35;
  gl_FragColor = vec4(col, 1.0);
}
`;

const pointVertex = `
attribute vec2 position;
attribute float seed;
uniform vec2 uRes;
uniform float uSize;
varying float vSeed;
void main() {
  vSeed = seed;
  vec2 clip = position / uRes * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = uSize * (0.7 + seed * 0.6);
}
`;

const pointFragment = `
precision mediump float;
uniform float uAlpha;
varying float vSeed;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.1, d) * uAlpha * (0.75 + 0.25 * vSeed);
  gl_FragColor = vec4(vec3(1.0, 0.99, 0.96) * a * 1.15, a);
}
`;

// Sample each digit of a font into points, normalised to the cap height.
function sampleDigits(font = '"Instrument Serif", "Times New Roman", serif') {
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 300;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.font = `400 220px ${font}`;
  const cap = ctx.measureText('0').actualBoundingBoxAscent || 154;
  const glyphs = {};
  for (const digit of '0123456789') {
    ctx.clearRect(0, 0, 300, 300);
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(digit, 20, 260);
    const { data } = ctx.getImageData(0, 0, 300, 300);
    const lit = [];
    for (let y = 0; y < 300; y += 1) for (let x = 0; x < 300; x += 1) if (data[(y * 300 + x) * 4 + 3] > 128) lit.push(x, y);
    const n = Math.min(1100, lit.length / 2);
    const points = new Float32Array(n * 2);
    for (let i = 0; i < n; i += 1) {
      const pick = Math.floor(Math.random() * (lit.length / 2));
      points[i * 2] = (lit[pick * 2] - 20 + Math.random()) / cap;
      points[i * 2 + 1] = (lit[pick * 2 + 1] - (260 - cap) + Math.random()) / cap;
    }
    glyphs[digit] = { points, advance: (ctx.measureText(digit).width / cap) * 0.94 };
  }
  return glyphs;
}

// Points that spring toward the outline of a number, or scatter and rise.
class Numerals {
  constructor(count) {
    this.count = count;
    this.pos = new Float32Array(count * 2);
    this.seed = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      this.seed[i] = Math.random();
      this.pos[i * 2] = Math.random();
      this.pos[i * 2 + 1] = Math.random();
    }
    this.text = '';
    this.targets = null;
    this.glyphs = null;
  }

  layout(text, width, height) {
    if (!this.glyphs) return;
    const glyphs = this.glyphs;
    const digits = Array.from(text).filter((c) => glyphs[c]);
    if (!digits.length) return;
    // sized so "100" fits
    const widest = glyphs[1].advance + glyphs[0].advance * 2;
    const scale = Math.min(height * 0.28, (width * 0.78) / widest);
    const span = digits.reduce((sum, c) => sum + glyphs[c].advance, 0) * scale;
    let x = width / 2 - span / 2;
    const placed = digits.map((c) => {
      const at = { glyph: glyphs[c], x, y: height * 0.5 - scale * 0.5 };
      x += glyphs[c].advance * scale;
      return at;
    });
    const targets = new Float32Array(this.count * 2);
    for (let i = 0; i < this.count; i += 1) {
      const at = placed[i % placed.length];
      const points = at.glyph.points;
      const pick = (Math.floor(i / placed.length) * 7919) % (points.length / 2);
      targets[i * 2] = at.x + points[pick * 2] * scale;
      targets[i * 2 + 1] = at.y + points[pick * 2 + 1] * scale;
    }
    this.targets = targets;
    this.text = text;
    this.size = { w: width, h: height };
  }

  scatter(width, height) {
    this.scattered = true;
    this.size = { w: width, h: height };
    for (let i = 0; i < this.count; i += 1) {
      this.targets[i * 2] = Math.random() * width;
      this.targets[i * 2 + 1] = Math.random() * height;
    }
  }

  step(dt, time) {
    if (!this.targets) return;
    if (this.scattered) {
      for (let i = 0; i < this.count; i += 1) {
        const y = i * 2 + 1;
        this.targets[y] -= dt * (6 + this.seed[i] * 14);
        if (this.targets[y] < -10) {
          this.targets[y] += this.size.h + 20;
          this.pos[y] = this.targets[y];
        }
      }
    }
    const k = 1 - Math.exp(-dt * (this.scattered ? 1.6 : 7));
    for (let i = 0; i < this.count; i += 1) {
      const s = this.seed[i];
      const wobbleX = Math.sin(time * (1.1 + s) + i * 2.3) * 0.6;
      const wobbleY = Math.cos(time * (0.9 + s) + i * 1.7) * 0.6;
      const o = i * 2;
      this.pos[o] += (this.targets[o] + wobbleX - this.pos[o]) * k * (0.6 + s * 0.8);
      this.pos[o + 1] += (this.targets[o + 1] + wobbleY - this.pos[o + 1]) * k * (0.6 + s * 0.8);
    }
  }
}

class LoaderScene {
  constructor(canvas, { reducedMotion = false, small = false } = {}) {
    this.canvas = canvas;
    this.reducedMotion = reducedMotion;
    this.time = 0;
    this.shown = 0;
    this.depth = 0;
    this.completed = false;
    this.exit = 0;
    this.exiting = false;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
    this.gl = gl;
    if (!gl) return;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    };
    const link = (vertex, fragment) => {
      const program = gl.createProgram();
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(program);
      return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
    };
    this.sea = link(seaVertex, seaFragment);
    this.dots = link(pointVertex, pointFragment);
    if (!this.sea || !this.dots) {
      this.gl = null;
      return;
    }
    // one oversized triangle covers the screen
    this.triangle = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.triangle);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.seaPosition = gl.getAttribLocation(this.sea, 'position');
    this.seaUniforms = Object.fromEntries(['uRes', 'uTime', 'uDepth', 'uExit'].map((n) => [n, gl.getUniformLocation(this.sea, n)]));

    this.numerals = new Numerals(small ? 2600 : 4400);
    this.pointBuffer = gl.createBuffer();
    this.seedBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.seedBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.numerals.seed, gl.STATIC_DRAW);
    this.dotUniforms = Object.fromEntries(['uRes', 'uSize', 'uAlpha'].map((n) => [n, gl.getUniformLocation(this.dots, n)]));
    this.dotAttribs = { position: gl.getAttribLocation(this.dots, 'position'), seed: gl.getAttribLocation(this.dots, 'seed') };
  }

  get ok() {
    return !!this.gl;
  }

  setGlyphs(glyphs) {
    if (!this.numerals) return;
    this.numerals.glyphs = glyphs;
    this.numerals.text = '';
  }

  setSize(width, height, ratio) {
    this.css = { w: width, h: height };
    const scale = Math.min(ratio, 1.25) * 0.75;
    this.canvas.width = Math.max(1, Math.round(width * scale));
    this.canvas.height = Math.max(1, Math.round(height * scale));
    this.gl?.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  step(dt) {
    const gl = this.gl;
    if (!gl) return;
    this.time += this.reducedMotion ? 0 : dt;
    this.depth += (this.shown - this.depth) * (1 - Math.exp(-dt * 3));
    if (this.exiting) this.exit = Math.min(1, this.exit + dt / 0.9);

    gl.useProgram(this.sea);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.triangle);
    gl.enableVertexAttribArray(this.seaPosition);
    gl.vertexAttribPointer(this.seaPosition, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.BLEND);
    gl.uniform2f(this.seaUniforms.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.seaUniforms.uTime, this.time);
    gl.uniform1f(this.seaUniforms.uDepth, this.depth);
    gl.uniform1f(this.seaUniforms.uExit, this.exit);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const numerals = this.numerals;
    if (!numerals.glyphs || !this.css) return;
    const text = String(Math.round(this.shown * 100));
    if (this.completed && !numerals.scattered) numerals.scatter(this.css.w, this.css.h);
    else if (!numerals.scattered && text !== numerals.text) numerals.layout(text, this.css.w, this.css.h);
    numerals.step(dt, this.time);

    gl.useProgram(this.dots);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pointBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, numerals.pos, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.dotAttribs.position);
    gl.vertexAttribPointer(this.dotAttribs.position, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.seedBuffer);
    gl.enableVertexAttribArray(this.dotAttribs.seed);
    gl.vertexAttribPointer(this.dotAttribs.seed, 1, gl.FLOAT, false, 0, 0);
    gl.uniform2f(this.dotUniforms.uRes, this.css.w, this.css.h);
    gl.uniform1f(this.dotUniforms.uSize, Math.max(1.8, 2.7 * (this.canvas.width / this.css.w)));
    gl.uniform1f(this.dotUniforms.uAlpha, (1 - this.exit) * (numerals.scattered ? 0.5 : 1));
    gl.drawArrays(gl.POINTS, 0, numerals.count);
    gl.disableVertexAttribArray(this.dotAttribs.seed);
  }
}

export class Loader {
  constructor(root, { reducedMotion = false, name = '' } = {}) {
    this.root = root;
    this.reducedMotion = reducedMotion;
    this.canvas = root.querySelector('[data-loader-motif]');
    this.count = root.querySelector('[data-loader-count]');
    this.depth = root.querySelector('[data-loader-depth]');
    this.particles = root.querySelector('[data-loader-particles]');
    this.rule = root.querySelector('[data-loader-rule]');
    this.name = root.querySelector('[data-loader-name]');
    this.mask = 'X'.repeat(name.length);
    this.total = 0;
    this.target = 0;
    this.shown = 0;
    this.startedAt = performance.now();
    this.last = this.startedAt;
    this.running = true;
    this.completed = false;
    this.exiting = false;
    if (this.canvas) {
      const scene = new LoaderScene(this.canvas, { small: window.innerWidth < 760, reducedMotion });
      if (scene.ok) this.scene = scene;
    }
    this.resize = this.resize.bind(this);
    this.render = this.render.bind(this);
    this.resize();
    window.addEventListener('resize', this.resize);
    this.scene?.setGlyphs(sampleDigits());
    document.fonts
      ?.load('400 220px "Instrument Serif"', '0123456789')
      .then(() => this.scene?.setGlyphs(sampleDigits()))
      .catch(() => {});
    requestAnimationFrame(this.render);
  }

  // "Something went wrong" with a reload and a light (no WebGL) way in.
  trouble(message, { onLight } = {}) {
    const box = this.root.querySelector('[data-loader-trouble]');
    if (!box) return;
    this.root.setAttribute('data-trouble', '');
    box.querySelector('[data-loader-trouble-text]').textContent = message;
    box.hidden = false;
    box.querySelector('[data-loader-retry]').onclick = () => window.location.reload();
    box.querySelector('[data-loader-light]').onclick = () => onLight?.();
    box.querySelector('[data-loader-retry]').focus({ preventScroll: true });
  }

  clearTrouble() {
    const box = this.root.querySelector('[data-loader-trouble]');
    if (box) box.hidden = true;
    this.root.removeAttribute('data-trouble');
  }

  setTotal(total) {
    this.total = total;
  }

  setProgress(progress) {
    this.target = Math.max(this.target, Math.min(1, progress));
  }

  resize() {
    this.scene?.setSize(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio || 1, 2));
  }

  render(now) {
    if (!this.running) return;
    const dt = Math.min(0.5, (now - this.last) / 1000);
    this.last = now;
    // never faster than 1.2s, so the count is readable
    const floor = this.reducedMotion ? 1 : Math.min(1, (now - this.startedAt) / 1200);
    const goal = Math.min(this.target, floor);
    this.shown += (goal - this.shown) * (1 - Math.exp(-dt * 7));
    if (goal >= 1 && this.shown > 0.995) this.shown = 1;
    const percent = Math.round(this.shown * 100);
    if (this.count && this.count.textContent !== String(percent)) this.count.textContent = String(percent);
    this.root.setAttribute('aria-valuenow', String(percent));
    if (this.rule) this.rule.style.transform = `scaleX(${this.shown})`;
    if (this.depth) this.depth.textContent = Math.round(this.shown * 4000).toLocaleString('en-US');
    if (this.particles) this.particles.textContent = Math.round(this.shown * this.total).toLocaleString('en-US');
    if (this.name && !this.reducedMotion && this.shown < 1 && Math.random() < 0.2) {
      this.name.textContent = Array.from(this.mask, () => (Math.random() < 0.16 ? SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)] : 'X')).join('');
    }
    if (this.scene) {
      this.scene.shown = this.shown;
      this.scene.completed = this.completed;
      this.scene.exiting = this.exiting;
      this.scene.step(dt);
    }
    if (this.shown >= 1 && !this.completed) {
      this.completed = true;
      if (this.name) this.name.textContent = this.mask;
      this.onComplete?.();
    }
    requestAnimationFrame(this.render);
  }

  // Resolves with "sound" or "silent" once loading is done and a button is
  // pressed.
  waitForChoice() {
    return new Promise((resolve) => {
      this.onComplete = () => {
        this.root.setAttribute('data-ready', '');
        const buttons = Array.from(this.root.querySelectorAll('[data-enter]'));
        buttons[0]?.focus({ preventScroll: true });
        const choose = (event) => {
          // iOS asks for motion permission on a user gesture
          const Orientation = window.DeviceOrientationEvent;
          if (Orientation && typeof Orientation.requestPermission === 'function') Orientation.requestPermission().catch(() => {});
          buttons.forEach((button) => button.removeEventListener('click', choose));
          resolve(event.currentTarget.dataset.enter);
        };
        buttons.forEach((button) => button.addEventListener('click', choose));
      };
      if (this.completed) this.onComplete();
    });
  }

  finish() {
    this.exiting = true;
    this.root.setAttribute('data-done', '');
    window.setTimeout(() => {
      this.running = false;
      window.removeEventListener('resize', this.resize);
      this.root.remove();
    }, 1400);
  }
}
