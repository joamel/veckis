// Post-build: injekterar PWA-metadata i dist/index.html.
//
// Expo Routers SPA-output ger oss en minimal index.html utan PWA-taggar.
// SSG (web.output: "static") aktiverar +html.tsx men triggar hydration-
// mismatch i vår dynamic app — den vägen är därför avstängd. I stället
// patchar vi index.html här efter export, vilket är förutsägbart och inte
// rör runtime-render-tree:t.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const indexPath = join(here, '..', 'dist', 'index.html');

const html = readFileSync(indexPath, 'utf8');

const META = `
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
    <link rel="manifest" href="/manifest.json" />
    <meta name="theme-color" content="#7c3aed" />
    <meta name="application-name" content="Veckis" />
    <link rel="icon" href="/favicon.png" sizes="48x48" />
    <link rel="icon" href="/icon-192.png" sizes="192x192" />
    <link rel="icon" href="/icon-512.png" sizes="512x512" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="Veckis" />
    <meta name="mobile-web-app-capable" content="yes" />
    <style>
      html, body { margin: 0; padding: 0; height: 100%; background: #f5f3ff; }
      #root { height: 100%; }
    </style>
    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
          navigator.serviceWorker.register('/sw.js').catch(function (e) {
            console.warn('SW-registrering misslyckades:', e);
          });
        });
      }
    </script>
`;

// Injekterar precis före </head>. Behåller resten av expo-genererad HTML
// orörd så bundle-script-taggen och favicon-länken finns kvar.
const patched = html.replace('</head>', `${META}</head>`);

if (patched === html) {
  console.error('!! Hittade inte </head> i dist/index.html — patchen kördes inte.');
  process.exit(1);
}

writeFileSync(indexPath, patched);
console.log('✓ Patchade dist/index.html med PWA-metadata');
