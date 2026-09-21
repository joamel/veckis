import { describe, expect, it } from 'vitest';
import { skapaLyftberäknare } from './lyftberakning';

// 800 px hög skärm, 320 px tangentbord → allt under y=480 är dolt.
const villkor = { windowHeight: 800, kbHöjd: 320 };

describe('skapaLyftberäknare', () => {
  it('lyfter inte ett fält som redan syns ovanför tangentbordet', () => {
    const b = skapaLyftberäknare();
    expect(b.beräkna({ y: 200, h: 40, renderatLyft: 0 }, villkor)).toBe(0);
  });

  it('lyfter precis så mycket att fältet syns med luft under', () => {
    const b = skapaLyftberäknare();
    // Botten = 560. Synlig yta slutar vid 480. 560 + 20 luft - 480 = 100.
    expect(b.beräkna({ y: 520, h: 40, renderatLyft: 0 }, villkor)).toBe(100);
  });

  it('ger samma lyft hur många gånger mätningen än körs', () => {
    const b = skapaLyftberäknare();
    const första = b.beräkna({ y: 520, h: 40, renderatLyft: 0 }, villkor);

    // Mätning 2 ser fältet flyttat och lyftet renderat — korrekt läge.
    expect(b.beräkna({ y: 420, h: 40, renderatLyft: 100 }, villkor)).toBe(första);

    // Mätning 3 är regressionen: en GAMMAL y (fältet ännu inte flyttat) ihop
    // med ett REDAN UPPDATERAT lyft. Utan låsning blev botten 520+100+40=660
    // och lyftet 200 — arket flög upp förbi fältet.
    expect(b.beräkna({ y: 520, h: 40, renderatLyft: 100 }, villkor)).toBe(första);

    // Och tvärtom: ny y men lyftet ännu inte rapporterat.
    expect(b.beräkna({ y: 420, h: 40, renderatLyft: 0 }, villkor)).toBe(första);
  });

  it('håller extra utrymme synligt under fältet', () => {
    const utan = skapaLyftberäknare().beräkna({ y: 520, h: 40, renderatLyft: 0 }, villkor);
    const med = skapaLyftberäknare().beräkna(
      { y: 520, h: 40, renderatLyft: 0 },
      { ...villkor, revealBelow: 80 },
    );
    expect(med - utan).toBe(80);
  });

  it('mäter om från grunden efter nollställning', () => {
    const b = skapaLyftberäknare();
    b.beräkna({ y: 520, h: 40, renderatLyft: 0 }, villkor);
    b.nollställ();
    // Nytt fält högre upp i arket, med förra fältets lyft kvar renderat.
    expect(b.beräkna({ y: 300, h: 40, renderatLyft: 100 }, villkor)).toBe(0);
  });

  it('klampar lyftet så att arket inte kan dras förbi skärmtoppen', () => {
    const b = skapaLyftberäknare();
    // Ett orimligt djupt fält skulle annars ge ett lyft större än skärmen.
    expect(b.beräkna({ y: 1400, h: 40, renderatLyft: 0 }, villkor)).toBe(800 * 0.6);
  });

  it('låter aldrig tangentbordet räknas som mer än halva skärmen', () => {
    const b = skapaLyftberäknare();
    // 600 px "tangentbord" klampas till 400 → samma svar som 400 ger.
    const klampat = b.beräkna({ y: 520, h: 40, renderatLyft: 0 }, { windowHeight: 800, kbHöjd: 600 });
    const referens = skapaLyftberäknare().beräkna(
      { y: 520, h: 40, renderatLyft: 0 },
      { windowHeight: 800, kbHöjd: 400 },
    );
    expect(klampat).toBe(referens);
  });
});
