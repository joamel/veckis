// Post-build: injekterar PWA-metadata + SEO/OG i dist/index.html.
//
// Expo Routers SPA-output ger oss en minimal index.html utan PWA-/SEO-taggar.
// SSG (web.output: "static") aktiverar +html.tsx men triggar hydration-
// mismatch i vår dynamic app — den vägen är därför avstängd. I stället
// patchar vi index.html här efter export, vilket är förutsägbart och inte
// rör runtime-render-tree:t.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const indexPath = join(here, '..', 'dist', 'index.html');

let html = readFileSync(indexPath, 'utf8');

const SITE = 'https://handlis.app';
const TITLE = 'Handlis | Veckomeny, recept & inköpslista för hushållet';
const DESCRIPTION = 'Handlis samlar hushållets inköpslista, recept och veckomeny på ett ställe. Dela listan i realtid, spara recept och planera veckans måltider tillsammans. Gratis.';
const OG_IMAGE = `${SITE}/og-image.png`;

const META = `
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
    <meta name="description" content="${DESCRIPTION}" />
    <link rel="canonical" href="${SITE}/" />
    <meta name="robots" content="index, follow" />
    <link rel="manifest" href="/manifest.json" />
    <meta name="theme-color" content="#4e7a5e" />
    <meta name="application-name" content="Handlis" />
    <link rel="icon" href="/favicon.png" sizes="48x48" />
    <link rel="icon" href="/icon-192.png" sizes="192x192" />
    <link rel="icon" href="/icon-512.png" sizes="512x512" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="Handlis" />
    <meta name="mobile-web-app-capable" content="yes" />

    <!-- Open Graph (Facebook/LinkedIn/länk-preview) -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Handlis" />
    <meta property="og:title" content="${TITLE}" />
    <meta property="og:description" content="${DESCRIPTION}" />
    <meta property="og:url" content="${SITE}/" />
    <meta property="og:image" content="${OG_IMAGE}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:locale" content="sv_SE" />

    <!-- Twitter/X -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${TITLE}" />
    <meta name="twitter:description" content="${DESCRIPTION}" />
    <meta name="twitter:image" content="${OG_IMAGE}" />

    <!-- JSON-LD: strukturerad data för sökmotorer -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "Handlis",
      "applicationCategory": "LifestyleApplication",
      "operatingSystem": "Android, iOS, Web",
      "description": "${DESCRIPTION}",
      "url": "${SITE}/",
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "SEK" }
    }
    </script>

    <style>
      html, body { margin: 0; padding: 0; height: 100%; background: #faf8f3; }
      #root { height: 100%; }
      /* iOS Safari PWA: ta bort 300ms tap-fördröjning och blå tryck-highlight */
      * { -webkit-tap-highlight-color: transparent; }
      /* Interaktiva element: slå av tap-delay utan att störa scroll-containers */
      [role="button"], button, a, input, select, textarea,
      [data-focusable="true"] { touch-action: manipulation; }
      /* Vecko-/dag-svep: tvinga snap till EN sida per svep (annars flyger
         veckorna förbi med momentum på web — native pagar en sida i taget). */
      [data-weekpage] { scroll-snap-align: start; scroll-snap-stop: always; }
    </style>
    <script>
      // SW-registrering + version-banner. När en ny SW tar över sätter vi
      // en global flagga som UI:t kan lyssna på (window.__veckisNewVersion).
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
          navigator.serviceWorker.register('/sw.js').then(function (reg) {
            navigator.serviceWorker.addEventListener('controllerchange', function () {
              window.__veckisNewVersion = true;
              window.dispatchEvent(new CustomEvent('veckis-new-version'));
            });
            reg.addEventListener('updatefound', function () {
              var newSw = reg.installing;
              if (!newSw) return;
              newSw.addEventListener('statechange', function () {
                if (newSw.state === 'installed' && navigator.serviceWorker.controller) {
                  window.__veckisNewVersion = true;
                  window.dispatchEvent(new CustomEvent('veckis-new-version'));
                }
              });
            });
          }).catch(function (e) {
            console.warn('SW-registrering misslyckades:', e);
          });
        });
      }
    </script>
`;

// 1. Sätt lang="sv" på <html>.
html = html.replace(/<html[^>]*>/i, '<html lang="sv">');

// 2. Ersätt (eller injicera) <title> med SEO-titeln.
if (/<title>.*?<\/title>/is.test(html)) {
  html = html.replace(/<title>.*?<\/title>/is, `<title>${TITLE}</title>`);
} else {
  html = html.replace('</head>', `    <title>${TITLE}</title>\n</head>`);
}

// 3. Injicera META precis före </head>.
const patched = html.replace('</head>', `${META}</head>`);

if (patched === html) {
  console.error('!! Hittade inte </head> i dist/index.html — patchen kördes inte.');
  process.exit(1);
}

writeFileSync(indexPath, patched);
console.log('✓ Patchade dist/index.html med PWA + SEO/OG-metadata');
