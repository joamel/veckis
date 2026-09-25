import { describe, it, expect } from 'vitest';
import { delaAlternativ } from './alternativ';

describe('delaAlternativ', () => {
  it('delar på eller, alt och alternativt', () => {
    expect(delaAlternativ('nötfärs alt. vegofärs')).toEqual(['nötfärs', 'vegofärs']);
    expect(delaAlternativ('smör alternativt margarin')).toEqual(['smör', 'margarin']);
    expect(delaAlternativ('körsbärstomater eller romanticatomater')).toEqual(['körsbärstomater', 'romanticatomater']);
  });

  it('delar på snedstreck — "lax/torsk" är två varor', () => {
    expect(delaAlternativ('lax/torsk')).toEqual(['lax', 'torsk']);
    expect(delaAlternativ('lax/torsk/alaska pollock')).toEqual(['lax', 'torsk', 'alaska pollock']);
    expect(delaAlternativ('penne/fusilli')).toEqual(['penne', 'fusilli']);
    expect(delaAlternativ('pommes / potatis')).toEqual(['pommes', 'potatis']);
  });

  it('delar på plus — "vin+öl" är två varor man behöver båda', () => {
    expect(delaAlternativ('vin+öl')).toEqual(['vin', 'öl']);
    expect(delaAlternativ('vin + öl')).toEqual(['vin', 'öl']);
    expect(delaAlternativ('salt+svartpeppar')).toEqual(['salt', 'svartpeppar']);
  });

  it('rör inte plus utan andra led, eller när ett led är okänt', () => {
    // Plus sist i ett produktnamn är ingen uppräkning.
    expect(delaAlternativ('kvarg+')).toEqual(['kvarg+']);
    // Samma försiktighet som för "och": båda sidor måste vara kända varor.
    expect(delaAlternativ('vin+xyzzy')).toEqual(['vin+xyzzy']);
  });

  it('rör inte snedstreck mellan siffror', () => {
    // "1/2 gurka" är ett bråktal, inte två varor.
    expect(delaAlternativ('1/2 gurka')).toEqual(['1/2 gurka']);
  });

  it('hoppar över led med bindestreck först', () => {
    // "grönsakstärning/-fond": förledet går inte att räkna ut.
    expect(delaAlternativ('grönsakstärning/-fond')).toEqual(['grönsakstärning']);
  });

  it('fyller i efterledet vid hopdragna uppräkningar', () => {
    // Bindestrecket står för efterledet i det sista alternativet.
    expect(delaAlternativ('vego- bland- eller hushållsfärs')).toEqual(['vegofärs', 'blandfärs', 'hushållsfärs']);
    expect(delaAlternativ('havre- eller sojadryck')).toEqual(['havredryck', 'sojadryck']);
  });

  it('hoppar över led som inte går att rekonstruera', () => {
    // Okänt efterled: hellre inget än ett halvt ord som vara.
    expect(delaAlternativ('kall- eller pyttipanna')).toEqual(['pyttipanna']);
  });

  it('klarar kommauppräkning före kopplingen', () => {
    expect(delaAlternativ('vego-, bland- eller hushållsfärs')).toEqual(['vegofärs', 'blandfärs', 'hushållsfärs']);
  });

  it('delar "och" när båda sidor är kända varor', () => {
    // Två varor, inte en — och till skillnad från "eller" behöver man båda.
    expect(delaAlternativ('salt och svartpeppar')).toEqual(['salt', 'svartpeppar']);
    expect(delaAlternativ('salt och vitpeppar')).toEqual(['salt', 'vitpeppar']);
  });

  it('delar INTE produktnamn som innehåller och', () => {
    // "kött- och grillkrydda" är EN krydda; bindestrecket avslöjar det.
    expect(delaAlternativ('knorr kött- och grillkrydda')).toEqual(['knorr kött- och grillkrydda']);
    // Okänd högersida → vi vet för lite, lämna ifred.
    expect(delaAlternativ('salt och wnmbox')).toEqual(['salt och wnmbox']);
  });

  it('lämnar vanliga namn orörda', () => {
    expect(delaAlternativ('rökt skinka')).toEqual(['rökt skinka']);
    expect(delaAlternativ('mjölk')).toEqual(['mjölk']);
  });
});
