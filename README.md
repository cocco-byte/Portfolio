# Portfolio: a dive through four seasons

A WebGL portfolio. You sink through the sea past a particle jellyfish, and the
water changes with the seasons: sakura in spring (About), fireworks in summer
(Services), maple leaves and floating screens in autumn (Works), and snow in
winter (Contact). At the bottom your name surfaces in particles.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

## Make it yours

Everything a visitor reads is in `src/content.js`: your name, tagline, services,
works, portrait, contact endpoint and optional music. Each work can take a `video`
(mp4) or `poster` (image). Without one, the site generates a titled card.

URL flags: `?tier=low|high` forces the particle budget, `?lite` gives a cheap
renderer, and `?light` gives the plain, scrolling no-WebGL page.

## How it works

| Piece | File |
| --- | --- |
| GPGPU swarms (position/velocity textures, spring + curl noise, cursor swirl, morphing between forms) | `src/gl/ParticleSystem.js`, `src/gl/particleShaders.js` |
| Forms: seasons ring, medusa, sakura, firework, maple, snow, text | `src/gl/forms.js` |
| Water, marine snow, seasonal drift, surface/seabed/light shafts, bubbles | `src/gl/environment.js` |
| Work screens on a ring | `src/gl/WorkPanels.js` |
| Post: afterimage → bloom → water wall → lens (aberration, vignette, grain) | `src/gl/World.js`, `src/gl/passes.js` |
| Stations, camera path, scroll snapping, seasons, HUD | `src/Director.js` |
| Loader (particle numerals), name scramble, text reveals, sound, contact form | `src/ui/` |

The visitor's motion setting is respected (`prefers-reduced-motion`), and the
renderer lowers its quality on its own when the frame rate drops. Losing the
WebGL context falls back to the plain page.
