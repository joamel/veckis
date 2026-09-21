/**
 * Uträkningen bakom tangentbordslyftet i bottom-sheets — utbruten ur
 * useSheetLift för att kunna testas, eftersom just den här räkningen har
 * gått fel två gånger i rad ute hos användare.
 *
 * Problemet den löser: lyftet mäts med measureInWindow, som ger fältets
 * position MED det lyft som redan renderats. Mätningen körs flera gånger per
 * fokus (revealFocused anropas både från onFocus och keyboardDidShow, och
 * varje anrop mäter två gånger för att fånga sent utlagda fält). Räknade man
 * varje gång "naturlig botten = y + nuvarande lyft + höjd" kunde en sen
 * mätning läsa en GAMMAL y ihop med ett REDAN UPPDATERAT lyft — och då
 * adderades lyftet en gång till, så arket flög upp förbi fältet.
 *
 * Lösningen: fältets naturliga (olyfta) botten är ett fast tal så länge man
 * står i samma fält. Den låses vid första giltiga mätningen, och alla senare
 * mätningar räknar från den. Lyftet blir då idempotent: hur många gånger man
 * än mäter landar man på samma värde.
 */

export type Mätning = {
  /** Fältets y i fönstret, som measureInWindow rapporterar den. */
  y: number;
  /** Fältets höjd. */
  h: number;
  /** Lyftet som FAKTISKT är renderat just nu (inte Reacts senaste state). */
  renderatLyft: number;
};

export type Lyftvillkor = {
  windowHeight: number;
  /** Tangentbordets höjd, som den rapporterats av keyboardDidShow. */
  kbHöjd: number;
  /** Extra px att hålla synliga UNDER fältet, t.ex. enhets-chipsraden. */
  revealBelow?: number;
};

/** Luft mellan fältets underkant och tangentbordet. */
const LUFT = 20;
/** Tangentbordet antas aldrig täcka mer än halva skärmen. */
const MAX_TANGENTBORDSANDEL = 0.5;

export function skapaLyftberäknare(maxLyftandel = 0.6) {
  let naturligBotten: number | null = null;

  return {
    /** Nytt fält (eller stängt tangentbord) → mät om från grunden. */
    nollställ() {
      naturligBotten = null;
    },

    /** Vad lyftet ska vara efter den här mätningen. */
    beräkna(mätning: Mätning, villkor: Lyftvillkor): number {
      const { windowHeight, kbHöjd, revealBelow = 0 } = villkor;
      const kbH = Math.min(kbHöjd, windowHeight * MAX_TANGENTBORDSANDEL);

      naturligBotten ??= mätning.y + mätning.renderatLyft + mätning.h;

      const mål = naturligBotten + LUFT + revealBelow - (windowHeight - kbH);
      return Math.max(0, Math.min(mål, windowHeight * maxLyftandel));
    },
  };
}
