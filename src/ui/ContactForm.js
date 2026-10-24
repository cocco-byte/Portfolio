// Contact form with inline validation, a honeypot, a minimum fill time and
// a one-minute resend guard. Posts JSON to `endpoint`, or falls back to a
// mailto: link when no endpoint is configured.

const LIMITS = {
  name: { min: 2, max: 60 },
  email: { max: 254, local: 64 },
  message: { min: 20, max: 1200, urls: 1 },
  minFillMs: 2500,
};

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤⁦-⁩﻿]/u;
const ANGLES = /[<>＜＞]/u;
const SCRIPTY = /(?:javascript|vbscript|livescript)\s*:|data\s*:\s*[a-z]+\/[a-z0-9.+-]+|\bon[a-z]{3,}\s*=|&#x?[0-9a-f]+;?|&(?:lt|gt|quot|apos);|%3c|%3e|\\u00?3c|expression\s*\(/iu;
const URLS = /(?:https?:\/\/|www\.)[^\s]+/giu;
const NAME = /^[\p{L}\p{M}][\p{L}\p{M}\p{N} .,'’・ー\-]*$/u;
const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,24}$/;

const MESSAGES = {
  name: {
    empty: 'Please enter your name.',
    short: 'Your name needs at least 2 characters.',
    long: 'Please keep your name under 60 characters.',
    markup: 'Your name can’t contain “< >” or code-like text.',
    control: 'Your name contains invisible control characters. Please type it rather than paste it.',
    invalid: 'Names can use letters, numbers, spaces and . , - only.',
  },
  email: {
    empty: 'Please enter your email address.',
    long: 'Please keep your email under 254 characters.',
    control: 'Your email contains invisible control characters.',
    invalid: 'That email doesn’t look right (e.g. name@example.com).',
  },
  message: {
    empty: 'Please tell me a little about your project.',
    short: 'Please write at least 20 characters.',
    long: 'Please keep your message under 1,200 characters.',
    markup: '“< >” and script- or HTML-like text can’t be sent.',
    control: 'Your message contains invisible control characters. Please type it rather than paste it.',
    links: 'Please include at most one URL.',
  },
};

const SENT_KEY = 'contact-sent-at';

const normalise = (value) => String(value ?? '').normalize('NFKC').replace(/\r\n?/g, '\n').trim();

function check(field, raw) {
  const value = normalise(raw);
  if (!value) return 'empty';
  if (CONTROL.test(value)) return 'control';
  if (field === 'name') {
    if (value.length < LIMITS.name.min) return 'short';
    if (value.length > LIMITS.name.max) return 'long';
    if (ANGLES.test(value) || SCRIPTY.test(value)) return 'markup';
    if (!NAME.test(value)) return 'invalid';
  } else if (field === 'email') {
    if (value.length > LIMITS.email.max) return 'long';
    if (!EMAIL.test(value) || value.split('@')[0].length > LIMITS.email.local || value.includes('..')) return 'invalid';
  } else if (field === 'message') {
    if (value.length < LIMITS.message.min) return 'short';
    if (value.length > LIMITS.message.max) return 'long';
    if (ANGLES.test(value) || SCRIPTY.test(value)) return 'markup';
    if ((value.match(URLS)?.length ?? 0) > LIMITS.message.urls) return 'links';
  }
  return '';
}

const messageFor = (field, code) => (code ? (MESSAGES[field]?.[code] ?? 'Please check this field.') : '');

export class ContactForm {
  constructor(form, { endpoint = '', email = '' } = {}) {
    this.form = form;
    this.endpoint = endpoint;
    this.email = email;
    this.status = form.querySelector('[data-contact-form-status]');
    this.submit = form.querySelector('[data-submit]');
    this.honeypot = form.elements.namedItem('company_website');
    this.fields = {
      name: form.elements.namedItem('name'),
      email: form.elements.namedItem('email'),
      message: form.elements.namedItem('message'),
    };
    this.startedAt = performance.now();
    this.sending = false;
    form.addEventListener('submit', (event) => this.handleSubmit(event));
    form.addEventListener('focusout', (event) => {
      const name = event.target?.name;
      if (name in this.fields && event.target.value) this.validate(name);
    });
    form.addEventListener('input', (event) => {
      const name = event.target?.name;
      if (name in this.fields && event.target.getAttribute('aria-invalid') === 'true') this.validate(name);
      if (this.status && !this.sending) this.status.textContent = '';
    });
  }

  validate(field) {
    const message = messageFor(field, check(field, this.fields[field]?.value));
    this.show(field, message);
    return !message;
  }

  show(field, message) {
    this.fields[field]?.setAttribute('aria-invalid', message ? 'true' : 'false');
    const error = this.form.querySelector(`[data-error-for="${field}"]`);
    if (error) error.textContent = message;
  }

  say(text) {
    if (this.status) this.status.textContent = text;
  }

  sentRecently() {
    try {
      return Date.now() - Number(sessionStorage.getItem(SENT_KEY) || 0) < 60_000;
    } catch {
      return false;
    }
  }

  async handleSubmit(event) {
    event.preventDefault();
    if (this.sending) return;
    const invalid = Object.keys(this.fields).filter((field) => !this.validate(field));
    if (invalid.length) {
      this.fields[invalid[0]]?.focus();
      this.say(invalid.length === 1 ? 'One field needs another look.' : `${invalid.length} fields need another look.`);
      return;
    }
    const elapsed = Math.round(performance.now() - this.startedAt);
    if (elapsed < LIMITS.minFillMs || this.sentRecently()) {
      this.say('Please wait a moment and try again.');
      return;
    }
    // bots fill every field; people never see this one
    if (this.honeypot instanceof HTMLInputElement && this.honeypot.value) return;

    const payload = {
      name: normalise(this.fields.name.value),
      email: normalise(this.fields.email.value),
      message: normalise(this.fields.message.value),
    };

    if (!this.endpoint) {
      const subject = encodeURIComponent(`Hello from ${payload.name}`);
      const body = encodeURIComponent(`${payload.message}\n\n${payload.name} <${payload.email}>`);
      window.location.href = `mailto:${this.email}?subject=${subject}&body=${body}`;
      this.say('Your mail app should open with the message ready to send.');
      return;
    }

    this.sending = true;
    if (this.submit) this.submit.disabled = true;
    this.form.setAttribute('aria-busy', 'true');
    this.say('Sending…');
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ ...payload, elapsed }),
      });
      clearTimeout(timer);
      const result = await response.json().catch(() => ({}));
      if (response.status === 400 && result?.errors) {
        const fields = Object.keys(result.errors).filter((field) => field in this.fields);
        fields.forEach((field) => this.show(field, messageFor(field, result.errors[field])));
        if (fields.length) this.fields[fields[0]]?.focus();
        this.say('Please check the highlighted fields.');
        return;
      }
      if (response.status === 429) {
        this.say('Too many messages in a row. Please try again a little later.');
        return;
      }
      if (!response.ok) throw new Error('send-failed');
      try {
        sessionStorage.setItem(SENT_KEY, String(Date.now()));
      } catch {
        // storage can be unavailable (private mode); the guard is best-effort
      }
      this.form.reset();
      Object.values(this.fields).forEach((field) => field?.removeAttribute('aria-invalid'));
      this.say('Sent. Thank you!');
      const rect = this.submit?.getBoundingClientRect();
      this.form.dispatchEvent(
        new CustomEvent('contact:sent', {
          bubbles: true,
          detail: rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null,
        }),
      );
    } catch {
      this.say('The message couldn’t be sent. Please check your connection and try again.');
    } finally {
      this.sending = false;
      this.form.removeAttribute('aria-busy');
      if (this.submit) this.submit.disabled = false;
    }
  }
}
