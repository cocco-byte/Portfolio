// Everything a visitor reads lives here. Replace the placeholders with your own
// name, copy and projects; the scene, HUD and works list are built from it.

export const site = {
  // Shown in the masthead (scrambled until the finale) and drawn in particles
  // at the end of the dive. Keep it short: it is set in one line.
  name: 'YOUR NAME',
  tagline: 'Mix the unexpected.',
  motif: 'Jellyfish × Beautiful flower',
  email: 'hello@example.com',
  // POST endpoint for the contact form ({ name, email, message }). When empty
  // the form opens the visitor's mail client instead.
  contactEndpoint: '',
  // Optional looping track for "Enter with sound". When empty a soft
  // generated ambience plays instead.
  audio: '',
};

export const services = [
  { title: 'Art direction & Web design', tags: ['Brand sites', 'Corporate sites', 'Landing pages'] },
  { title: 'WebGL & 3D', tags: ['Three.js', 'GLSL', 'GPGPU'] },
  { title: 'Motion & interaction', tags: ['GSAP', 'Observer', 'Micro-interactions'] },
  { title: 'SPA & Web applications', tags: ['React', 'Next.js', 'TypeScript'] },
  { title: 'App development', tags: ['PWA', 'React Native'] },
  { title: 'CMS & site building', tags: ['WordPress', 'Headless CMS'] },
  { title: 'SEO & performance', tags: ['Technical SEO', 'Core Web Vitals', 'Accessibility'] },
  { title: 'Launch & operations', tags: ['Vercel', 'Analytics', 'Maintenance'] },
];

// Each work gets its own floating screen in the autumn sector. `video` (mp4)
// or `poster` (image) are optional; without them a titled card is generated.
export const works = [
  {
    name: 'PROJECT ONE',
    href: 'https://example.com/',
    year: 2026,
    role: 'Design, Development',
    summary: 'A corporate site that lets large photography carry the story.',
    highlights: ['Full-bleed imagery that sells the space', 'Headings choreographed to scroll'],
    stack: ['HTML / CSS', 'JavaScript', 'GSAP'],
    hue: '#c9b79c',
  },
  {
    name: 'PROJECT TWO',
    href: 'https://example.com/',
    year: 2025,
    role: 'Design, 3D, Development',
    summary: 'Real-time 3D on a night road, with kinetic type between chapters.',
    highlights: ['A drive rendered live in WebGL', 'Sections that swap as you travel'],
    stack: ['Three.js', 'WebGL', 'GSAP'],
    hue: '#6aa7ff',
  },
  {
    name: 'PROJECT THREE',
    href: 'https://example.com/',
    year: 2025,
    role: 'Design, Development',
    summary: 'Bold, screen-filling typography layered over photographs.',
    highlights: ['Type and image interlocked', 'Vertical navigation tabs'],
    stack: ['HTML / CSS', 'JavaScript', 'Canvas'],
    hue: '#ff8f6b',
  },
  {
    name: 'PROJECT FOUR',
    href: 'https://example.com/',
    year: 2024,
    role: 'Design, Development',
    summary: 'A brand world told with music, monochrome and generous space.',
    highlights: ['Sound on / off toggle', 'Monochrome photography'],
    stack: ['HTML / CSS', 'JavaScript', 'Web Audio'],
    hue: '#e8e3da',
  },
  {
    name: 'PROJECT FIVE',
    href: 'https://example.com/',
    year: 2024,
    role: 'Concept, Design, Development',
    summary: 'An experimental site you can steer with your hands through the camera.',
    highlights: ['Hand tracking processed entirely in the browser', 'Choose hand or mouse mode at the door'],
    stack: ['Hand tracking', 'Camera API', 'Web Audio'],
    hue: '#9fe6ff',
  },
];

// The about section's portrait. Leave empty to hide it.
export const portrait = '';
