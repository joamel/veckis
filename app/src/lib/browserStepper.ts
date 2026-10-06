// Kategoribläddrarens − antal + per vara. Antalet visar vad som redan ligger
// på listan; + och − ändrar den raden i stället för att lägga till en ny
// (förr blev varje extra tryck en egen rad och ett dubblettark).

type Item = { id: string; quantity: number | null; unit: string | null; isChecked: boolean; name: string };

// Enheter där ett steg på 1 är meningsfullt. "400 g" stegas inte till 401 g.
const COUNT_UNITS = new Set(['', 'st', 'förp', 'paket', 'burk', 'påse', 'flaska', 'pkt']);

export type BrowserStepper<T> =
  | { mode: 'count'; count: number; target: T | null }
  | { mode: 'measure'; quantity: number | null; unit: string; target: T };

export function browserStepperFor<T extends Item>(items: T[], name: string): BrowserStepper<T> {
  const key = name.trim().toLowerCase();
  const onList = items.filter(i => !i.isChecked && i.name.trim().toLowerCase() === key);
  const countItem = onList.find(i => COUNT_UNITS.has((i.unit ?? '').trim().toLowerCase()));
  if (countItem) return { mode: 'count', count: countItem.quantity ?? 1, target: countItem };
  if (onList.length > 0) {
    const t = onList[0];
    return { mode: 'measure', quantity: t.quantity, unit: (t.unit ?? '').trim(), target: t };
  }
  return { mode: 'count', count: 0, target: null };
}
