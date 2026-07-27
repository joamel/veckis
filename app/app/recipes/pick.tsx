// Receptväljaren (selection mode) — EGEN pushad route så att Recept-FLIKEN
// (/recipes) alltid är ett rent bibliotek. Menyns dag-"+" pushar hit med
// forMenuDay/replaceMenuItemId-params; skärmen är samma komponent som fliken
// men här får den selection-params (banner + "välj rätt"-flöde), medan
// tab-tryck på Recept aldrig har params → inget "Fyll måndag" där.
export { default } from '../(tabs)/recipes';
