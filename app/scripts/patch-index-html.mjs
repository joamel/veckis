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
// Samma som src/lib/storeLinks.ts.
const APP_STORE = 'https://apps.apple.com/se/app/handlis/id6819080577';
const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.handlis.app&hl=sv';

const META = `
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
    <meta name="description" content="${DESCRIPTION}" />
    <link rel="canonical" href="${SITE}/" />
    <meta name="robots" content="index, follow" />
    <link rel="manifest" href="/manifest.json" />
    <meta name="theme-color" content="#1d3b2e" />
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
      #cookie-banner { position: fixed; left: 0; right: 0; bottom: 0; z-index: 99999; background: #1d3b2e; color: #f1f3ec; box-shadow: 0 -2px 14px rgba(0,0,0,0.28); }
      #cookie-banner .cb-inner { max-width: 900px; margin: 0 auto; padding: 14px 18px; display: flex; gap: 14px; align-items: center; flex-wrap: wrap; justify-content: center; }
      #cookie-banner .cb-text { font-family: system-ui, -apple-system, sans-serif; font-size: 13.5px; line-height: 1.5; flex: 1; min-width: 220px; }
      #cookie-banner .cb-actions { display: flex; gap: 10px; }
      #cookie-banner button { font-family: system-ui, -apple-system, sans-serif; font-size: 14px; font-weight: 600; border-radius: 8px; padding: 9px 18px; cursor: pointer; border: none; }
      #cookie-banner .cb-accept { background: #cde66b; color: #1d3b2e; }
      #cookie-banner .cb-decline { background: transparent; color: #9fbfa9; border: 1px solid rgba(255,255,255,0.3); }
    </style>
    <script>
      // SW-registrering + version-banner. När en ny SW tar över sätter vi
      // en global flagga som UI:t kan lyssna på (window.__veckisNewVersion).
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
          // Vid första besöket tar sw.js över sidan direkt (clients.claim),
          // och det ger också en controllerchange — men det är ingen ny
          // version. Bara ett byte från en tidigare worker räknas.
          var hadController = !!navigator.serviceWorker.controller;
          navigator.serviceWorker.register('/sw.js').then(function (reg) {
            navigator.serviceWorker.addEventListener('controllerchange', function () {
              if (!hadController) { hadController = true; return; }
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
let patched = html.replace('</head>', `${META}</head>`);

if (patched === html) {
  console.error('!! Hittade inte </head> i dist/index.html — patchen kördes inte.');
  process.exit(1);
}

// 4. Landningstexten som statisk HTML i #root. Appen byggs helt i JS, så utan
//    det här hämtar Google en tom sida och ser texten först om och när den
//    kör JavaScript. React tömmer #root när appen monteras, så blocket syns
//    bara tills dess — och samma text står synligt i WebLanding (ingen dold
//    text). Texterna läses ur svenska.ts så de aldrig glider isär.
const landing = await loadLanding();
const before = patched;
patched = patched.replace(/<div id="root">\s*<\/div>/, `<div id="root">${staticLanding(landing)}</div>`);
if (patched === before) {
  console.error('!! Hittade inte en tom <div id="root"> i dist/index.html — statisk landningstext saknas.');
  process.exit(1);
}
const faqLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: landing.faq.items.map(i => ({
    '@type': 'Question',
    name: i.q,
    acceptedAnswer: { '@type': 'Answer', text: i.a },
  })),
};
patched = patched.replace('</head>', `    <script type="application/ld+json">${JSON.stringify(faqLd).replace(/</g, '\\u003c')}</script>\n</head>`);

writeFileSync(indexPath, patched);
console.log('✓ Patchade dist/index.html med PWA + SEO/OG-metadata + statisk landningstext');

// svenska.ts är TypeScript och byggservern kör Node 20 (ingen type stripping),
// så filen transpileras med appens egen typescript och importeras som data-URL.
async function loadLanding() {
  const ts = (await import('typescript')).default;
  const src = readFileSync(join(here, '..', 'src', 'lib', 'svenska.ts'), 'utf8');
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  });
  const mod = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
  return mod.landing;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function staticLanding(l) {
  const features = [l.features.shopping, l.features.recipes, l.features.menu];
  return `
    <div id="seo-landing">
      <style>
        #seo-landing { font-family: system-ui, -apple-system, sans-serif; color: #1d3b2e; background: #faf8f3; }
        #seo-landing header { background: #1d3b2e; color: #fff; text-align: center; padding: 56px 20px; }
        #seo-landing h1 { font-size: 32px; line-height: 1.2; margin: 0 auto; max-width: 640px; }
        #seo-landing header p { color: #c9d8c0; font-size: 17px; line-height: 1.6; max-width: 560px; margin: 16px auto 0; }
        #seo-landing section { max-width: 720px; margin: 0 auto; padding: 36px 20px; }
        #seo-landing h2 { font-size: 24px; text-align: center; margin: 0 0 20px; }
        #seo-landing h3 { font-size: 17px; margin: 18px 0 6px; }
        #seo-landing p { font-size: 15px; line-height: 1.6; margin: 0; }
        #seo-landing a { color: #1d3b2e; font-weight: 700; }
      </style>
      <header>
        <h1>${esc(l.hero.tagline)}</h1>
        <p>${esc(l.hero.subtitle)}</p>
        <p><a href="${esc(APP_STORE)}" style="color:#cde66b">App Store</a> · <a href="${esc(PLAY_STORE)}" style="color:#cde66b">Google Play</a></p>
      </header>
      <section>
        <h2>${esc(l.flow.heading)}</h2>
        <p>${esc(l.flow.caption)}</p>
      </section>
      <section>
        <h2>${esc(l.features.heading)}</h2>
        ${features.map(f => `<h3>${esc(f.title)}</h3><p>${esc(f.body)}</p>`).join('\n        ')}
      </section>
      <section>
        <h2>${esc(l.faq.heading)}</h2>
        ${l.faq.items.map(i => `<h3>${esc(i.q)}</h3><p>${esc(i.a)}</p>`).join('\n        ')}
      </section>
      <section>
        <h2>${esc(l.cta.heading)}</h2>
        <p>${esc(l.cta.body)} <a href="/install">${esc(l.footer.install)}</a> · <a href="/privacy">${esc(l.footer.privacy)}</a> · <a href="/terms">${esc(l.footer.terms)}</a></p>
      </section>
    </div>
    <script>
      // Blocket är till för utloggade besökare på startsidan (och sökmotorer).
      // Inloggade, installerad PWA och andra adresser än / ska inte se det
      // blinka förbi innan appen monterats.
      (function () {
        var hide = location.pathname !== '/'
          || (window.matchMedia && matchMedia('(display-mode: standalone)').matches)
          || navigator.standalone === true;
        try { hide = hide || !!localStorage.getItem('active_household_id'); } catch (e) {}
        if (hide) { var el = document.getElementById('seo-landing'); if (el) el.parentNode.removeChild(el); }
      })();
    </script>
  `;
}
