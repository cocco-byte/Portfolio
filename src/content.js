// Everything a visitor reads lives here. Replace the placeholders with your own
// name, copy and projects; the scene, HUD and works list are built from it.

export const site = {
  // Shown in the masthead (scrambled until the finale) and drawn in particles
  // at the end of the dive. Keep it short: it is set in one line.
  name: 'Anandita Gupta',
  tagline: 'Wanderer Explorer',
  motif: 'Jellyfish × Beautiful flower',
  email: 'anandita.cocco@gmail.com',
  // POST endpoint for the contact form ({ name, email, message }). When empty
  // the form opens the visitor's mail client instead.
  contactEndpoint: '',
  // Optional looping track for "Enter with sound": an audio file, or a
  // soundcloud.com track URL (played through SoundCloud's embedded player).
  // When empty a soft generated ambience plays instead.
  audio: 'https://soundcloud.com/kristie-alexandra/passionfruit-drake-cover',
  // Credit shown in the footer when a track is set. Leave empty to hide it.
  audioCredit: { text: 'Passionfruit (Drake cover) by Kristie Alexandra', href: 'https://soundcloud.com/kristie-alexandra/passionfruit-drake-cover' },
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
    name: 'Tethered',
    href: 'https://github.com/Kirito-Excalibur/Tethered',
    year: 2026,
    role: 'Design, Frontend Development',
    summary: 'A login-free brainstorming app for creating and sharing interactive mind maps.',
    highlights: ['URL-based idea sharing without authentication',
    'Customizable nodes with colors, fonts, images, and GIFs'],
    stack: ['React.js', 'Fabric.js', 'Netlify'],
    hue: '#6aa7ff',
  },
  {
    
  name: 'RD Khata',
  href: 'https://github.com/cocco-byte/RD_Khata',
  year: 2026,
  role: 'Full-Stack Development, Database Design',
  summary: 'A role-based daily collection tracking platform with secure authentication and visual payment history.',
  highlights: [
    'Interactive attendance calendar tracking paid, missed, and upcoming payments',
    'Secure JWT authentication with role-based access control'
  ],
  stack: ['Next.js', 'TypeScript', 'PostgreSQL', 'Prisma'],
  hue: '#4ade80',

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
