import gsap from 'gsap';

const GLOW = 'rgba(160, 238, 255, 0.95)';

// Panels have different mixes of parts, so tweens often get empty lists.
gsap.config({ nullTargetWarn: false });

// Split an element's text into per-character spans (once). Screen readers
// get the whole string through aria-label instead of letter by letter.
function splitChars(element) {
  if (element.dataset.split === 'done') return Array.from(element.querySelectorAll('.ch'));
  const label = element.textContent.replace(/\s+/g, ' ').trim();
  const chars = [];
  const walk = (node) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const fragment = document.createDocumentFragment();
        Array.from(child.textContent).forEach((character) => {
          if (/\s/.test(character)) {
            fragment.append(character);
            return;
          }
          const span = document.createElement('span');
          span.className = 'ch';
          span.textContent = character;
          fragment.append(span);
          chars.push(span);
        });
        child.replaceWith(fragment);
      } else if (child.nodeType === Node.ELEMENT_NODE && !child.classList.contains('visually-hidden') && child.tagName !== 'BR') {
        walk(child);
      }
    });
  };
  walk(element);
  element.setAttribute('aria-label', label);
  chars.forEach((span) => span.setAttribute('aria-hidden', 'true'));
  element.dataset.split = 'done';
  return chars;
}

// Text surfaces as a panel arrives: characters rise out of a blur with a
// cyan glow, paragraphs are uncovered top-down, list items float up. When the
// panel leaves, everything dissolves.
export class Reveal {
  constructor({ reducedMotion = false } = {}) {
    this.reducedMotion = reducedMotion;
    this.state = new Map();
    if (!reducedMotion) document.documentElement.classList.add('reveal-ready');
  }

  parts(root) {
    return {
      labels: Array.from(root.querySelectorAll('.label')),
      chars: Array.from(root.querySelectorAll('[data-reveal="chars"]')),
      sweep: Array.from(root.querySelectorAll('[data-reveal="sweep"]')),
      rise: Array.from(root.querySelectorAll('[data-reveal="rise"] > *')),
    };
  }

  hideNow(root) {
    const { labels, chars, sweep, rise } = this.parts(root);
    chars.forEach((element) =>
      gsap.set(splitChars(element), { opacity: 0, top: '0.45em', filter: 'blur(8px)', color: GLOW, textShadow: `0 0 18px ${GLOW}` }),
    );
    gsap.set(sweep, { '--reveal': 0, filter: 'blur(5px)' });
    gsap.set(rise, { opacity: 0, y: 18, filter: 'blur(0px)' });
    gsap.set(labels, { '--line': 0 });
    labels.forEach((label) => {
      const season = label.querySelector('.label__season');
      if (season) gsap.set(season, { opacity: 0.2, textShadow: '0 0 0 rgba(0,0,0,0)' });
    });
  }

  show(root) {
    const { labels, chars, sweep, rise } = this.parts(root);
    const tl = gsap.timeline();
    labels.forEach((label) => {
      const season = label.querySelector('.label__season');
      if (season) {
        tl.to(season, { opacity: 1, textShadow: `0 0 16px ${GLOW}`, duration: 0.5, ease: 'power2.out' }, 0).to(
          season,
          { textShadow: '0 0 0px rgba(160, 238, 255, 0)', duration: 1.2, ease: 'power1.inOut' },
          0.5,
        );
      }
      tl.to(label, { '--line': 1, duration: 0.9, ease: 'expo.out' }, 0.1);
    });
    chars.forEach((element, index) => {
      const spans = splitChars(element);
      const color = getComputedStyle(element).color;
      const stagger = Math.min(0.035, 0.9 / Math.max(1, spans.length));
      const at = 0.15 + index * 0.2;
      tl.to(spans, { opacity: 1, top: '0em', filter: 'blur(0px)', duration: 0.9, ease: 'power3.out', stagger }, at).to(
        spans,
        { color, textShadow: '0 0 0px rgba(160, 238, 255, 0)', duration: 1.1, ease: 'power1.inOut', stagger },
        at + 0.35,
      );
    });
    tl.to(sweep, { '--reveal': 1, filter: 'blur(0px)', duration: 1.3, ease: 'power2.out', stagger: 0.14 }, 0.45);
    tl.to(rise, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.06 }, 0.55);
    tl.call(() => chars.forEach((element) => gsap.set(splitChars(element), { clearProps: 'color,textShadow' })));
    return tl;
  }

  dissolve(root) {
    const { chars, sweep, rise } = this.parts(root);
    const spans = chars.flatMap((element) => splitChars(element));
    const tl = gsap.timeline();
    tl.to(spans, { opacity: 0, top: '-0.3em', filter: 'blur(6px)', duration: 0.45, ease: 'power2.in', stagger: { each: 0.008, from: 'random' } }, 0);
    tl.to(sweep, { opacity: 0, filter: 'blur(4px)', duration: 0.4, ease: 'power2.in' }, 0);
    tl.to(rise, { opacity: 0, y: -12, filter: 'blur(4px)', duration: 0.4, ease: 'power2.in' }, 0);
    return tl;
  }

  restore(root) {
    const { sweep, rise } = this.parts(root);
    gsap.set(sweep.concat(rise), { opacity: 1 });
  }

  // Called every frame with how visible a panel is (0-1).
  track(root, visibility) {
    if (this.reducedMotion) return;
    let state = this.state.get(root);
    if (!state) {
      state = { phase: 'hidden', tl: null };
      this.state.set(root, state);
      this.hideNow(root);
    }
    if (state.phase === 'hidden' && visibility > 0.6) {
      state.tl?.kill();
      this.restore(root);
      this.hideNow(root);
      state.tl = this.show(root);
      state.phase = 'shown';
    } else if (state.phase === 'shown' && visibility < 0.45) {
      state.tl?.kill();
      state.tl = this.dissolve(root);
      state.phase = 'leaving';
    } else if (state.phase === 'leaving' && visibility < 0.03) {
      state.tl?.kill();
      this.hideNow(root);
      this.restore(root);
      state.phase = 'hidden';
    } else if (state.phase === 'leaving' && visibility > 0.6) {
      state.phase = 'hidden';
    }
  }

  isShown(root) {
    return this.state.get(root)?.phase === 'shown';
  }

  // Play the entrance again, e.g. after swapping a work's text.
  replay(root) {
    if (this.reducedMotion) return null;
    root.querySelectorAll('[data-reveal="chars"]').forEach((element) => {
      element.dataset.split = '';
    });
    this.hideNow(root);
    this.restore(root);
    return this.show(root);
  }
}
