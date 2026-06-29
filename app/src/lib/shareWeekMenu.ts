import { Share } from 'react-native';
import type { WeekMenuItemWithRecipe } from '../api/client';

const DAY_LABELS: Record<string, string> = {
  mon: 'Måndag',
  tue: 'Tisdag',
  wed: 'Onsdag',
  thu: 'Torsdag',
  fri: 'Fredag',
  sat: 'Lördag',
  sun: 'Söndag',
};
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export async function shareWeekMenu(weekLabel: string, items: WeekMenuItemWithRecipe[]): Promise<void> {
  const sorted = [...items].sort((a, b) => {
    const ai = a.day ? DAY_ORDER.indexOf(a.day) : 7;
    const bi = b.day ? DAY_ORDER.indexOf(b.day) : 7;
    return ai - bi;
  });
  const lines = sorted.map(i => `${i.day ? (DAY_LABELS[i.day] ?? i.day) : 'Oplanerad'}: ${i.recipe.title}`);
  await Share.share({ message: `${weekLabel}:\n\n${lines.join('\n')}` });
}
