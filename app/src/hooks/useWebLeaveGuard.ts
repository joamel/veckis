import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Varnar innan fliken laddas om eller stängs med osparade ändringar.
 *
 * Täcker BARA omladdning, stängd flik och navigering bort från appen —
 * webbläsarens egen dialog, vars text inte går att styra. Bakåtknappen inuti
 * appen hanteras av `usePreventRemove` från React Navigation.
 *
 * En tidigare version försökte fånga bakåtknappen här genom att lägga in en
 * extra historikpost och fånga `popstate`. Det fungerade inte: expo-router har
 * en egen historikintegration, och manipulationen fick skärmen att lämnas ändå
 * och renderas om. Historiken ägs av routern — inte av en enskild skärm.
 */
export function useWebLeaveGuard(active: boolean) {
  useEffect(() => {
    if (Platform.OS as any !== 'web' || !active) return;
    if (typeof window === 'undefined') return;

    const varning = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Krävs av äldre webbläsare; moderna ignorerar strängen och visar sin egen.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', varning);
    return () => window.removeEventListener('beforeunload', varning);
  }, [active]);
}
