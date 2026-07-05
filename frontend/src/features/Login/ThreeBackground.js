import React, { useEffect, useRef } from 'react';
import createBackground from './threeAnimation';

// Vendored libs live in public/ so they stay out of the main app bundle and are
// only fetched when this component mounts (login/register only). Served from the
// app root — PUBLIC_URL keeps it correct if the app is ever deployed on a subpath.
const BASE = process.env.PUBLIC_URL || '';
const LIB_SRCS = [
  `${BASE}/scripts/animate/three.min.js`,
  `${BASE}/scripts/animate/simplex-noise.min.js`,
  `${BASE}/scripts/animate/chroma.min.js`,
];

// Load a classic <script> once; dedupe concurrent/repeat requests by URL.
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-bg="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded) resolve();
      else {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', reject);
      }
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = false; // preserve source order if the browser batches them
    s.dataset.bg = src;
    s.onload = () => { s.dataset.loaded = '1'; resolve(); };
    s.onerror = reject;
    document.body.appendChild(s);
  });
}

/**
 * Decorative 3D tube-field background, rendered only on the auth pages.
 *
 * Owns its own <canvas> inside the React tree — so nothing paints before React
 * mounts (no more F5 flash), and the animation stops + frees its WebGL context
 * the moment we leave the page.
 */
export default function ThreeBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    let dispose = null;
    let cancelled = false;

    // index.html paints an opaque themed background on <html> (flash fix). That
    // opaque colour would sit on top of our z-index:-1 canvas and hide it, so
    // make the page background transparent while the animation is on screen and
    // restore it on unmount (keeps the flash fix for every other page).
    const rootEl = document.documentElement;
    const bodyEl = document.body;
    const prevRootBg = rootEl.style.backgroundColor;
    const prevBodyBg = bodyEl.style.backgroundColor;
    rootEl.style.backgroundColor = 'transparent';
    bodyEl.style.backgroundColor = 'transparent';

    Promise.all(LIB_SRCS.map(loadScript))
      .then(() => {
        // Bail if we unmounted while the libs were loading (avoids binding a
        // second WebGL context to a canvas that's about to be removed).
        if (cancelled || !canvasRef.current) return;
        dispose = createBackground(canvasRef.current);
      })
      .catch(() => { /* background is purely decorative — ignore load failures */ });

    return () => {
      cancelled = true;
      if (dispose) dispose();
      rootEl.style.backgroundColor = prevRootBg;
      bodyEl.style.backgroundColor = prevBodyBg;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: -1,
        pointerEvents: 'none',
        display: 'block',
      }}
    />
  );
}
