import { convertToMetric } from '@veckis/shared';

/**
 * Räknar om mått och temperaturer INNE i en tillagningstext.
 *
 * Översättningen görs av en modell, men siffrorna gör den INTE: en modell som
 * räknar om "400°F" i förbifarten är precis den sortens fel som ser rimligt ut
 * och aldrig upptäcks. Här är regeln i stället deterministisk och testad.
 *
 * Ordalydelsen rörs inte i övrigt — bara talen och enheterna byts ut på plats.
 */

/** Fahrenheit → Celsius, avrundat till närmaste femtal (ugnar har inte
 *  finare gradering, och "204 °C" ser ut som en mätning snarare än ett mått). */
export function fahrenheitToCelsius(f: number): number {
  return Math.round(((f - 32) * 5 / 9) / 5) * 5;
}

// "400°F", "400 °F", "400F", "400 degrees F", "400 degrees Fahrenheit".
const FAHRENHEIT_RE = /(\d{2,3})\s*(?:°\s*F\b|degrees?\s*F(?:ahrenheit)?\b|\bF\b)/gi;

// "2 cups", "1 1/2 cups", "3 tablespoons", "8 oz" — mängd + engelsk enhet.
const IMPERIAL_RE = /(\d+(?:\s+\d+\/\d+|[.,]\d+|\/\d+)?)\s*(cups?|tablespoons?|tbsp|teaspoons?|tsp|ounces?|oz|pounds?|lbs?|pints?|quarts?|gallons?|sticks?)\b/gi;

/** "1 1/2" → 1.5, "1,5" → 1.5, "3/4" → 0.75. */
function parseAmount(raw: string): number | null {
  const s = raw.trim();
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Snyggt tal: inga onödiga decimaler, komma som decimaltecken. */
function formatAmount(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return String(rounded).replace('.', ',');
}

/**
 * Byter ut amerikanska mått och temperaturer mot svenska i en text.
 * Returnerar texten oförändrad när inget hittas.
 */
export function convertUnitsInText(text: string): string {
  return text
    .replace(FAHRENHEIT_RE, (hel, grader: string) => {
      const c = fahrenheitToCelsius(Number(grader));
      return Number.isFinite(c) ? `${c} °C` : hel;
    })
    .replace(IMPERIAL_RE, (hel, mängd: string, enhet: string) => {
      const amount = parseAmount(mängd);
      if (amount === null) return hel;
      const converted = convertToMetric(amount, enhet.toLowerCase());
      return converted ? `${formatAmount(converted.quantity)} ${converted.unit}` : hel;
    });
}
