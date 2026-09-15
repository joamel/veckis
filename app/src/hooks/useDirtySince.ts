import { useEffect, useRef } from 'react';

/**
 * Har formuläret ändrats sedan arket öppnades?
 *
 * Jämför mot en ÖGONBLICKSBILD av fälten tagen när `open` blev sant — inte mot
 * källobjektet. Formulär fylls ofta i med formatering ("2,5" i stället för
 * 2.5, versal i namnet), och en jämförelse mot källan hade då sagt "ändrat"
 * direkt vid öppning.
 *
 * `open` kan vara vad som helst som är sant medan arket är öppet: en boolean,
 * eller objektet som redigeras. Byts objektet (nästa vara) tas en ny bild.
 *
 * Ger false tills bilden tagits, så arket aldrig ser smutsigt ut i den första
 * renderingen efter öppning.
 */
export function useDirtySince(open: unknown, values: unknown[]): boolean {
  const snapshot = useRef<string | null>(null);
  const current = JSON.stringify(values);

  useEffect(() => {
    snapshot.current = open ? current : null;
    // Bara vid öppning/byte — inte vid varje tangenttryck, det är ju just
    // förändringen mot bilden vi vill mäta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return !!open && snapshot.current !== null && current !== snapshot.current;
}
