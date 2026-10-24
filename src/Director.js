import * as THREE from 'three';
import gsap from 'gsap';
import { Observer } from 'gsap/Observer';
import { layoutPanels, cameraFor } from './gl/WorkPanels.js';
import { Reveal } from './ui/Reveal.js';
import { site, services, works } from './content.js';

gsap.registerPlugin(Observer);

// Each season tints the water, picks what drifts through it and sets the
// accent colour of the whole page.
const SEASONS = {
  prologue: {
    water: 0.14,
    tint: '#e6f6fb',
    drift: { petal: 0, leaf: 0, firefly: 0, fall: 0.07, sway: 0.2, opacity: 0.55, a: '#ffffff', b: '#bfeeff' },
    bloom: 0.32,
    threshold: 0.78,
    accent: '#9fdcea',
    school: 7,
  },
  spring: {
    water: 0.03,
    tint: '#fff1f7',
    drift: { petal: 1, leaf: 0, firefly: 0, fall: 0.28, sway: 0.4, opacity: 0.9, a: '#ffe3ec', b: '#ff9dbf' },
    bloom: 0.3,
    threshold: 0.78,
    accent: '#ff9dbf',
    school: 4,
  },
  summer: {
    water: 0.32,
    tint: '#dfe6ff',
    drift: { petal: 0, leaf: 0, firefly: 1, fall: -0.06, sway: 0.6, opacity: 0.95, a: '#dcff86', b: '#f6ffb8' },
    bloom: 0.34,
    threshold: 0.74,
    accent: '#ffb86b',
    school: 5,
  },
  autumn: {
    water: 0.62,
    tint: '#ffe0c6',
    drift: { petal: 0, leaf: 1, firefly: 0, fall: 0.24, sway: 0.75, opacity: 0.95, a: '#d9402a', b: '#f2a33a' },
    bloom: 0.26,
    threshold: 0.82,
    accent: '#ff8f6b',
    school: 3,
  },
  winter: {
    water: 1,
    tint: '#dbeeff',
    drift: { petal: 0, leaf: 0, firefly: 0, fall: 0.12, sway: 0.15, opacity: 1, a: '#ffffff', b: '#c4f0ff' },
    bloom: 0.38,
    threshold: 0.7,
    accent: '#9fe6ff',
    school: 2,
  },
};
const HUD_SEASONS = ['spring', 'summer', 'autumn', 'winter'];

const REST = { x: 0, y: 0, z: 0, s: 1, rx: 0, ry: 0, rz: 0 };
const PANELS = layoutPanels(works.length);

// The dive, stop by stop. Each station places the camera, both swarms and
// the season; scrolling flies between them along a smooth path. `clear` is
// the screen box (NDC) the background school stays out of, behind the text.
const STATIONS = [
  {
    id: 'hero',
    panel: 'hero',
    season: 'prologue',
    depth: 10,
    flower: 'seasonsRing',
    swing: 1,
    clear: [-1, -1, 0.15, -0.1],
    cam: { x: 0, y: -1.4, z: 7.6, tx: 0, ty: 3.6, tz: -4 },
    flowerAt: { x: 0, y: 7.9, z: -8, s: 4.9, rx: 0.08, ry: 0, rz: 0.04 },
    jellyAt: { x: 0, y: 1.3, z: -8, s: 7.6 },
    narrow: {
      cam: { x: 0, y: -1.6, z: 7.4, tx: 0, ty: 3.4, tz: -4 },
      flowerAt: { x: 0, y: 7.2, z: -8, s: 4.2, rx: 0.08, ry: 0, rz: 0.04 },
      jellyAt: { x: 0, y: 1.1, z: -8, s: 6.6 },
    },
  },
  {
    id: 'about',
    panel: 'about',
    season: 'spring',
    depth: 60,
    flower: 'sakuraFall',
    swing: -1,
    clear: [-1, -1, 0.35, 0.3],
    cam: { x: 0.8, y: 0.3, z: 6.4, tx: 0.6, ty: 0, tz: 0 },
    flowerAt: REST,
    jellyAt: { x: 2.1, y: -0.4, z: -1.6, s: 1.6 },
    narrow: { cam: { x: 0, tx: 0, ty: -0.8 }, jellyAt: { x: 0.2, y: 1.3, z: -2.8, s: 0.85 } },
  },
  {
    id: 'services',
    panel: 'services',
    season: 'summer',
    depth: 200,
    flower: 'hanabi',
    swing: 1,
    clear: [-1, -1, 0.12, 0.75],
    cam: { x: 0, y: 0, z: 7.2, tx: 0, ty: 0, tz: 0 },
    flowerAt: { x: 2.7, y: 0.55, z: -0.6, s: 2.05, rx: 0.1, ry: -0.25, rz: 0 },
    jellyAt: { x: 5.4, y: 3.1, z: -7.5, s: 1.1 },
    narrow: { flowerAt: { x: 0.5, y: 3.9, z: -1.6, s: 1.05 }, jellyAt: { x: 1.8, y: 5.6, z: -9, s: 1 } },
  },
  {
    id: 'autumn',
    panel: 'autumn',
    season: 'autumn',
    depth: 800,
    flower: 'mapleFall',
    swing: -1,
    clear: [-1, -1, 0.15, -0.35],
    cam: { x: 0.6, y: 1.4, z: 10.8, tx: 0, ty: 0.1, tz: 0 },
    flowerAt: REST,
    jellyAt: { x: 0.9, y: -3, z: -1.2, s: 1.1 },
    narrow: { cam: { x: 0, y: 1.4, z: 9, tx: 0, ty: -0.9, tz: 0 }, jellyAt: { x: 0.6, y: -3.6, z: -2, s: 0.9 } },
  },
  ...works.map((_, index) => ({
    id: 'works',
    work: index,
    panel: 'works',
    season: 'autumn',
    depth: 1000 + index * 120,
    flower: 'mapleFall',
    swing: index % 2 ? 1 : -1,
    parallax: 0.55,
    flowerOpacity: 0.75,
    clear: [-1, -1, 0.3, -0.15],
    cam: cameraFor(PANELS[index], false),
    flowerAt: REST,
    jellyAt: { x: 0.9, y: -3.2, z: -3, s: 1 },
    narrow: { cam: cameraFor(PANELS[index], true), jellyAt: { x: 0.6, y: -3.8, z: -3, s: 0.85 } },
  })),
  {
    id: 'contact',
    panel: 'contact',
    season: 'winter',
    depth: 4000,
    flower: 'snowFall',
    swing: 1,
    clear: [-1, -1, 0.15, 0.6],
    cam: { x: 0, y: 0, z: 7, tx: 0, ty: 0, tz: 0 },
    flowerAt: REST,
    jellyAt: { x: 2.5, y: 0.3, z: 0.4, s: 0.75 },
    narrow: { cam: { ty: -0.6 }, jellyAt: { x: -1.3, y: 2.3, z: 0, s: 0.55 } },
  },
  {
    id: 'finale',
    panel: 'finale',
    season: 'spring',
    depth: 0,
    flower: 'wordmark',
    swing: -1,
    clear: [-0.9, -0.35, 0.9, 0.35],
    cam: { x: 0, y: 0, z: 7, tx: 0, ty: -0.1, tz: 0 },
    flowerAt: REST,
    jellyAt: { x: 3.4, y: 3.2, z: -6.5, s: 1.2 },
    narrow: { jellyAt: { x: 0.8, y: 4.4, z: -7, s: 1 } },
  },
];

const ANNOUNCE = { hero: 'Top', about: 'About', services: 'Services', autumn: 'Works', contact: 'Contact', finale: 'Footer' };

const { clamp, lerp } = THREE.MathUtils;
const pad = (n) => String(n).padStart(2, '0');
// Hold still near each station, move in the middle.
const settle = (t) => THREE.MathUtils.smootherstep(clamp((t - 0.1) / 0.8, 0, 1), 0, 1);
const hostOf = (href) => new URL(href).hostname.replace(/^www\./, '');

// A titled card for works without a video or poster.
function workCard(work, index) {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 424;
  const ctx = canvas.getContext('2d');
  const hue = new THREE.Color(work.hue ?? '#9fdcea');
  const gradient = ctx.createLinearGradient(0, 0, 960, 424);
  gradient.addColorStop(0, `#${hue.clone().multiplyScalar(0.35).getHexString()}`);
  gradient.addColorStop(1, '#05080d');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 960, 424);
  ctx.strokeStyle = 'rgba(239, 234, 228, 0.12)';
  for (let x = 0; x < 960; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 424);
    ctx.stroke();
  }
  ctx.fillStyle = `#${hue.getHexString()}`;
  ctx.font = '400 92px "Instrument Serif", serif';
  ctx.fillText(work.name, 56, 250);
  ctx.fillStyle = 'rgba(239, 234, 228, 0.7)';
  ctx.font = '500 22px "Zen Kaku Gothic New", sans-serif';
  ctx.fillText(`${pad(index + 1)}  —  ${work.year}  ·  ${work.role}`, 60, 316);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Turns scroll, keys and nav clicks into a position along the stations and
// applies it to the world and the page every frame.
export class Director {
  constructor({ world, redaction, reducedMotion = false }) {
    this.world = world;
    this.flower = world.flower;
    this.jelly = world.jelly;
    this.redaction = redaction;
    this.reducedMotion = reducedMotion;
    this.count = STATIONS.length;
    this.target = 0; // where input wants us
    this.current = 0; // where we are, eased toward target
    this.rest = 0; // the station we will settle on
    this.lastInput = 0;
    this.lockUntil = 0;
    this.intro = { k: 1, reveal: 0, light: 0, ignite: 0, ring: 0 };
    this.busy = true;
    this.media = new Map();
    this.workShown = -1;
    this.textureLoader = new THREE.TextureLoader();
    this.panels = Array.from(document.querySelectorAll('[data-panel]'));
    this.panelById = Object.fromEntries(this.panels.map((panel) => [panel.dataset.panel, panel]));
    this.hud = {
      root: document.querySelector('[data-hud]'),
      seasons: Array.from(document.querySelectorAll('[data-hud-season]')),
      depth: document.querySelector('[data-hud-depth]'),
    };
    this.navLinks = Array.from(document.querySelectorAll('[data-go]'));
    this.colors = Object.fromEntries(
      Object.entries(SEASONS).map(([name, season]) => [
        name,
        {
          tint: new THREE.Color(season.tint),
          a: new THREE.Color(season.drift.a),
          b: new THREE.Color(season.drift.b),
          accent: new THREE.Color(season.accent),
        },
      ]),
    );
    this.accent = new THREE.Color();
    this.reveal = new Reveal({ reducedMotion });
    this.tick = this.tick.bind(this);
  }

  init() {
    this.jelly.sim.uSpring.value = 18;
    this.jelly.sim.uNoise.value = 0.05;
    this.buildServices();
    this.buildWorks();
    this.generateForms();
    this.buildPath();
    this.bindInput();
    this.apply(0);
    gsap.ticker.add(this.tick);
    let timer = 0;
    window.addEventListener('resize', () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        this.world.resize();
        this.generateForms();
        this.buildPath();
      }, 180);
    });
  }

  // Hovering a service lights its own slice of the firework.
  buildServices() {
    const list = document.querySelector('[data-services]');
    if (!list) return;
    const u = this.flower.render;
    list.replaceChildren(
      ...services.map((service, index) => {
        const item = document.createElement('li');
        item.className = 'service';
        item.tabIndex = 0;
        item.innerHTML = '<span class="service__no"></span><span class="service__title"></span><span class="service__tags"></span>';
        item.querySelector('.service__no').textContent = pad(index + 1);
        item.querySelector('.service__title').textContent = service.title;
        item.querySelector('.service__tags').textContent = service.tags.join(' / ');
        const light = () => {
          u.uHighlight.value = index % 8;
          gsap.to(u.uHighlightAmount, { value: 1, duration: 0.4, ease: 'power2.out', overwrite: true });
        };
        const dim = () => gsap.to(u.uHighlightAmount, { value: 0, duration: 0.5, ease: 'power2.out', overwrite: true });
        item.addEventListener('pointerenter', light);
        item.addEventListener('pointerleave', dim);
        item.addEventListener('focus', light);
        item.addEventListener('blur', dim);
        return item;
      }),
    );
  }

  buildWorks() {
    const list = document.querySelector('[data-work-list]');
    if (list) {
      list.replaceChildren(
        ...works.map((work, index) => {
          const item = document.createElement('li');
          const button = document.createElement('button');
          button.type = 'button';
          button.innerHTML = '<span class="works__no"></span><span class="works__label"></span>';
          button.querySelector('.works__no').textContent = pad(index + 1);
          button.querySelector('.works__label').textContent = work.name;
          button.addEventListener('click', () => this.goTo(this.stationOf('works', index), { cut: true }));
          item.append(button);
          return item;
        }),
      );
      this.workButtons = Array.from(list.querySelectorAll('button'));
    }
    const total = document.querySelector('[data-work-total]');
    if (total) total.textContent = pad(works.length);

    // A plain list of everything, for screen readers and the no-WebGL page.
    const index = document.querySelector('[data-works-index]');
    if (index) {
      const heading = document.createElement('h3');
      heading.textContent = 'All works';
      const ol = document.createElement('ol');
      works.forEach((work) => {
        const li = document.createElement('li');
        const h4 = document.createElement('h4');
        const a = Object.assign(document.createElement('a'), { href: work.href, textContent: work.name });
        h4.append(a);
        const lines = [work.summary, `${work.year} / ${work.role}`, `Built with: ${work.stack.join(', ')}`];
        li.append(h4, ...lines.map((text) => Object.assign(document.createElement('p'), { textContent: text })));
        ol.append(li);
      });
      index.replaceChildren(heading, ol);
    }

    const lede = document.querySelector('[data-works-lede]');
    if (lede) lede.textContent = `Selected work: ${works.length} ${works.length === 1 ? 'project' : 'projects'}.`;

    this.work = {
      root: document.querySelector('[data-work-info]'),
      name: document.querySelector('[data-work-name]'),
      summary: document.querySelector('[data-work-summary]'),
      year: document.querySelector('[data-work-year]'),
      role: document.querySelector('[data-work-role]'),
      link: document.querySelector('[data-work-link]'),
      host: document.querySelector('[data-work-host]'),
      index: document.querySelector('[data-work-index]'),
      stack: document.querySelector('[data-work-stack]'),
      highlights: document.querySelector('[data-work-highlights]'),
    };
    this.announcer = document.querySelector('[data-announce]');
  }

  isNarrow() {
    return window.innerWidth / window.innerHeight < 0.9;
  }

  station(index) {
    const s = STATIONS[index];
    const narrow = this.isNarrow() ? (s.narrow ?? {}) : {};
    return {
      ...s,
      cam: { ...s.cam, ...(narrow.cam ?? {}) },
      flowerAt: { ...REST, ...s.flowerAt, ...(narrow.flowerAt ?? {}) },
      jellyAt: { ...REST, ...s.jellyAt, ...(narrow.jellyAt ?? {}) },
    };
  }

  stationOf(id, work = null) {
    return STATIONS.findIndex((s) => s.id === id && (work === null || s.work === work));
  }

  // The closing wordmark is sized to the finale's view so it always fits.
  generateForms() {
    const finale = this.station(this.stationOf('finale'));
    const distance = Math.hypot(finale.cam.x - finale.cam.tx, finale.cam.y - finale.cam.ty, finale.cam.z - finale.cam.tz) * this.world.aspectFit;
    const viewWidth = 2 * Math.tan(THREE.MathUtils.degToRad(20)) * distance * (window.innerWidth / window.innerHeight);
    this.flower.addTextForm(
      'wordmark',
      [{ text: site.name, font: '800 {size} "Shippori Mincho", serif', color: '#f6efe8', size: 300 }],
      Math.min(7.4, viewWidth * 0.86),
    );
  }

  // A centripetal Catmull-Rom path through every station. Between two
  // sections the camera swings wide (further for a change of season); between
  // works it arcs around the ring of screens.
  buildPath() {
    const eyes = [];
    const looks = [];
    for (let i = 0; i < this.count; i += 1) {
      const a = this.station(i);
      eyes.push(new THREE.Vector3(a.cam.x, a.cam.y, a.cam.z));
      looks.push(new THREE.Vector3(a.cam.tx, a.cam.ty, a.cam.tz));
      if (i === this.count - 1) break;
      const b = this.station(i + 1);
      if (a.id === 'works' && b.id === 'works') {
        const mid = new THREE.Vector3(a.cam.x, a.cam.y, a.cam.z).add(new THREE.Vector3(b.cam.x, b.cam.y, b.cam.z)).multiplyScalar(0.5);
        const out = new THREE.Vector3(mid.x, 0, mid.z);
        if (out.lengthSq() < 0.01) out.set(0, 0, 1);
        out.normalize().multiplyScalar(Math.max(8.2, Math.hypot(mid.x, mid.z) * 1.35));
        const lift = a.work % 2 ? -2.6 : 3.1;
        eyes.push(new THREE.Vector3(out.x, mid.y + lift, out.z));
        looks.push(new THREE.Vector3(0, (a.cam.ty + b.cam.ty) / 2 + lift * 0.25, 0));
        continue;
      }
      const look = new THREE.Vector3((a.cam.tx + b.cam.tx) / 2, (a.cam.ty + b.cam.ty) / 2 - 0.3, 0);
      const away = new THREE.Vector3((a.cam.x + b.cam.x) / 2, (a.cam.y + b.cam.y) / 2, (a.cam.z + b.cam.z) / 2).sub(look);
      const newSeason = a.season !== b.season;
      const reach = newSeason ? 27 : 15;
      const rise = [6, -5, 7, -6.5, 5, -5.5][i % 6] * (newSeason ? 1 : 0.6);
      const dir = away.lengthSq() > 0.01 ? away.clone().normalize() : new THREE.Vector3(0, 0, 1);
      dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), a.swing * 0.8);
      eyes.push(look.clone().addScaledVector(dir, reach).add(new THREE.Vector3(0, rise, 0)));
      looks.push(look.clone().add(new THREE.Vector3(0, rise * 0.15, 0)));
    }
    this.eyeCurve = new THREE.CatmullRomCurve3(eyes, false, 'centripetal');
    this.lookCurve = new THREE.CatmullRomCurve3(looks, false, 'centripetal');
  }

  bindInput() {
    // Wheel and touch nudge the target; after a pause it snaps to a station.
    this.observer = Observer.create({
      target: window,
      type: 'wheel,touch',
      tolerance: 4,
      preventDefault: true,
      ignore: '[data-observer-ignore]',
      onChangeY: (self) => {
        if (this.busy) return;
        const now = performance.now();
        if (now < this.lockUntil) return;
        const touch = self.event?.type?.startsWith('touch') || self.event?.pointerType === 'touch';
        const step = touch ? -self.deltaY * 0.0048 : self.deltaY * 0.0014;
        const min = Math.max(0, this.rest - 1.3);
        const max = Math.min(this.count - 1, this.rest + 1.3);
        this.target = clamp(this.target + clamp(step, -0.35, 0.35), min, max);
        this.lastInput = now;
      },
    });

    window.addEventListener('keydown', (event) => {
      const tag = event.target instanceof HTMLElement ? event.target.tagName : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || this.busy) return;
      if (['ArrowDown', 'PageDown', ' '].includes(event.key)) {
        event.preventDefault();
        this.goTo(this.rest + 1);
      } else if (['ArrowUp', 'PageUp'].includes(event.key)) {
        event.preventDefault();
        this.goTo(this.rest - 1);
      } else if (event.key === 'Home') this.goTo(0);
      else if (event.key === 'End') this.goTo(this.count - 1);
    });

    this.navLinks.forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const [id, work] = link.dataset.go.split(':');
        const index = this.stationOf(id, work === undefined ? null : Number(work));
        this.goTo(index, { cut: true });
        // keyboard activation: move focus into the section once we arrive
        if (event.detail === 0) {
          const focusTarget =
            id === 'contact'
              ? document.getElementById('contact-name')
              : document.querySelector(`[data-panel="${STATIONS[index]?.panel}"] [tabindex="-1"]`);
          gsap.delayedCall(this.reducedMotion ? 0.3 : 2.2, () => focusTarget?.focus({ preventScroll: true }));
        }
      });
    });
  }

  // Jump to a station. Distant jumps cut through a black veil and only fly
  // the last stretch.
  goTo(index, { cut = false } = {}) {
    if (index < 0) return;
    const to = clamp(Math.round(index), 0, this.count - 1);
    const distance = to - this.current;
    if (cut && Math.abs(distance) > 1.5 && !this.reducedMotion) {
      if (!this.veil) {
        this.veil = document.createElement('div');
        this.veil.className = 'cut-veil';
        this.veil.setAttribute('aria-hidden', 'true');
        document.body.append(this.veil);
      }
      gsap
        .timeline({ overwrite: true })
        .to(this.veil, { opacity: 1, duration: 0.22, ease: 'power2.in' })
        .call(() => {
          this.current = to - Math.sign(distance) * 0.98;
          this.apply(this.current);
        })
        .to(this.veil, { opacity: 0, duration: 0.55, ease: 'power2.out' });
    }
    this.rest = to;
    this.target = to;
    this.lastInput = 0;
  }

  mediaFor(index) {
    let media = this.media.get(index);
    if (media) return media;
    const work = works[index];
    const poster = work.poster ? this.textureLoader.load(work.poster) : workCard(work, index);
    poster.colorSpace = THREE.SRGBColorSpace;
    if (!work.video) {
      media = { video: null, texture: poster, poster, playing: false };
      this.media.set(index, media);
      return media;
    }
    const video = document.createElement('video');
    video.src = work.video;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    media = { video, texture, poster, playing: false };
    this.media.set(index, media);
    return media;
  }

  textureFor(index) {
    const media = this.mediaFor(index);
    return media.video && media.video.readyState >= 2 ? media.texture : media.poster;
  }

  // Only the work in view (and the next) keep their videos playing.
  playOnly(indices) {
    this.media.forEach((media, index) => {
      if (!media.video) return;
      const wanted = indices.includes(index);
      if (wanted && !media.playing) media.video.play().catch(() => {});
      if (!wanted && media.playing) media.video.pause();
      media.playing = wanted;
    });
    indices.forEach((index) => {
      const media = this.mediaFor(index);
      if (media.video && !media.playing) {
        media.video.play().catch(() => {});
        media.playing = true;
      }
    });
  }

  setWorkInfo(index) {
    if (index === this.workShown || index < 0) return;
    this.workShown = index;
    const work = works[index];
    const w = this.work;
    const fill = () => {
      w.name.textContent = work.name;
      w.summary.textContent = work.summary;
      w.year.textContent = String(work.year);
      w.role.textContent = work.role;
      w.host.textContent = hostOf(work.href);
      w.stack.replaceChildren(...work.stack.map((text) => Object.assign(document.createElement('li'), { textContent: text })));
      w.highlights.replaceChildren(...work.highlights.map((text) => Object.assign(document.createElement('li'), { textContent: text })));
      w.link.href = work.href;
      w.link.setAttribute('aria-label', `${work.name} (opens in a new tab)`);
      w.index.textContent = pad(index + 1);
      this.workButtons?.forEach((button, i) => button.toggleAttribute('aria-current', i === index));
    };
    if (!w.root || this.reducedMotion) {
      fill();
      return;
    }
    // the old text washes away through a ripple and the new one surfaces
    const warp = document.querySelector('[data-water-warp]');
    const ripple = document.querySelector('[data-water-ripple]');
    w.root.classList.add('is-flowing');
    gsap
      .timeline({ overwrite: true, onComplete: () => w.root.classList.remove('is-flowing') })
      .to(w.root, { opacity: 0, duration: 0.2, ease: 'power1.in' }, 0)
      .fromTo(warp, { attr: { scale: 0 } }, { attr: { scale: 26 }, duration: 0.2, ease: 'power2.in' }, 0)
      .fromTo(ripple, { attr: { baseFrequency: '0.012 0.05' } }, { attr: { baseFrequency: '0.02 0.09' }, duration: 0.8, ease: 'none' }, 0)
      .call(
        () => {
          fill();
          if (this.reveal.isShown(this.panelById.works)) this.reveal.replay(w.root);
        },
        null,
        0.2,
      )
      .to(w.root, { opacity: 1, duration: 0.5, ease: 'power2.out' }, 0.2)
      .to(warp, { attr: { scale: 0 }, duration: 0.7, ease: 'power3.out' }, 0.2);
  }

  tick(_, deltaMs) {
    const dt = Math.min(0.1, (deltaMs || 16) / 1000);
    // after input pauses, snap: round toward the direction we were heading
    if (this.lastInput && performance.now() - this.lastInput > 200) {
      const heading = Math.sign(this.target - this.rest);
      const next = clamp(Math.round(this.target + heading * 0.38), 0, this.count - 1);
      if (next !== this.rest) this.lockUntil = performance.now() + 450;
      this.rest = next;
      this.target = next;
      this.lastInput = 0;
    }
    const k = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 1.4);
    this.current += (this.target - this.current) * k;
    if (Math.abs(this.target - this.current) < 4e-4) this.current = this.target;
    this.apply(this.current);
  }

  apply(position) {
    const world = this.world;
    const index = clamp(Math.floor(position), 0, this.count - 2);
    const t = settle(clamp(position - index, 0, 1));
    const a = this.station(index);
    const b = this.station(index + 1);
    const swing = Math.sin(t * Math.PI); // 0 at stations, 1 mid-flight
    const along = (2 * index + 2 * t) / (2 * this.count - 2);
    const eye = this.eyeCurve.getPoint(along);
    const look = this.lookCurve.getPoint(along);
    const k = this.intro.k; // 1 before the intro: pulled back and below
    const rig = world.rig;
    rig.tx = look.x;
    rig.ty = look.y;
    rig.tz = look.z;
    rig.x = look.x + (eye.x - look.x) * (1 + k * 0.9);
    rig.y = look.y + (eye.y - look.y) * (1 + k * 0.9) - k * 2.2;
    rig.z = look.z + (eye.z - look.z) * (1 + k * 0.9);

    const betweenWorks = a.id === 'works' && b.id === 'works';
    const sectionChange = !betweenWorks && a.panel !== b.panel;
    rig.roll = a.swing * swing * (betweenWorks ? 0.13 : sectionChange ? 0.08 : 0.045);
    rig.fov = 40 + swing * (betweenWorks ? 7 : sectionChange ? 9 : 3);
    const scatter = sectionChange ? swing * (a.season === b.season ? 0.6 : 1.25) : 0;

    world.water.strength = betweenWorks && !this.reducedMotion ? swing : 0;
    this.warpDom(world.water.strength, position);
    world.water.front = -1.5 + t * 3;
    world.water.dir = a.swing;
    world.parallax = lerp(a.parallax ?? 1, b.parallax ?? 1, t);
    world.flowerOpacity = lerp(a.flowerOpacity ?? 1, b.flowerOpacity ?? 1, t);
    this.place(this.flower.points, a.flowerAt, b.flowerAt, t);
    this.place(this.jelly.points, a.jellyAt, b.jellyAt, t);
    this.flower.setPair(this.flower.forms[a.flower], this.flower.forms[b.flower], t);
    const medusa = this.jelly.forms.medusa;
    this.jelly.setPair(medusa, medusa, t);
    world.jellyIgnite = this.intro.ignite;
    world.ringIgnite = this.intro.ring;
    this.flower.sim.uScatter.value = scatter;

    // focus on the look target
    const focus = eye.distanceTo(look) * world.aspectFit;
    this.flower.render.uFocus.value = focus;
    this.jelly.render.uFocus.value = focus;

    // the works sector: which screen is in focus, which videos play
    const inWorks = (s) => s.id === 'autumn' || s.id === 'works';
    const weight = (inWorks(a) ? 1 - t : 0) + (inWorks(b) ? t : 0);
    let focusWork = -10;
    if (a.work !== undefined && b.work !== undefined) focusWork = a.work + t;
    else if (b.work === undefined) {
      if (a.work !== undefined) focusWork = t < 0.5 ? a.work : -10;
    } else focusWork = t > 0.5 ? b.work : -10;
    if (weight > 0.005) {
      const near = Math.round(Math.max(0, focusWork));
      this.playOnly(focusWork < 0 ? [] : [...new Set([near, Math.min(works.length - 1, near + 1)])]);
      this.textures = works.map((_, i) => this.textureFor(i));
    } else this.playOnly([]);
    world.workPanels.update({
      weight: weight * this.intro.reveal,
      focus: focusWork,
      speed: betweenWorks ? swing : 0,
      textures: this.textures ?? [],
      accent: this.accent,
    });
    const nearest = STATIONS[Math.round(position)];
    if (nearest.work !== undefined) this.setWorkInfo(nearest.work);

    // season: water depth and tint, drift, bloom, accent colour
    const sa = SEASONS[a.season];
    const sb = SEASONS[b.season];
    const ca = this.colors[a.season];
    const cb = this.colors[b.season];
    rig.depth = lerp(1, lerp(sa.water, sb.water, t), this.intro.light);
    world.abyss.tint.copy(ca.tint).lerp(cb.tint, t);
    const drift = world.drift.uniforms;
    drift.uPetal.value = lerp(sa.drift.petal, sb.drift.petal, t);
    drift.uLeaf.value = lerp(sa.drift.leaf, sb.drift.leaf, t);
    drift.uFirefly.value = lerp(sa.drift.firefly, sb.drift.firefly, t);
    drift.uFall.value = lerp(sa.drift.fall, sb.drift.fall, t);
    drift.uSway.value = lerp(sa.drift.sway, sb.drift.sway, t);
    drift.uOpacity.value = lerp(sa.drift.opacity, sb.drift.opacity, t) * this.intro.reveal;
    drift.uColorA.value.copy(ca.a).lerp(cb.a, t);
    drift.uColorB.value.copy(ca.b).lerp(cb.b, t);
    world.fx.bloom = lerp(sa.bloom, sb.bloom, t);
    world.fx.threshold = lerp(sa.threshold, sb.threshold, t);
    world.fx.travel = position * 6;
    this.accent.copy(ca.accent).lerp(cb.accent, t);
    document.documentElement.style.setProperty('--accent', `#${this.accent.getHexString()}`);
    world.schoolCount = Math.round(lerp(sa.school, sb.school, t) * this.intro.reveal);
    world.schoolClear = (t < 0.5 ? a : b).clear;

    this.applyPanels(position);
    this.applyHud(position, lerp(a.depth, b.depth, t));
  }

  // Ripple the works text while travelling between screens.
  warpDom(strength, position) {
    const panel = this.panelById.works;
    if (!panel) return;
    this.worksWarp ||= document.querySelector('[data-works-warp]');
    this.worksRipple ||= document.querySelector('[data-works-ripple]');
    const on = strength > 0.02;
    if (panel.classList.contains('is-travelling') !== on) panel.classList.toggle('is-travelling', on);
    if (!on || !this.worksWarp) return;
    this.worksWarp.setAttribute('scale', (strength * 46).toFixed(1));
    const f = 0.006 + Math.sin(position * 3.1) * 0.0015;
    this.worksRipple.setAttribute('baseFrequency', `${f.toFixed(4)} ${(f * 3.6).toFixed(4)}`);
  }

  place(object, a, b, t) {
    object.position.set(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));
    object.scale.setScalar(lerp(a.s, b.s, t));
    object.rotation.set(lerp(a.rx, b.rx, t), lerp(a.ry, b.ry, t), lerp(a.rz, b.rz, t));
  }

  // Each panel fades in near its station(s) and drifts with --drift.
  applyPanels(position) {
    const firstWork = this.stationOf('works', 0);
    const lastWork = this.stationOf('works', works.length - 1);
    this.panels.forEach((panel) => {
      const id = panel.dataset.panel;
      let offset = Infinity;
      if (id === 'works') {
        offset = position < firstWork ? position - firstWork : position > lastWork ? position - lastWork : 0;
      } else {
        STATIONS.forEach((s, i) => {
          if (s.panel !== id) return;
          const d = position - i;
          if (Math.abs(d) < Math.abs(offset)) offset = d;
        });
      }
      const visibility = (1 - THREE.MathUtils.smoothstep(Math.abs(offset), 0.12, 0.4)) * (id === 'hero' ? this.intro.reveal : 1);
      const visible = visibility > 0.01;
      if (panel.style.visibility !== (visible ? 'visible' : 'hidden')) panel.style.visibility = visible ? 'visible' : 'hidden';
      panel.style.opacity = visibility.toFixed(3);
      panel.style.setProperty('--drift', (Number.isFinite(offset) ? offset : 0).toFixed(4));
      this.reveal.track(panel, visibility);
      const active = visibility > 0.6;
      if (panel.inert === active) {
        panel.inert = !active;
        panel.setAttribute('aria-hidden', active ? 'false' : 'true');
      }
    });
  }

  applyHud(position, depth) {
    const index = Math.round(position);
    const s = STATIONS[index];
    if (this.announced !== index && this.announcer && Math.abs(position - index) < 0.05) {
      this.announced = index;
      const work = s.work === undefined ? null : works[s.work];
      this.announcer.textContent = work ? `Works ${s.work + 1} / ${works.length}: ${work.name}` : (ANNOUNCE[s.id] ?? '');
    }
    const season = HUD_SEASONS.indexOf(s.season);
    const finale = s.id === 'finale';
    this.hud.seasons.forEach((li, i) => li.toggleAttribute('aria-current', !finale && i === season));
    const text = Math.round(depth).toLocaleString('en-US');
    if (this.hud.depth && this.hud.depth.textContent !== text) this.hud.depth.textContent = text;
    this.hud.root?.style.setProperty('--progress', (position / (this.count - 1)).toFixed(4));
    this.navLinks.forEach((link) => {
      const [id] = link.dataset.go.split(':');
      link.toggleAttribute('aria-current', id === s.panel || (id === 'works' && s.panel === 'autumn'));
    });
    // reaching the end resolves the scrambled name in the masthead
    if (finale && !this.nameRevealed) {
      this.nameRevealed = true;
      const progress = { v: 0 };
      gsap.to(progress, { v: 1, duration: 2.2, ease: 'power2.inOut', onUpdate: () => this.redaction?.setResolve(progress.v) });
    }
  }

  // Out of the dark: the flower settles from a loose cloud, the medusa lights
  // from the rim, the water brightens, the ring ignites, then the text.
  introPlay() {
    const tl = gsap.timeline({ onComplete: () => (this.busy = false) });
    if (this.reducedMotion) {
      Object.assign(this.intro, { k: 0, reveal: 1, light: 1, ignite: 1, ring: 1 });
      for (const system of [this.flower, this.jelly]) {
        system.sim.uSpring.value = 18;
        system.sim.uNoise.value = 0.05;
      }
      this.busy = false;
      document.body.classList.remove('is-loading');
      return tl;
    }
    tl.fromTo(this.flower.sim.uSpring, { value: 0.2 }, { value: 18, duration: 2.6, ease: 'power2.inOut' }, 0);
    tl.fromTo(this.flower.sim.uNoise, { value: 1.6 }, { value: 0.05, duration: 2.8, ease: 'power2.inOut' }, 0);
    tl.to(this.intro, { k: 0, duration: 5.2, ease: 'power3.inOut' }, 0);
    tl.to(this.intro, { ignite: 1, duration: 2.4, ease: 'power2.inOut' }, 0.4);
    tl.to(this.intro, { light: 1, duration: 2.4, ease: 'power1.inOut' }, 1.5);
    tl.to(this.intro, { ring: 1, duration: 1.9, ease: 'power2.inOut' }, 2.4);
    tl.to(this.intro, { reveal: 1, duration: 1.2, ease: 'power1.inOut' }, 3.6);
    tl.call(() => document.body.classList.remove('is-loading'), null, 4.4);
    tl.set(this, { busy: false }, 4.2);
    return tl;
  }
}
