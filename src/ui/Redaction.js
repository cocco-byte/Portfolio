// The masthead name is redacted (XXXX) until the end of the dive, where it
// resolves letter by letter. Hovering it lets a few true letters flicker
// through early.
const MASK = 'X';
const TICK_MS = 55;
const WINDOW = 0.22; // how long each letter spends scrambling while resolving

export class Redaction {
  constructor({ name, elements = [], hoverElements = [], reducedMotion = false }) {
    this.name = name;
    this.length = name.length;
    this.noise = `${[...new Set(name.replace(/\s/g, ''))].join('')}#/+×`;
    this.elements = elements.filter((el) => el instanceof HTMLElement);
    this.hoverElements = hoverElements.filter((el) => el instanceof HTMLElement);
    this.reducedMotion = reducedMotion;
    this.resolve = 0;
    this.hoverTarget = 0;
    this.hoverEnergy = 0;
    this.lastTick = 0;
    this.lastFrame = 0;
    this.glyphs = Array.from(name, (c) => (c === ' ' ? ' ' : MASK));
    this.text = '';
    this.frameId = 0;
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.render = this.render.bind(this);
    if (!reducedMotion) window.addEventListener('pointermove', this.handlePointerMove, { passive: true });
    this.write(this.glyphs.join(''));
  }

  scramble(letter, progress) {
    if (letter === ' ') return ' ';
    return Math.random() < progress * 0.55 ? letter : this.noise[Math.floor(Math.random() * this.noise.length)];
  }

  setResolve(value) {
    const v = Math.min(1, Math.max(0, value));
    if (Math.abs(v - this.resolve) < 5e-4 && v !== 0 && v !== 1) return;
    this.resolve = v;
    if (this.reducedMotion) {
      const shown = Math.floor(v * this.length + 1e-4);
      this.write(this.name.slice(0, shown) + Array.from(this.name.slice(shown), (c) => (c === ' ' ? ' ' : MASK)).join(''));
      return;
    }
    this.wake();
  }

  handlePointerMove(event) {
    const over = this.hoverElements.some((el) => {
      const style = getComputedStyle(el);
      if (Number.parseFloat(style.opacity) < 0.2 || style.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return event.clientX >= r.left - 8 && event.clientX <= r.right + 8 && event.clientY >= r.top - 8 && event.clientY <= r.bottom + 8;
    });
    const target = over ? 1 : 0;
    if (target !== this.hoverTarget) {
      this.hoverTarget = target;
      this.wake();
    }
  }

  wake() {
    if (!this.frameId) this.frameId = requestAnimationFrame(this.render);
  }

  render(now) {
    this.frameId = 0;
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 1 / 60;
    this.lastFrame = now;
    const rate = this.hoverTarget > this.hoverEnergy ? 9 : 2.6;
    this.hoverEnergy += (this.hoverTarget - this.hoverEnergy) * (1 - Math.exp(-rate * dt));
    if (this.hoverEnergy < 0.002) this.hoverEnergy = 0;
    const tick = now - this.lastTick >= TICK_MS;
    if (tick) this.lastTick = now;
    let animating = this.hoverEnergy > 0 || this.hoverTarget > 0;
    for (let i = 0; i < this.length; i += 1) {
      const letter = this.name[i];
      if (letter === ' ') {
        this.glyphs[i] = ' ';
        continue;
      }
      // letters resolve left to right, overlapping
      const progress = (this.resolve - (i / this.length) * 0.78) / WINDOW;
      if (progress >= 1) {
        this.glyphs[i] = letter;
      } else if (progress > 0) {
        animating = true;
        if (tick) this.glyphs[i] = this.scramble(letter, progress);
      } else if (this.hoverEnergy > 0) {
        if (tick) {
          const roll = Math.random();
          this.glyphs[i] = roll < this.hoverEnergy * 0.08 ? letter : roll < this.hoverEnergy * 0.42 ? this.scramble(letter, 0) : MASK;
        }
      } else {
        this.glyphs[i] = MASK;
      }
    }
    this.write(this.glyphs.join(''));
    if (animating) this.wake();
  }

  write(text) {
    if (text === this.text) return;
    this.text = text;
    this.elements.forEach((el) => {
      if (el.textContent !== text) el.textContent = text;
    });
  }
}
