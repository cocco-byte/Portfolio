// GLSL for the GPGPU particle swarms. Every particle owns one texel in a
// position and a velocity texture; each frame it springs toward the matching
// texel of a "form" texture while curl noise and the cursor stir the water.

// Form ids. The id travels to the shaders so each kind can animate its
// targets in its own way (the w channel of a target texel is per-form data).
export const Form = {
  FLOWER: 0,
  JELLY: 1,
  TEXT: 2,
  VORTEX: 4,
  NETWORK: 5,
  FALL: 6,
};

// How bright each kind of form glows.
export const FORM_GLOW = {
  [Form.FLOWER]: 1,
  [Form.JELLY]: 1,
  [Form.TEXT]: 0.95,
  [Form.VORTEX]: 1.45,
  [Form.NETWORK]: 1.15,
  [Form.FALL]: 1,
};

// Simplex noise (Ashima Arts / Stefan Gustavson, MIT) with its analytic
// gradient, and a divergence-free curl built from two noise fields.
const curlNoise = /* glsl */ `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v, out vec3 gradient) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    vec4 m2 = m * m;
    vec4 m4 = m2 * m2;
    vec4 pdotx = vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3));
    vec4 temp = m2 * m * pdotx;
    gradient = -8.0 * (temp.x * x0 + temp.y * x1 + temp.z * x2 + temp.w * x3);
    gradient += m4.x * p0 + m4.y * p1 + m4.z * p2 + m4.w * p3;
    gradient *= 105.0;
    return 105.0 * dot(m4, pdotx);
  }

  vec3 curlNoise(vec3 p) {
    vec3 ga;
    vec3 gb;
    snoise(p, ga);
    snoise(p + vec3(31.416, -47.853, 12.793), gb);
    return normalize(cross(ga, gb) + vec3(1e-5));
  }
`;

// Particles don't all leave at once: each one's seed delays its own morph.
const localMorph = /* glsl */ `
  float localMorph(float morph, float seed) {
    return smoothstep(0.0, 1.0, clamp((morph - seed * 0.45) / 0.55, 0.0, 1.0));
  }
`;

// Living targets: the shape a particle chases moves on its own.
const animateTarget = /* glsl */ `
  uniform float uPulse;

  vec3 animateTarget(vec4 t, vec4 c, float form, float time) {
    vec3 p = t.xyz;
    if (form < 0.5) {
      // flower: petals breathe from the centre out
      p.z += sin(time * 1.1 - t.w * 4.0) * 0.035 * t.w;
    } else if (form < 1.5) {
      // medusa: the bell contracts, tentacles and arms undulate
      if (t.w < 0.5) {
        float u = t.w * 2.0;
        p.xz *= 1.0 - uPulse * 0.16 * u;
        p.y += uPulse * 0.1 * (1.0 - u);
      } else if (t.w < 3.0) {
        float along = fract(t.w);
        float phase = atan(t.z, t.x);
        p.x += sin(along * 5.0 - time * 0.9 + phase * 3.0) * 0.09 * along;
        p.z += cos(along * 4.0 - time * 0.7 + phase * 2.0) * 0.09 * along;
        p.xz *= 1.0 - uPulse * 0.12 * (1.0 - along);
        p.y += uPulse * 0.08 * (1.0 - along);
      }
    } else if (form < 2.5) {
      // text: a slow swell through the letters
      p.z += sin(time * 1.3 + t.x * 1.7) * 0.04;
      p.y += sin(time * 0.9 + t.x * 0.8) * 0.025;
    } else if (form > 5.5) {
      // falling leaves / snow: each piece falls, sways and tumbles on its own.
      // c holds the piece's centre and, in w, its kind (+2 = snow) and seed.
      float kind = step(1.5, c.w);
      float seed = fract(c.w);
      float speed = mix(0.3 + seed * 0.32, 0.13 + seed * 0.14, kind);
      float sway = mix(0.75 + seed * 0.55, 0.25 + seed * 0.2, kind);
      vec3 centre = c.xyz;
      centre.y = mod(centre.y - time * speed + 7.0, 14.0) - 7.0;
      centre.x += sin(time * (0.35 + seed * 0.45) + seed * 20.0) * sway;
      centre.z += cos(time * (0.27 + seed * 0.3) + seed * 11.0) * sway * 0.5;
      vec3 local = t.xyz - c.xyz;
      float angle = time * mix(0.55 + seed * 1.3, 0.2 + seed * 0.45, kind) + seed * 6.2832;
      vec3 axis = normalize(vec3(sin(seed * 17.0), cos(seed * 23.0) * 0.6, sin(seed * 5.0 + 1.0)));
      // Rodrigues' rotation of the piece about its own axis
      local = local * cos(angle) + cross(axis, local) * sin(angle) + axis * dot(axis, local) * (1.0 - cos(angle));
      p = centre + local;
    } else if (form > 4.5) {
      // fireworks: a slow drift
      p.y += sin(time * 0.8 + t.x * 0.7) * 0.03;
      p.z += cos(time * 0.6 + t.y * 1.3) * 0.04;
    } else {
      // vortex: an orbit that is faster near the centre
      float r = length(t.xz);
      float a = time * 0.32 / (0.35 + r * 0.6);
      float c2 = cos(a);
      float s2 = sin(a);
      p.xz = mat2(c2, -s2, s2, c2) * t.xz;
      p.y += sin(r * 2.0 - time) * 0.06;
    }
    return p;
  }
`;

export const positionShader = /* glsl */ `
  uniform float uDelta;
  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 position = texture2D(texturePosition, uv);
    vec3 velocity = texture2D(textureVelocity, uv).xyz;
    position.xyz += velocity * uDelta;
    gl_FragColor = position;
  }
`;

export const velocityShader = /* glsl */ `
  uniform float uTime;
  uniform float uDelta;
  uniform float uMorph;
  uniform float uFormA;
  uniform float uFormB;
  uniform sampler2D uTargetA;
  uniform sampler2D uTargetB;
  uniform sampler2D uCenterA;
  uniform sampler2D uCenterB;
  uniform float uSpring;
  uniform float uNoise;
  uniform float uFlight;
  uniform float uScatter;
  uniform float uDamping;
  uniform vec3 uPointer;
  uniform vec3 uPointerVelocity;
  uniform float uPointerRadius;
  uniform float uPointerStrength;
  ${curlNoise}
  ${localMorph}
  ${animateTarget}

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 position = texture2D(texturePosition, uv);
    vec3 velocity = texture2D(textureVelocity, uv).xyz;
    float seed = position.w;
    float m = localMorph(uMorph, seed);
    vec3 target = mix(
      animateTarget(texture2D(uTargetA, uv), texture2D(uCenterA, uv), uFormA, uTime),
      animateTarget(texture2D(uTargetB, uv), texture2D(uCenterB, uv), uFormB, uTime),
      m
    );

    // A falling piece that wraps from the bottom back to the top jumps there
    // instead of streaking across the screen.
    if (uFormA > 5.5 && uFormB > 5.5) {
      if (length(velocity) > 60.0) velocity = vec3(0.0);
      else if (distance(target, position.xyz) > 4.0) {
        gl_FragColor = vec4((target - position.xyz) / max(uDelta, 0.001), 1.0);
        return;
      }
    }

    // Mid-morph the spring loosens and the current takes over: particles fly.
    float flight = sin(m * 3.14159265);
    vec3 acceleration = (target - position.xyz) * uSpring * (1.0 - flight * 0.8);
    vec3 current = curlNoise(position.xyz * 0.32 + vec3(0.0, uTime * 0.06, seed * 0.2));
    acceleration += current * (uNoise + flight * uFlight + uScatter * 7.0 * (0.4 + seed));

    // The cursor stirs the water: a soft push plus a swirl, dragged along.
    vec3 away = position.xyz - uPointer;
    away.z *= 0.35;
    float falloff = exp(-dot(away, away) / (uPointerRadius * uPointerRadius));
    vec3 direction = normalize(away + vec3(1e-4));
    acceleration += (direction + cross(vec3(0.0, 0.0, 1.0), direction) * 1.4) * uPointerStrength * falloff;
    acceleration += uPointerVelocity * falloff * 2.4;

    velocity += acceleration * uDelta;
    velocity *= pow(uDamping, uDelta * 60.0);
    gl_FragColor = vec4(velocity, 1.0);
  }
`;

export const pointsVertexShader = /* glsl */ `
  uniform sampler2D texturePosition;
  uniform sampler2D textureVelocity;
  uniform sampler2D uColorA;
  uniform sampler2D uColorB;
  uniform float uFormA;
  uniform float uFormB;
  uniform float uMorph;
  uniform float uGlowA;
  uniform float uGlowB;
  uniform float uPointSize;
  uniform float uPixelRatio;
  uniform float uFocus;
  uniform float uAperture;
  uniform float uOpacity;
  uniform float uMaxPoint;
  uniform sampler2D uTargetA;
  uniform float uJelly;
  uniform float uTime;
  uniform float uIgnite;
  uniform float uIgniteMode;
  uniform float uPhase;
  uniform mat3 uOrient;
  uniform vec3 uOffset;
  uniform vec3 uDrift;
  uniform float uHighlight;
  uniform float uHighlightAmount;
  attribute vec2 aRef;
  attribute float aRand;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSoft;
  ${localMorph}

  // One swim stroke: a quick contraction, then a long, slow release.
  float contraction(float phase) {
    return phase < 0.3
      ? sin(phase / 0.3 * 1.5707963)
      : 0.5 + 0.5 * cos((phase - 0.3) / 0.7 * 3.1415927);
  }

  void main() {
    vec4 position = texture2D(texturePosition, aRef);
    vec3 velocity = texture2D(textureVelocity, aRef).xyz;
    float m = localMorph(uMorph, position.w);

    if (uJelly > 0.001) {
      vec3 original = position.xyz;
      float part = texture2D(uTargetA, aRef).w;
      float c = contraction(uPhase);
      if (part < 0.5) {
        // bell: the margin draws in and down, the crown lifts
        float u = part * 2.0;
        position.xz *= 1.0 - c * 0.16 * u * u;
        position.y += c * (0.08 * (1.0 - u) - 0.06 * u * u);
      } else if (part < 2.0) {
        // tentacles: the root moves exactly with the margin, the rest trails
        float t = fract(part);
        float lag = contraction(fract(uPhase - 0.06 - t * 0.3));
        float free = smoothstep(0.0, 0.35, t);
        position.xz *= 1.0 - mix(c * 0.16, lag * 0.1, free);
        position.y += mix(-0.06 * c, lag * 0.05 * (1.0 - t), free);
      } else if (part < 3.0) {
        // oral arms: the top rides the crown, the ends trail
        float t = fract(part);
        float lag = contraction(fract(uPhase - 0.1 - t * 0.3));
        float free = smoothstep(0.0, 0.3, t);
        position.xz *= 1.0 - lag * 0.08 * free;
        position.y += mix(0.08 * c, lag * 0.04, free);
      } else {
        position.xz *= 1.0 - c * 0.1;
        position.y += c * 0.07;
      }
      // The body tilts as it swims; strands leave the bell with it, then hang
      // back toward straight down and trail against the direction of travel.
      const vec3 pivot = vec3(0.0, 1.2, 0.0);
      vec3 local = position.xyz;
      vec3 turned = uOrient * (local - pivot) + pivot;
      if (part >= 1.0 && part < 3.0) {
        float t = fract(part);
        bool arm = part >= 2.0;
        vec3 root = arm ? vec3(local.x * 0.2, 0.62, local.z * 0.2) : vec3(local.x, 0.76, local.z);
        vec3 rootTurned = uOrient * (root - pivot) + pivot;
        vec3 hang = local - root;
        float settle = smoothstep(0.0, 1.0, t) * 0.85;
        turned = rootTurned + mix(uOrient * hang, hang, settle) - uDrift * t * t * 1.4;
      }
      position.xyz = mix(original, turned + uOffset, uJelly);
    }

    vec4 a = texture2D(uColorA, aRef);
    vec4 b = texture2D(uColorB, aRef);
    vec3 color = mix(a.rgb * uGlowA, b.rgb * uGlowB, m);
    // fireworks sparkle, each spark on its own rhythm
    if (uFormA > 4.5 && uFormA < 5.5) {
      float glow = 0.5 + 0.5 * sin(uTime * (0.7 + aRand * 1.6) + aRand * 60.0);
      color *= mix(1.0, 0.35 + 0.95 * smoothstep(0.35, 1.0, glow), 1.0 - m);
    }
    // A hovered service lights its own burst; the rest dims.
    if (uFormA > 4.5 && uHighlightAmount > 0.0) {
      float node = texture2D(uTargetA, aRef).w;
      float lit = step(abs(node - uHighlight), 0.4) * step(0.0, node);
      color *= 1.0 + lit * uHighlightAmount * 1.6;
      color = mix(color, color * 0.45, (1.0 - lit) * step(-0.5, node) * uHighlightAmount * 0.6);
    }
    float alpha = mix(a.a, b.a, m);

    // Fast particles burn hot: light trails during transitions and stirring.
    float speed = length(velocity);
    color = mix(color, vec3(0.75, 0.95, 1.0) * 1.6, smoothstep(1.2, 6.0, speed) * 0.7);
    color += vec3(1.0, 0.35, 0.7) * smoothstep(0.4, 2.5, speed) * 0.25;

    vec4 mvPosition = modelViewMatrix * vec4(position.xyz, 1.0);
    float distance = max(0.3, -mvPosition.z);
    // circle of confusion: points away from the focal plane become bokeh
    float coc = clamp(abs(distance - uFocus) * uAperture, 0.0, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float nearFade = smoothstep(0.9, 2.4, distance);
    float size = uPointSize * (0.55 + aRand * 0.9) * uPixelRatio * (6.0 / distance) * (1.0 + coc * 3.0);
    // Bokeh is capped: huge points cost fill rate.
    gl_PointSize = nearFade > 0.001 ? min(size, uMaxPoint * uPixelRatio) : 0.0;
    // Dense swarms stay opaque when alpha drops, so dimming also darkens.
    vColor = color * (0.3 + 0.7 * uOpacity);
    vAlpha = alpha * uOpacity * nearFade / (1.0 + coc * coc * 22.0);

    // The intro lights the creatures up with a travelling front.
    if (uIgnite < 0.999 && uIgniteMode > 0.5) {
      vec3 rest = texture2D(uTargetA, aRef).xyz;
      float lit;
      float band;
      if (uIgniteMode < 1.5) {
        // a ring of light from the rim, up the bell and down the tentacles
        float d = abs(rest.y - 0.76);
        float front = uIgnite * 3.9 - 0.15;
        lit = smoothstep(front, front - 0.3, d);
        band = exp(-pow((d - front) * 11.0, 2.0)) * step(0.001, uIgnite);
      } else {
        // a sweep around the ring
        float u = fract(atan(rest.z, rest.x) / 6.2831853);
        float front = uIgnite * 1.06;
        lit = smoothstep(front, front - 0.03, u);
        band = exp(-pow((u - front) * 28.0, 2.0)) * step(0.001, uIgnite);
      }
      float vis = max(lit, band);
      vAlpha *= mix(0.06, 1.0, vis);
      vColor *= mix(0.05, 1.0, vis);
      vColor = mix(vColor, vec3(0.7, 0.96, 1.0) * 1.9, band * 0.85);
    }
    vSoft = coc;
  }
`;

export const pointsFragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSoft;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    // crisp dots in focus, soft discs out of it
    float disc = mix(smoothstep(0.5, 0.32, d), smoothstep(0.5, 0.0, d), clamp(vSoft * 3.0, 0.0, 1.0));
    float alpha = disc * vAlpha;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(vColor, alpha);
  }
`;
