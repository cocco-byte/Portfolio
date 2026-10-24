import * as THREE from 'three';

// Point-cloud "forms" the swarms morph between. Each form is a size×size
// grid of targets: xyz is where a particle should be, w is per-form data the
// shaders read (which part of the jellyfish, which firework burst, ...).
// Falling forms also get a "center" texture: the centre of the piece a
// particle belongs to, so the whole piece can tumble as one.

const gaussian = () => {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const rgb = (hex) => {
  const c = new THREE.Color(hex).getHex();
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
};

const mixRgb = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function buffers(size) {
  const count = size * size;
  return { count, positions: new Float32Array(count * 4), colors: new Uint8Array(count * 4) };
}

function floatTexture(size, data) {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
  texture.needsUpdate = true;
  return texture;
}

function textures(size, positions, colors) {
  const color = new THREE.DataTexture(colors, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  color.colorSpace = THREE.SRGBColorSpace;
  color.needsUpdate = true;
  return { position: floatTexture(size, positions), color };
}

function writer(positions, colors) {
  return (i, x, y, z, w, color, alpha) => {
    positions[i] = x;
    positions[i + 1] = y;
    positions[i + 2] = z;
    positions[i + 3] = w;
    colors[i] = color[0];
    colors[i + 1] = color[1];
    colors[i + 2] = color[2];
    colors[i + 3] = alpha;
  };
}

function randomRotation() {
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2),
  );
  return new THREE.Matrix4().makeRotationFromQuaternion(q).elements;
}

const rotate = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z,
  m[1] * x + m[5] * y + m[9] * z,
  m[2] * x + m[6] * y + m[10] * z,
];

// The particles' first positions: a loose cloud above the scene.
export function initialCloud(size) {
  const count = size * size;
  const data = new Float32Array(count * 4);
  for (let p = 0; p < count; p += 1) {
    const i = p * 4;
    const r = 4 + Math.random() * 5;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    data[i] = r * Math.sin(phi) * Math.cos(theta) * 0.6;
    data[i + 1] = Math.abs(r * Math.cos(phi)) + 5;
    data[i + 2] = r * Math.sin(phi) * Math.sin(theta) * 0.6 - 2;
    data[i + 3] = Math.random(); // seed: delays this particle's morph
  }
  return data;
}

// Text drawn to a canvas and sampled: one particle per random lit pixel.
// The red channel tags each line so it can take its own colour.
export function textForm(size, lines, { width = 6.2, into = null } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lineHeight = canvas.height / (lines.length + 0.6);
  const palette = [];
  lines.forEach((line, index) => {
    let px = line.size ?? 300;
    ctx.font = line.font.replace('{size}', `${px}px`);
    const measured = ctx.measureText(line.text).width;
    const room = canvas.width * 0.94;
    if (measured > room) px *= room / measured;
    ctx.font = line.font.replace('{size}', `${px}px`);
    ctx.fillStyle = `rgb(${index + 1}, 0, 0)`;
    ctx.fillText(line.text, canvas.width / 2, lineHeight * (index + 0.8));
    palette.push(rgb(line.color));
  });

  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const lit = [];
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 140) lit.push(i / 4);

  const target = into ?? buffers(size);
  const { count, positions, colors } = target;
  const scale = width / canvas.width;
  for (let p = 0; p < count; p += 1) {
    const i = p * 4;
    const pixel = lit.length ? lit[(Math.random() * lit.length) | 0] : 0;
    const x = (pixel % canvas.width) + Math.random() - 0.5;
    const y = Math.floor(pixel / canvas.width) + Math.random() - 0.5;
    const line = Math.max(0, (pixels[pixel * 4] || 1) - 1);
    positions[i] = (x - canvas.width / 2) * scale;
    positions[i + 1] = -(y - canvas.height / 2) * scale + 0.1;
    positions[i + 2] = gaussian() * 0.03;
    positions[i + 3] = x / canvas.width;
    const c = palette[Math.min(line, palette.length - 1)] ?? [255, 255, 255];
    colors[i] = c[0];
    colors[i + 1] = c[1];
    colors[i + 2] = c[2];
    colors[i + 3] = 230;
  }
  if (into) return into;
  return { ...textures(size, positions, colors), positions, colors, count };
}

// A medusa: a bell, a fringe of tentacles, four ribbon-like oral arms and the
// organs glowing inside. w encodes the part: [0, .5) bell (by height),
// [1, 2) tentacles (by length), [2, 3) arms, 3 inner organs.
export function medusa(size) {
  const { count, positions, colors } = buffers(size);
  const put = writer(positions, colors);
  const pale = rgb('#cfe4ec');
  const white = rgb('#f3fbfd');
  const pink = rgb('#f1c3d2');
  const lilac = rgb('#e9dfe8');
  const blush = rgb('#efd6e1');

  const radius = 1.15;
  const rim = 1.72; // polar angle where the bell ends
  const height = 0.8;
  const top = 0.9;
  const tentacles = 36;
  const length = 3.3;
  const armLength = 2;
  const marginRadius = radius * Math.sin(rim);
  const marginY = radius * Math.cos(rim) * height + top;

  const bell = (u, angle, shrink = 1) => {
    const polar = u * rim;
    const lobes = 1 + 0.05 * Math.sin(angle * 8) * u * u;
    const r = radius * shrink * lobes;
    return [r * Math.sin(polar) * Math.cos(angle), r * Math.cos(polar) * height + top, r * Math.sin(polar) * Math.sin(angle)];
  };

  for (let p = 0; p < count; p += 1) {
    const i = p * 4;
    const roll = Math.random();
    if (roll < 0.47) {
      // the bell, with a fainter inner skin
      const u = Math.sqrt(Math.random());
      const angle = Math.random() * Math.PI * 2;
      const inner = Math.random() < 0.28;
      const [x, y, z] = bell(u, angle, inner ? 0.9 : 1 + gaussian() * 0.008);
      const edge = u ** 6;
      put(i, x, y, z, u * 0.499, mixRgb(pale, white, edge), inner ? 52 * 0.6 : 52 + edge * (255 - 52));
    } else if (roll < 0.81) {
      // tentacles hang from the margin and spread a little as they fall
      const strand = Math.floor(Math.random() * tentacles);
      const angle = (strand / tentacles) * Math.PI * 2 + Math.sin(strand * 12.9) * 0.05;
      const along = Math.random() ** 0.8;
      const [x, y, z] = bell(0.985, angle);
      const reach = length * (0.8 + Math.abs(Math.sin(strand * 7.3)) * 0.4);
      const spread = 0.12 * Math.sin(Math.min(1, along * 2) * Math.PI * 0.5);
      put(
        i,
        x * (1 + spread) + gaussian() * 0.006,
        y - along * reach,
        z * (1 + spread) + gaussian() * 0.006,
        1 + along * 0.999,
        mixRgb(lilac, pale, along),
        120 - along * 100,
      );
    } else if (roll < 0.9) {
      // four frilled oral arms, twisting as they descend
      const arm = Math.floor(Math.random() * 4);
      const angle = (arm / 4) * Math.PI * 2 + 0.4;
      const along = Math.random();
      const across = Math.random() - 0.5;
      const widthAt = 0.13 * (1 - along * 0.55);
      const bend = Math.sin(along * 3.2 + arm) * 0.12 * along;
      const frill = Math.sin(along * 22 + across * 5 + arm * 2) * 0.035 * (0.4 + along);
      const out = 0.07 + along * 0.13 + bend;
      const sideX = Math.cos(angle + Math.PI / 2);
      const sideZ = Math.sin(angle + Math.PI / 2);
      put(
        i,
        Math.cos(angle) * out + sideX * (across * widthAt + frill),
        top - 0.28 - along * armLength + Math.abs(across) * 0.04 * (1 - along),
        Math.sin(angle) * out + sideZ * (across * widthAt + frill),
        2 + along * 0.999,
        mixRgb(blush, pale, along),
        Math.round(95 * (1 - along * 0.6)),
      );
    } else {
      const organ = Math.random();
      if (organ < 0.4) {
        // the stalk under the crown
        const t = Math.random();
        const angle = Math.random() * Math.PI * 2;
        const r = (0.08 + t * 0.07) * (1 + 0.25 * Math.sin(angle * 4 + t * 9));
        put(i, Math.cos(angle) * r, 1.608 - t * (1.608 - 0.62), Math.sin(angle) * r, 2 + t * 0.04, mixRgb(blush, pale, 0.3), 110);
      } else if (organ < 0.75) {
        // a bright ring along the margin
        const angle = Math.random() * Math.PI * 2;
        const r = marginRadius * (1 + 0.05 * Math.sin(angle * 8)) * (0.97 + Math.random() * 0.04);
        put(i, Math.cos(angle) * r, marginY + gaussian() * 0.015, Math.sin(angle) * r, 0.495, white, 175);
      } else {
        // four pink gonads, the clover seen through the bell
        const angle = (Math.floor(Math.random() * 4) / 4) * Math.PI * 2 + (Math.random() - 0.5) * 1.1;
        const r = 0.3 + gaussian() * 0.02;
        put(i, Math.cos(angle) * r, 1.36 + gaussian() * 0.03, Math.sin(angle) * r, 3, pink, 150);
      }
    }
  }
  return textures(size, positions, colors);
}

// The prologue's ring: four seasons' colours around one loop, with a softer
// halo inside it.
export function seasonsRing(size) {
  const { count, positions, colors } = buffers(size);
  const put = writer(positions, colors);
  const base = [rgb('#ffd7e4'), rgb('#e6f6b4'), rgb('#f5a07e'), rgb('#e4f5ff')];
  const accent = [rgb('#fff7fa'), rgb('#fbffe2'), rgb('#ffd8a8'), rgb('#ffffff')];
  const seasonAt = (angle) => {
    const t = ((((angle / (Math.PI * 2)) % 1) + 1) % 1) * 4;
    const s = Math.floor(t);
    const f = t - s;
    const blend = f < 0.7 ? 0 : (f - 0.7) / 0.3;
    return { base: mixRgb(base[s], base[(s + 1) % 4], blend * blend * (3 - 2 * blend)), accent: accent[s] };
  };
  for (let p = 0; p < count; p += 1) {
    const i = p * 4;
    const angle = Math.random() * Math.PI * 2;
    const { base: color, accent: spark } = seasonAt(angle);
    if (Math.random() < 0.8) {
      const r = 1 + gaussian() * 0.022;
      put(i, Math.cos(angle) * r, gaussian() * 0.018, Math.sin(angle) * r, r, Math.random() < 0.15 ? spark : color, 190);
    } else {
      const r = 0.55 + Math.random() * 0.9;
      put(i, Math.cos(angle) * r, gaussian() * 0.16, Math.sin(angle) * r, r, color, 80);
    }
  }
  return textures(size, positions, colors);
}

// Summer: a chrysanthemum firework. Stars on a Fibonacci sphere, each a short
// trail drooping under gravity; w is the burst's sector (0-7), which lets a
// hovered service light up its own slice.
export function hanabi(size) {
  const { count, positions, colors } = buffers(size);
  const put = writer(positions, colors);
  const radius = 1.55;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const white = rgb('#f4ffd2');
  const lime = rgb('#d8f27a');
  const gold = rgb('#f2c965');
  const amber = rgb('#e8a24c');
  const sectorOf = (angle) => Math.floor((((angle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)) * 8) % 8;
  for (let p = 0; p < count; p += 1) {
    const i = p * 4;
    const roll = Math.random();
    if (roll < 0.88) {
      const star = Math.floor(Math.random() * 140);
      const y = 1 - (2 * (star + 0.5)) / 140;
      const ring = Math.sqrt(1 - y * y);
      const theta = star * golden;
      const x = Math.cos(theta) * ring;
      const z = Math.sin(theta) * ring;
      const t = Math.random() ** 0.5;
      const r = radius * t;
      const tip = t > 0.95;
      const color = t < 0.45 ? mixRgb(white, lime, t / 0.45) : mixRgb(lime, star % 3 === 0 ? amber : gold, (t - 0.45) / 0.55);
      put(
        i,
        x * r + gaussian() * 0.006 * (1 + t),
        y * r - t * t * 0.32 + gaussian() * 0.006,
        z * r + gaussian() * 0.006 * (1 + t),
        sectorOf(Math.atan2(y, x)),
        tip ? white : color,
        tip ? 255 : 70 + t * 150,
      );
    } else if (roll < 0.94) {
      // the hot core
      const r = Math.random() ** 2.2 * 0.2;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      put(i, Math.sin(phi) * Math.cos(theta) * r, Math.cos(phi) * r, Math.sin(phi) * Math.sin(theta) * r, sectorOf(theta), white, 230);
    } else {
      // smoke and embers drifting down
      put(i, gaussian() * radius * 0.55, -0.2 - Math.random() * radius * 1.3, gaussian() * 0.35, -1, lime, 45);
    }
  }
  return textures(size, positions, colors);
}

// Pieces for the falling forms, scattered through a 22×14 volume. A few are
// near and large, most are small and far.
function pieces(n, nearShare) {
  return Array.from({ length: n }, () => {
    const near = Math.random() < nearShare;
    return {
      centre: [(Math.random() - 0.5) * 22, (Math.random() - 0.5) * 14, near ? 0.5 + Math.random() * 2.5 : -10 + Math.random() * 10],
      scale: near ? 0.32 + Math.random() * 0.14 : 0.13 + Math.random() * 0.17,
      rotation: randomRotation(),
      tone: Math.random(),
      seed: Math.random(),
    };
  });
}

function fallTextures(size, positions, colors, centres) {
  return { ...textures(size, positions, colors), center: floatTexture(size, centres) };
}

// Maple leaf: seven pointed lobes fanning from the base.
const LOBES = [
  { angle: 0, length: 1, width: 0.16 },
  { angle: 40, length: 0.95, width: 0.155 },
  { angle: -40, length: 0.95, width: 0.155 },
  { angle: 80, length: 0.78, width: 0.135 },
  { angle: -80, length: 0.78, width: 0.135 },
  { angle: 120, length: 0.46, width: 0.095 },
  { angle: -120, length: 0.46, width: 0.095 },
].map((lobe) => {
  const a = (lobe.angle * Math.PI) / 180;
  return { ...lobe, dx: Math.sin(a), dy: Math.cos(a) };
});

function lobeHalfWidth(lobe, along) {
  const u = along / lobe.length;
  if (u <= 0 || u >= 1) return -1;
  const body = Math.sin(Math.PI * u ** 0.8) ** 1.3 * (1 - u) ** 0.14;
  const serration = 1 + (0.08 * Math.abs(Math.sin(u * 44)) + 0.04 * Math.abs(Math.sin(u * 93))) * Math.min(1, u * 2.2);
  return lobe.width * body * serration;
}

function insideLeaf(x, y) {
  if (Math.hypot(x, y - 0.04) < 0.16) return true;
  for (const lobe of LOBES) {
    const along = x * lobe.dx + y * lobe.dy;
    if (Math.abs(x * lobe.dy - y * lobe.dx) < lobeHalfWidth(lobe, along)) return true;
  }
  return false;
}

export function mapleFall(size, n = 110) {
  const { count, positions, colors } = buffers(size);
  const centres = new Float32Array(count * 4);
  const put = writer(positions, colors);
  const leaves = pieces(n, 0.1);
  const yellow = rgb('#f0a93c');
  const red = rgb('#e0492a');
  const crimson = rgb('#b3172f');
  const vein = rgb('#8e1b24');
  for (let p = 0; p < count; p += 1) {
    const i = p * 4;
    const leaf = leaves[p % n];
    let x = 0;
    let y = 0;
    let isVein = false;
    if (Math.random() < 0.9) {
      for (let tries = 0; tries < 40; tries += 1) {
        x = Math.random() * 2 - 1;
        y = Math.random() * 1.45 - 0.45;
        if (insideLeaf(x, y)) break;
      }
    } else {
      const lobe = LOBES[Math.floor(Math.random() * LOBES.length)];
      const along = Math.random() * lobe.length * 0.95;
      x = lobe.dx * along;
      y = lobe.dy * along;
      isVein = true;
    }
    const t = Math.min(1, Math.hypot(x, y) * 0.8 + leaf.tone * 0.7);
    const color = isVein ? vein : t < 0.45 ? mixRgb(yellow, red, t / 0.45) : mixRgb(red, crimson, (t - 0.45) / 0.55);
    const s = leaf.scale * 1.75;
    // a gentle cup so the leaf isn't perfectly flat
    const [lx, ly, lz] = rotate(leaf.rotation, x * s, y * s, x * x * 0.1 * s);
    const [cx, cy, cz] = leaf.centre;
    put(i, cx + lx, cy + ly, cz + lz, leaf.seed, color, isVein ? 210 : 235);
    centres.set([cx, cy, cz, leaf.seed], i);
  }
  return fallTextures(size, positions, colors, centres);
}

// One point of a six-armed snow crystal: spokes, side branches, a hexagon.
function crystalPoint() {
  const arm = (Math.floor(Math.random() * 6) / 6) * Math.PI * 2 + Math.PI / 2;
  const roll = Math.random();
  if (roll < 0.38) {
    const t = Math.random();
    return [Math.cos(arm) * t + gaussian() * 0.012, Math.sin(arm) * t + gaussian() * 0.012];
  }
  if (roll < 0.88) {
    const at = [0.3, 0.46, 0.62, 0.78][Math.floor(Math.random() * 4)];
    const reach = (1 - at) * 0.6;
    const branch = arm + ((Math.random() < 0.5 ? 1 : -1) * Math.PI) / 3;
    const t = Math.random();
    return [Math.cos(arm) * at + Math.cos(branch) * t * reach, Math.sin(arm) * at + Math.sin(branch) * t * reach];
  }
  const a = Math.random() * Math.PI * 2;
  const r = 0.2 / Math.cos((a % (Math.PI / 3)) - Math.PI / 6);
  return [Math.cos(a) * r, Math.sin(a) * r];
}

export function snowFall(size, n = 150) {
  const { count, positions, colors } = buffers(size);
  const centres = new Float32Array(count * 4);
  const put = writer(positions, colors);
  const flakes = pieces(n, 0.08).map((flake) => ({ ...flake, scale: flake.scale * 0.8 }));
  const white = rgb('#f6fcff');
  const ice = rgb('#a9e8ff');
  for (let p = 0; p < count; p += 1) {
    const i = p * 4;
    const flake = flakes[p % n];
    const [x, y] = crystalPoint();
    const [lx, ly, lz] = rotate(flake.rotation, x * flake.scale, y * flake.scale, 0);
    const [cx, cy, cz] = flake.centre;
    // +2 in w marks snow: it falls slower and sways less than leaves
    put(i, cx + lx, cy + ly, cz + lz, 2 + flake.seed, mixRgb(white, ice, Math.min(1, Math.hypot(x, y))), 235);
    centres.set([cx, cy, cz, 2 + flake.seed], i);
  }
  return fallTextures(size, positions, colors, centres);
}

// Spring: cherry blossoms (five notched petals) and loose petals.
export function sakuraFall(size, n = 120) {
  const { count, positions, colors } = buffers(size);
  const centres = new Float32Array(count * 4);
  const put = writer(positions, colors);
  const pieces_ = pieces(n, 0.1).map((piece, index) => ({
    ...piece,
    blossom: index % 3 === 0,
    scale: piece.scale * (index % 3 === 0 ? 0.9 : 0.55),
  }));
  const deep = rgb('#e0508a');
  const pink = rgb('#ffb3cb');
  const pale = rgb('#fff2f6');
  const petalPoint = () => {
    for (let tries = 0; tries < 30; tries += 1) {
      const v = Math.random();
      const u = Math.random() * 2 - 1;
      const halfWidth = 0.36 * Math.sin(Math.PI * v ** 0.7) ** 0.8;
      const notch = v > 0.86 && Math.abs(u) < ((0.18 * (v - 0.86)) / 0.14) * 1.2;
      if (Math.abs(u * 0.36) < halfWidth && !notch) return [u * 0.36, v];
    }
    return [0, 0.5];
  };
  for (let p = 0; p < count; p += 1) {
    const i = p * 4;
    const piece = pieces_[p % n];
    let x;
    let y;
    let t;
    if (piece.blossom) {
      const petal = Math.floor(Math.random() * 5);
      const [px, py] = petalPoint();
      const a = (petal / 5) * Math.PI * 2;
      x = px * Math.cos(a) - py * Math.sin(a);
      y = px * Math.sin(a) + py * Math.cos(a);
      t = py;
    } else {
      [x, y] = petalPoint();
      y -= 0.5;
      t = y + 0.5;
    }
    const color = t < 0.25 ? mixRgb(deep, pink, t / 0.25) : mixRgb(pink, pale, Math.min(1, (t - 0.25) / 0.75));
    const s = piece.scale;
    const [lx, ly, lz] = rotate(piece.rotation, x * s, y * s, x * x * 0.4 * s);
    const [cx, cy, cz] = piece.centre;
    put(i, cx + lx, cy + ly, cz + lz, piece.seed, color, 235);
    centres.set([cx, cy, cz, piece.seed * 0.6], i);
  }
  return fallTextures(size, positions, colors, centres);
}
