import * as THREE from 'three';

// Works hang as curved glass screens on a ring around the jellyfish. The
// camera visits each in turn; the one in focus is sharp and in full colour,
// the others are soft, desaturated and fainter.

const ANGLES = [-22, 56, -62, 12, 66, -44, 34, -8];
const HEIGHTS = [1.7, -1.3, 0.5, 2.3, -2.2, -0.3, 1.2, -2.6];
const RING = 3.9;
const WIDTH = 2.4;
const ASPECT = 424 / 960;
const HEIGHT = ASPECT * WIDTH;

export function layoutPanels(n) {
  return Array.from({ length: n }, (_, i) => {
    const angle = THREE.MathUtils.degToRad(ANGLES[i % ANGLES.length]);
    const y = HEIGHTS[i % HEIGHTS.length];
    const position = new THREE.Vector3(Math.sin(angle) * RING, y, Math.cos(angle) * RING);
    const normal = new THREE.Vector3(Math.sin(angle), -y * 0.08, Math.cos(angle)).normalize();
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().lookAt(position.clone().add(normal), position, new THREE.Vector3(0, 1, 0)),
    );
    return {
      position,
      normal,
      tangent: new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), normal).normalize(),
      quaternion,
      tilt: (i % 2 ? 1 : -1) * 0.05,
    };
  });
}

// Where the camera stands to look at a panel: off to one side so the text
// column on the left stays clear (or straight on, from below, when narrow).
export function cameraFor(panel, narrow) {
  const target = panel.position.clone();
  if (narrow) {
    target.y -= 0.95;
    const eye = target.clone().add(panel.normal.clone().multiplyScalar(4.2));
    return { x: eye.x, y: eye.y, z: eye.z, tx: target.x, ty: target.y, tz: target.z };
  }
  target.addScaledVector(panel.tangent, -0.85);
  target.y -= 0.32;
  const eye = target.clone().add(panel.normal.clone().multiplyScalar(3.4));
  return { x: eye.x, y: eye.y, z: eye.z, tx: target.x, ty: target.y, tz: target.z };
}

const vertexShader = /* glsl */ `
  uniform float uBend;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  void main() {
    vUv = uv;
    vec3 p = position;
    // a slight curve, deepening while travelling
    p.z -= p.x * p.x * 0.06 + uBend * sin(uv.x * 3.14159) * 0.06;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewW = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uOpacity;
  uniform float uActive;
  uniform float uSplit;
  uniform float uBlur;
  uniform vec2 uSize;
  uniform vec3 uAccent;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewW;

  float roundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  void main() {
    vec2 px = (vUv - 0.5) * uSize;
    float d = roundedBox(px, uSize * 0.5, 10.0);
    float mask = 1.0 - smoothstep(-1.2, 0.8, d);
    if (mask < 0.01) discard;
    vec2 shift = vec2(uSplit * 0.006, 0.0);
    vec3 color = vec3(texture2D(uMap, vUv + shift).r, texture2D(uMap, vUv).g, texture2D(uMap, vUv - shift).b);
    // depth of field: works out of focus are soft (a ring of taps)
    if (uBlur > 0.01) {
      vec3 soft = color;
      float r = uBlur * 0.022;
      for (int i = 0; i < 12; i++) {
        float a = float(i) * 0.5235988;
        vec2 o = vec2(cos(a), sin(a) * (uSize.x / uSize.y)) * r;
        soft += texture2D(uMap, vUv + o).rgb + texture2D(uMap, vUv + o * 0.5).rgb;
      }
      color = mix(color, soft / 25.0, smoothstep(0.0, 0.35, uBlur));
    }
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    vec3 resting = mix(vec3(luma), color, 0.3) * vec3(0.72, 0.78, 0.86) * 0.5;
    color = mix(resting, color * 0.94, uActive);
    // glass edge: a hairline that catches the season's light
    float edge = 1.0 - smoothstep(0.0, 2.2, abs(d + 1.0));
    color += uAccent * edge * (0.25 + uActive * 0.45);
    float facing = clamp(dot(normalize(vNormalW), normalize(vViewW)), 0.0, 1.0);
    gl_FragColor = vec4(color, mask * uOpacity * mix(mix(0.45, 1.0, facing), 1.0, uActive));
  }
`;

export class WorkPanels {
  constructor(scene, layout) {
    this.group = new THREE.Group();
    const geometry = new THREE.PlaneGeometry(WIDTH, HEIGHT, 24, 1);
    const blank = new THREE.DataTexture(new Uint8Array([10, 14, 20, 255]), 1, 1);
    blank.needsUpdate = true;
    this.panels = layout.map((place) => {
      const uniforms = {
        uMap: { value: blank },
        uOpacity: { value: 0 },
        uActive: { value: 0 },
        uSplit: { value: 0 },
        uBlur: { value: 0 },
        uBend: { value: 0 },
        uSize: { value: new THREE.Vector2(960, 424) },
        uAccent: { value: new THREE.Color('#ff8f6b') },
      };
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.ShaderMaterial({
          vertexShader,
          fragmentShader,
          uniforms,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      mesh.position.copy(place.position);
      mesh.quaternion.copy(place.quaternion);
      mesh.rotateZ(place.tilt);
      mesh.renderOrder = 4;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      return { mesh, uniforms };
    });
    scene.add(this.group);
  }

  // weight: how present the works sector is; focus: fractional index of the
  // work being looked at; speed: how fast we're travelling between them.
  update({ weight, focus, speed, textures, accent }) {
    this.group.visible = weight > 0.005;
    if (!this.group.visible) return;
    this.panels.forEach((panel, i) => {
      const active = THREE.MathUtils.smoothstep(1 - Math.abs(focus - i) * 1.7, 0, 1);
      const u = panel.uniforms;
      u.uOpacity.value = weight * (0.38 + active * 0.62);
      u.uActive.value = active;
      u.uSplit.value = speed;
      u.uBlur.value = Math.min(1, Math.abs(focus - i)) * (0.6 + speed * 0.4);
      u.uBend.value = speed;
      if (textures[i]) u.uMap.value = textures[i];
      if (accent) u.uAccent.value.copy(accent);
    });
  }
}
