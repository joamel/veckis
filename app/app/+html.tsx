// Expo Router web-template — wrappar varje statisk-exporterad HTML-sida.
// Här lägger vi PWA-metadata (manifest, theme-color, icons), viewport, och
// registrerar service workern. Komponenten renderas BARA på server/build
// (statisk export), inte i klient-runtime — så ingen "use client".
import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="sv">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />

        {/* PWA */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#7c3aed" />
        <meta name="application-name" content="Veckis" />

        {/* Icons */}
        <link rel="icon" href="/favicon.png" sizes="48x48" />
        <link rel="icon" href="/icon-192.png" sizes="192x192" />
        <link rel="icon" href="/icon-512.png" sizes="512x512" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />

        {/* iOS Safari standalone-mode + statusbar-styling */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Veckis" />
        <meta name="mobile-web-app-capable" content="yes" />

        <title>Veckis</title>

        {/* Expo Router-rekommendation: nollställer scroll på root så
            ScrollView fungerar deterministiskt på web. */}
        <ScrollViewStyleReset />

        {/* SW-registrering — körs bara om browsern stödjer service workers.
            navigator.serviceWorker finns i alla moderna browsers; vi gate:ar
            för säkerhets skull och fail:ar tyst (PWA-funktioner går då
            förlorade men appen funkar fortfarande). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function () {
                  navigator.serviceWorker.register('/sw.js').catch(function (e) {
                    console.warn('SW-registrering misslyckades:', e);
                  });
                });
              }
            `,
          }}
        />

        {/* Web-only baseline-styling så html/body fyller viewport och
            bakgrunden matchar splash innan React hydratar. */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body { margin: 0; padding: 0; height: 100%; background: #f5f3ff; }
              #root { height: 100%; }
              @media (prefers-color-scheme: dark) {
                html, body { background: #f5f3ff; }
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
