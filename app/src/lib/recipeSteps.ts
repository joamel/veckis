// Ett recepts steg lagras som EN text (`instructions`) med ett steg per rad.
// Redigeringen visar varje steg som ett eget fält; de här funktionerna går
// mellan de två formerna.

// "1.", "2)", "3 ." först på raden — fälten numreras ändå.
const NUMBERING = /^\d+\s*[.)]\s*/;

const cleanLine = (line: string) => line.trim().replace(NUMBERING, '');

/** Text → steg att redigera. Tomma rader och inledande numrering faller bort.
 *  Aldrig tom lista: ett tomt recept får ett tomt första steg att skriva i. */
export function splitSteps(text: string): string[] {
  const steps = text.split(/\r?\n/).map(cleanLine).filter(Boolean);
  return steps.length > 0 ? steps : [''];
}

/** Steg → text att spara. Tomma steg (t.ex. ett nyss skapat) sparas inte. */
export function joinSteps(steps: string[]): string {
  return steps.map(s => s.trim()).filter(Boolean).join('\n');
}

/** Samma recept oavsett numrering och tomma rader — för "osparade ändringar". */
export function sameSteps(a: string, b: string): boolean {
  return joinSteps(splitSteps(a)) === joinSteps(splitSteps(b));
}

/** Ett fält vars text fått radbrytningar (Enter på webben, inklistring) delas
 *  upp: första delen stannar i steget, resten blir nya steg efter det. */
export function applyStepText(steps: string[], idx: number, text: string): { steps: string[]; focusIdx: number } {
  const parts = text.split(/\r?\n/);
  if (parts.length === 1) {
    const next = [...steps];
    next[idx] = text;
    return { steps: next, focusIdx: idx };
  }
  const [first, ...rest] = parts;
  const extra = rest.map(cleanLine);
  const next = [...steps.slice(0, idx), cleanLine(first), ...extra, ...steps.slice(idx + 1)];
  return { steps: next, focusIdx: idx + extra.length };
}
