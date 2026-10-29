// Testfunktioner: nya saker som bara appadmin ser innan de går ut till alla.
//
// OTA:er når alla (appen frågar alltid efter kanalen "production"), så nytt
// gränssnitt göms i stället bakom en flagga. Flaggorna slås på per telefon på
// adminsidans flik "Sandbox", som bara appadmin når. Allt är AV som standard.
//
// Bara GRÄNSSNITTET går att gömma — backend-ändringar når alla direkt och
// måste fungera även för den som inte ser funktionen.
//
// REGEL: varje flagga får en punkt i BACKLOG_AFTER_PROD.md när den skapas, och
// tas bort (flaggan + grenarna i koden) när funktionen släpps eller slängs.
// Texterna ligger i svenska.ts under admin.sandbox.
import { useSyncExternalStore } from 'react';
import * as SecureStore from './secureStorage';

export const EXPERIMENTS = [
  // Dev-läge: allt som är under utveckling, på en gång. Just nu bara
  // förslaget på kategoriordning ur en enda handling (backend godtar det bara
  // från appadmin), så kortet går att prova utan fyra handlingar. Laga-lägets
  // klocka och timrar, "Ändra mängd" och "Dela mall" släpptes 2026-10-26.
  // Instagram-kontot i appen (2026-10-29): rad i Inställningar, tips i
  // veckomenyns tomläge, engångskort efter en planerad vecka ur en mall.
  'dev-mode',
] as const;

export type ExperimentId = typeof EXPERIMENTS[number];

const storageKey = (id: ExperimentId) => `experiment-${id}`;
const enabled = new Set<ExperimentId>();
const listeners = new Set<() => void>();
let version = 0;
let loading: Promise<void> | null = null;

function notify() {
  version++;
  listeners.forEach(l => l());
}

function load(): Promise<void> {
  if (!loading) {
    loading = Promise.all(EXPERIMENTS.map(async id => {
      const v = await SecureStore.getItemAsync(storageKey(id)).catch(() => null);
      if (v === '1') enabled.add(id);
    })).then(notify);
  }
  return loading;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  void load();
  return () => { listeners.delete(listener); };
}

export async function setExperiment(id: ExperimentId, on: boolean): Promise<void> {
  if (on) enabled.add(id); else enabled.delete(id);
  notify();
  if (on) await SecureStore.setItemAsync(storageKey(id), '1').catch(() => {});
  else await SecureStore.deleteItemAsync(storageKey(id)).catch(() => {});
}

/** Är testfunktionen påslagen på den här telefonen? */
export function useExperiment(id: ExperimentId): boolean {
  useSyncExternalStore(subscribe, () => version, () => version);
  return enabled.has(id);
}
