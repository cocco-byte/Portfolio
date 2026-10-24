import './style.css';
import gsap from 'gsap';
import { site, works, portrait } from './content.js';
import { Form } from './gl/particleShaders.js';
import { seasonsRing, sakuraFall, hanabi, mapleFall, snowFall, medusa } from './gl/forms.js';
import { World } from './gl/World.js';
import { Director } from './Director.js';
import { Loader } from './ui/Loader.js';
import { Redaction } from './ui/Redaction.js';
import { Sound } from './ui/Sound.js';
import { ContactForm } from './ui/ContactForm.js';

const $ = (selector) => document.querySelector(selector);
const params = new URLSearchParams(window.location.search);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Small or modest devices get a quarter of the particles.
const modest =
  window.innerWidth < 760 ||
  (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
  (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ||
  /iPhone|iPad|Android/i.test(navigator.userAgent);
const tier = params.get('tier') ?? (modest ? 'low' : 'high');

// Copy from content.js into the page.
document.querySelectorAll('[data-motif]').forEach((el) => {
  el.textContent = site.motif;
});
document.querySelectorAll('[data-tagline]').forEach((el) => {
  el.textContent = site.tagline;
});
document.querySelectorAll('[data-site-name]').forEach((el) => {
  el.textContent = site.name;
});
document.querySelectorAll('[data-year]').forEach((el) => {
  el.textContent = String(new Date().getFullYear());
});
document.title = `${site.name} | ${site.tagline}`;
const portraitFigure = $('[data-portrait]');
if (portraitFigure && portrait) {
  portraitFigure.querySelector('img').src = portrait;
  portraitFigure.hidden = false;
}

const loader = new Loader($('[data-loader]'), { reducedMotion, name: site.name });
loader.setTotal(tier === 'high' ? 512 * 512 + 384 * 384 : 256 * 256 + 192 * 192);

const sound = new Sound($('[data-sound]'), site.audio);
const world = new World({ canvas: $('[data-stage]'), reducedMotion, tier, lite: params.has('lite'), workCount: works.length });
const redaction = new Redaction({
  name: site.name,
  elements: Array.from(document.querySelectorAll('[data-brand-name]')),
  hoverElements: [$('.masthead__name')],
  reducedMotion,
});
new ContactForm($('[data-contact-form]'), { endpoint: site.contactEndpoint, email: site.email });

const motionButton = $('[data-motion]');
const motionLabel = $('[data-motion-label]');
motionButton?.addEventListener('click', () => {
  world.paused = !world.paused;
  motionButton.setAttribute('aria-pressed', world.paused ? 'false' : 'true');
  if (motionLabel) motionLabel.textContent = world.paused ? 'Motion off' : 'Motion on';
});

let director = null;
let entered = false;
let light = false;

// No WebGL (or the visitor asked for it): a plain scrolling page.
function goLight() {
  if (light) return;
  light = true;
  world.stop();
  director = null;
  document.documentElement.classList.add('no-webgl');
  loader.clearTrouble();
  loader.finish();
  document.body.classList.remove('is-loading');
}

window.addEventListener('world:gl-lost', () => {
  if (!light) loader.trouble('3D couldn’t start on this device.', { onLight: goLight });
});

// After a successful send the page opens onto a thank-you, growing from the
// send button.
const thanks = $('[data-thanks]');
document.addEventListener('contact:sent', (event) => {
  if (!thanks) return;
  const origin = event.detail;
  if (origin) {
    thanks.style.setProperty('--x', `${origin.x}px`);
    thanks.style.setProperty('--y', `${origin.y}px`);
  }
  thanks.hidden = false;
  if (director) director.busy = true;
  requestAnimationFrame(() => requestAnimationFrame(() => thanks.setAttribute('data-open', '')));
  gsap.delayedCall(reducedMotion ? 0 : 1, () => thanks.querySelector('[tabindex="-1"]')?.focus({ preventScroll: true }));
});
$('[data-thanks-close]')?.addEventListener('click', () => {
  thanks.removeAttribute('data-open');
  window.setTimeout(() => {
    thanks.hidden = true;
    if (director) director.busy = false;
    $('[data-submit]')?.focus({ preventScroll: true });
  }, reducedMotion ? 0 : 1400);
});

async function start() {
  const slow = window.setTimeout(() => {
    if (!entered) loader.trouble('This is taking a while. Keep waiting, or choose another way in.', { onLight: goLight });
  }, 30_000);

  try {
    await Promise.all([
      document.fonts?.load('400 1em "Zen Kaku Gothic New"', 'Beautiful'),
      document.fonts?.load('italic 400 1em "Instrument Serif"', 'Beautiful flower'),
      document.fonts?.load('400 1em "Instrument Serif"', '0123456789'),
      document.fonts?.load('800 1em "Shippori Mincho"', site.name),
      document.fonts?.load('600 1em "Shippori Mincho"', '春夏秋冬'),
    ]).catch(() => {});
    loader.setProgress(0.3);
    await world.init({
      flowerTasks: [
        ['seasonsRing', (size) => ({ id: Form.VORTEX, ...seasonsRing(size) })],
        ['sakuraFall', (size) => ({ id: Form.FALL, ...sakuraFall(size) })],
        ['hanabi', (size) => ({ id: Form.NETWORK, ...hanabi(size) })],
        ['mapleFall', (size) => ({ id: Form.FALL, ...mapleFall(size) })],
        ['snowFall', (size) => ({ id: Form.FALL, ...snowFall(size) })],
      ],
      jellyTasks: [['medusa', (size) => ({ id: Form.JELLY, ...medusa(size) })]],
      onProgress: (p) => loader.setProgress(0.3 + p * 0.62),
    });
    director = new Director({ world, redaction, reducedMotion });
    director.init();
  } catch (error) {
    console.error('3D could not start.', error);
    window.clearTimeout(slow);
    loader.trouble('3D couldn’t start on this device.', { onLight: goLight });
    return;
  }

  window.clearTimeout(slow);
  loader.clearTrouble();
  loader.setProgress(1);
  const choice = await loader.waitForChoice();
  if (light) return;
  entered = true;
  if (choice === 'sound') sound.play();
  loader.finish();
  director.introPlay();
}

if (params.has('light')) goLight();
else start();
