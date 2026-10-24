import * as THREE from 'three';

const passVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

// Travelling between works pushes a wall of water across the frame: the image
// bends, smears and splits along a moving front, with caustics in the wall.
export const WaterShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uStrength: { value: 0 },
    uFront: { value: -2 },
    uDir: { value: new THREE.Vector2(1, 0.3) },
    uAspect: { value: 1 },
  },
  vertexShader: passVertex,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uStrength;
    uniform float uFront;
    uniform vec2 uDir;
    uniform float uAspect;
    varying vec2 vUv;

    float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float noise(vec2 p) {
      vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }

    void main() {
      vec2 uv = vUv;
      if (uStrength < 0.002) { gl_FragColor = texture2D(tDiffuse, uv); return; }
      vec2 dir = normalize(uDir);
      vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
      // the wall is gently curved, like the face of a passing current
      float s = dot(p, dir) + 0.18 * pow(dot(p, vec2(-dir.y, dir.x)), 2.0);
      float d = s - uFront;
      float wall = exp(-d * d * 9.0);
      float wake = smoothstep(0.0, -0.9, d) * 0.45;
      float swell = (0.75 + wall + wake * 0.6) * uStrength;
      vec2 q = p * 2.6 + vec2(uTime * 0.22, -uTime * 0.16);
      float n1 = fbm(q);
      float n2 = fbm(q + vec2(5.2, 1.3));
      vec2 normal = vec2(n1, n2) - 0.5;
      float ripple = sin(d * 42.0 - uTime * 5.0) * wall;
      vec2 offset = normal * 0.085 * swell + dir * ripple * 0.016 * uStrength;
      // long, slow waves across the full screen
      offset += vec2(
        sin(uv.y * 8.0 + uTime * 2.4 + n1 * 3.0),
        cos(uv.x * 6.5 - uTime * 2.0 + n2 * 3.0)
      ) * 0.02 * uStrength;
      offset.x /= uAspect;
      // a water lens: the image bends away toward the edges
      vec2 centred = uv - 0.5;
      float edge = dot(centred * vec2(uAspect, 1.0), centred * vec2(uAspect, 1.0));
      offset += centred * edge * 0.3 * uStrength;
      // dispersion along the wall's edge
      vec2 split = dir * (0.0015 + 0.011 * wall) * uStrength;
      split.x /= uAspect;
      // motion blur along the travel: strongest in the wall, gone on arrival
      vec2 streak = dir * (0.006 + 0.026 * (wall + wake * 0.5)) * uStrength;
      streak.x /= uAspect;
      vec3 col = vec3(0.0);
      float total = 0.0;
      for (int i = 0; i < 7; i++) {
        float k = float(i) / 6.0 - 0.5;
        float w = 1.0 - abs(k) * 1.2;
        vec2 at = uv + offset + streak * k;
        col += w * vec3(texture2D(tDiffuse, at + split).r, texture2D(tDiffuse, at).g, texture2D(tDiffuse, at - split).b);
        total += w;
      }
      col /= total;
      // caustics: ridged noise warped by the same flow, only inside the wall
      vec2 cq = q * 1.7 + vec2(n1, n2) * 1.6;
      float r1 = 1.0 - abs(fbm(cq + uTime * 0.08) * 2.0 - 1.0);
      float r2 = 1.0 - abs(fbm(cq * 1.9 - uTime * 0.06 + 3.1) * 2.0 - 1.0);
      float patches = smoothstep(0.42, 0.72, fbm(q * 0.7 + 8.0));
      float caustic = (pow(r1, 12.0) * 0.6 + pow(r2, 18.0) * 0.4) * wall * patches;
      col += vec3(0.62, 0.9, 1.0) * caustic * 0.2 * uStrength;
      // a cooler, deeper tone while passing through
      col = mix(col, col * vec3(0.84, 0.96, 1.04), 0.3 * uStrength);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

// The lens: chromatic aberration toward the edges, a vignette, film grain
// that scales with brightness, and a radial zoom blur when warping.
export const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uWarp: { value: 0 },
    uAberration: { value: 0.0025 },
    uGrain: { value: 0.045 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: passVertex,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uWarp;
    uniform float uAberration;
    uniform float uGrain;
    uniform vec2 uResolution;
    varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 uv = 0.5 + c * (1.0 - uWarp * 0.22 * (0.4 + r2 * 2.5));
      vec2 dir = c * (uAberration + uWarp * 0.03) * (0.4 + r2 * 3.0);
      vec3 color = vec3(0.0);
      if (uWarp < 0.002) {
        color = vec3(texture2D(tDiffuse, uv + dir).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - dir).b);
      } else {
        const int TAPS = 8;
        for (int i = 0; i < TAPS; i++) {
          float t = float(i) / float(TAPS - 1);
          vec2 blur = -c * uWarp * 0.09 * t;
          color.r += texture2D(tDiffuse, uv + blur + dir).r;
          color.g += texture2D(tDiffuse, uv + blur).g;
          color.b += texture2D(tDiffuse, uv + blur - dir).b;
        }
        color /= float(TAPS);
      }
      color *= mix(1.0, 0.42, smoothstep(0.1, 0.72, r2 * 1.8));
      float grain = fract(sin(dot(floor(vUv * uResolution) + floor(uTime * 24.0) * 7.13, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      color += grain * uGrain * sqrt(max(dot(color, vec3(0.2126, 0.7152, 0.0722)), 0.0006));
      gl_FragColor = vec4(max(color, 0.0), 1.0);
    }
  `,
};
