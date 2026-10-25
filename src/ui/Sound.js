// The sound toggle in the masthead. Plays a looping track when one is
// configured, otherwise a soft generated ambience: a low detuned drone and
// filtered noise like distant surf. The four bars follow an analyser.
// A soundcloud.com URL plays through SoundCloud's widget in a hidden iframe;
// its audio can't reach the analyser, so the bars then sway on their own.
const SOUNDCLOUD = /^https?:\/\/(www\.|m\.)?soundcloud\.com\//;
const WIDGET_API = 'https://w.soundcloud.com/player/api.js';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
}

export class Sound {
  constructor(button, source = '') {
    this.button = button;
    this.source = source;
    this.label = button?.querySelector('[data-sound-label]') ?? null;
    this.bars = Array.from(button?.querySelectorAll('.sound__bars i') ?? []);
    this.context = null;
    this.analyser = null;
    this.data = null;
    this.on = false;
    this.frameId = 0;
    this.resumeOnVisible = false;
    this.render = this.render.bind(this);
    this.toggle = this.toggle.bind(this);
    this.handleVisibility = this.handleVisibility.bind(this);
    button?.addEventListener('click', this.toggle);
    document.addEventListener('visibilitychange', this.handleVisibility);
    this.widget = null;
    this.widgetReady = SOUNDCLOUD.test(source) ? this.loadWidget() : null;
  }

  // Load the widget while the page loads, so it is ready by the time the
  // visitor chooses to enter with sound.
  async loadWidget() {
    try {
      await loadScript(WIDGET_API);
    } catch {
      return null;
    }
    const frame = document.createElement('iframe');
    frame.className = 'sound__widget';
    frame.title = 'Background music';
    frame.allow = 'autoplay';
    frame.tabIndex = -1;
    frame.setAttribute('aria-hidden', 'true');
    const options = 'auto_play=false&buying=false&sharing=false&download=false&show_artwork=false&visual=false';
    frame.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(this.source)}&${options}`;
    document.body.append(frame);
    const { Widget } = window.SC;
    const widget = Widget(frame);
    return new Promise((resolve) => {
      widget.bind(Widget.Events.READY, () => {
        // loop
        widget.bind(Widget.Events.FINISH, () => {
          widget.seekTo(0);
          widget.play();
        });
        widget.setVolume(35);
        this.widget = widget;
        resolve(widget);
      });
    });
  }

  ensureAudio() {
    if (this.context) return;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    const ctx = new Context();
    this.context = ctx;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 64;
    this.analyser.smoothingTimeConstant = 0.8;
    this.data = new Uint8Array(this.analyser.frequencyBinCount);
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.analyser);
    this.analyser.connect(ctx.destination);

    if (this.source) {
      this.audio = new Audio(this.source);
      this.audio.loop = true;
      this.audio.preload = 'auto';
      ctx.createMediaElementSource(this.audio).connect(this.master);
      return;
    }

    // drone: two detuned triangles under a slowly breathing low-pass
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 6;
    filter.connect(this.master);
    [55, 82.4, 110.3].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 2 ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      osc.detune.value = (i - 1) * 7;
      const gain = ctx.createGain();
      gain.gain.value = i === 2 ? 0.05 : 0.12;
      osc.connect(gain).connect(filter);
      osc.start();
    });
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const depth = ctx.createGain();
    depth.gain.value = 260;
    lfo.connect(depth).connect(filter.frequency);
    lfo.start();

    // surf: looping noise through a band-pass whose level swells and ebbs
    const noise = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) samples[i] = Math.random() * 2 - 1;
    const surf = ctx.createBufferSource();
    surf.buffer = noise;
    surf.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 600;
    band.Q.value = 0.6;
    const swell = ctx.createGain();
    swell.gain.value = 0.025;
    const swellLfo = ctx.createOscillator();
    swellLfo.frequency.value = 0.11;
    const swellDepth = ctx.createGain();
    swellDepth.gain.value = 0.02;
    swellLfo.connect(swellDepth).connect(swell.gain);
    surf.connect(band).connect(swell).connect(this.master);
    surf.start();
    swellLfo.start();
  }

  async play() {
    if (this.widgetReady) {
      const widget = this.widget ?? (await this.widgetReady);
      if (!widget) return;
      widget.play();
      this.on = true;
      this.sync();
      this.frameId ||= requestAnimationFrame(this.render);
      return;
    }
    this.ensureAudio();
    if (!this.context) return;
    try {
      await this.context.resume();
      if (this.audio) await this.audio.play();
    } catch {
      return;
    }
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(this.audio ? 0.18 : 0.5, now, 0.6);
    this.on = true;
    this.sync();
    this.frameId ||= requestAnimationFrame(this.render);
  }

  pause() {
    this.widget?.pause();
    if (this.context) {
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0, now, 0.25);
      window.setTimeout(() => {
        if (!this.on) {
          this.audio?.pause();
          this.context.suspend();
        }
      }, 1200);
    }
    this.on = false;
    this.sync();
  }

  toggle() {
    if (this.on) this.pause();
    else this.play();
  }

  sync() {
    this.button?.setAttribute('aria-pressed', this.on ? 'true' : 'false');
    if (this.label) this.label.textContent = this.on ? 'Sound on' : 'Sound off';
  }

  handleVisibility() {
    if (document.hidden) {
      this.resumeOnVisible = this.on;
      if (this.on) this.pause();
    } else if (this.resumeOnVisible) {
      this.resumeOnVisible = false;
      this.play();
    }
  }

  render() {
    this.frameId = 0;
    if (this.on && this.widget) {
      const t = performance.now() / 1000;
      this.bars.forEach((bar, i) => {
        const level = 0.5 + 0.5 * Math.sin(t * (4 + i * 1.3) + i * 2.1) * Math.sin(t * (1.7 + i * 0.6));
        bar.style.transform = `scaleY(${0.18 + level * 0.82})`;
      });
      this.frameId = requestAnimationFrame(this.render);
      return;
    }
    if (this.on && this.analyser) {
      this.analyser.getByteFrequencyData(this.data);
      this.bars.forEach((bar, i) => {
        const level = this.data[Math.min(this.data.length - 1, 1 + i * 3)] / 255;
        bar.style.transform = `scaleY(${0.18 + level * 0.82})`;
      });
      this.frameId = requestAnimationFrame(this.render);
      return;
    }
    this.bars.forEach((bar) => {
      bar.style.transform = '';
    });
  }
}
