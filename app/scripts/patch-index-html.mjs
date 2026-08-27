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
const GA_ID = 'G-XJG4FKTTSD'; // GA4 Measurement ID (handlis.app web-stream)

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

    <!-- Google Analytics (GA4) — laddas ENDAST efter cookie-samtycke (GDPR).
         Ingen GA-cookie/-script förrän användaren trycker Acceptera. Valet sparas
         i localStorage så bannern bara visas en gång. -->
    <script>
      (function () {
        var KEY = 'handlis-analytics-consent';
        function loadGA() {
          var s = document.createElement('script');
          s.async = true;
          s.src = 'https://www.googletagmanager.com/gtag/js?id=${GA_ID}';
          document.head.appendChild(s);
          window.dataLayer = window.dataLayer || [];
          function gtag(){ dataLayer.push(arguments); }
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${GA_ID}');
        }
        function hideBanner() { var b = document.getElementById('cookie-banner'); if (b) b.parentNode.removeChild(b); }
        function choose(v) { try { localStorage.setItem(KEY, v); } catch (e) {} hideBanner(); if (v === 'granted') loadGA(); }
        function showBanner() {
          var el = document.createElement('div');
          el.id = 'cookie-banner';
          el.setAttribute('role', 'dialog');
          el.setAttribute('aria-label', 'Cookie-samtycke');
          el.innerHTML = '<div class="cb-inner">'
            + '<span class="cb-text">Vi använder cookies för anonym besöksstatistik (Google Analytics) för att förbättra Handlis. Inget delas för reklam.</span>'
            + '<span class="cb-actions">'
            + '<button type="button" class="cb-decline">Avvisa</button>'
            + '<button type="button" class="cb-accept">Acceptera</button>'
            + '</span></div>';
          document.body.appendChild(el);
          el.querySelector('.cb-accept').addEventListener('click', function () { choose('granted'); });
          el.querySelector('.cb-decline').addEventListener('click', function () { choose('denied'); });
        }
        function init() {
          var c = null;
          try { c = localStorage.getItem(KEY); } catch (e) {}
          if (c === 'granted') loadGA();
          else if (c !== 'denied') showBanner();
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
        else init();
      })();
    </script>

    <style>
      /* Appen sköter sitt eget tema i JS (ThemeContext) och landningssidan är en
         fast ljus varumärkessida. Deklarera color-scheme så Chromes "Auto dark
         theme" inte algoritmiskt mörkar sidan (annars blev landningens mörkgröna
         "Handlis"-ordmärke svart på en auto-mörkad bakgrund i OS-dark). */
      :root { color-scheme: light dark; }
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
      /* GDPR-cookiebanner (varumärkesgrön, fast nederkant). */
      #cookie-banner { position: fixed; left: 0; right: 0; bottom: 0; z-index: 99999; background: #2f5340; color: #f1efec; box-shadow: 0 -2px 14px rgba(0,0,0,0.28); }
      #cookie-banner .cb-inner { max-width: 900px; margin: 0 auto; padding: 14px 18px; display: flex; gap: 14px; align-items: center; flex-wrap: wrap; justify-content: center; }
      #cookie-banner .cb-text { font-family: system-ui, -apple-system, sans-serif; font-size: 13.5px; line-height: 1.5; flex: 1; min-width: 220px; }
      #cookie-banner .cb-actions { display: flex; gap: 10px; }
      #cookie-banner button { font-family: system-ui, -apple-system, sans-serif; font-size: 14px; font-weight: 600; border-radius: 8px; padding: 9px 18px; cursor: pointer; border: none; }
      #cookie-banner .cb-accept { background: #b96a45; color: #fff; }
      #cookie-banner .cb-decline { background: transparent; color: #cdd8ce; border: 1px solid rgba(255,255,255,0.3); }
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
