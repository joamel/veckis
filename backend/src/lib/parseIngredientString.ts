/**
 * Flyttad till @veckis/shared (lib/itemLine.ts) — appen måste tolka rader
 * likadant som backenden, annars visar och lär den sig fel innan servern
 * hinner rätta. Den här filen är kvar som genväg för befintliga anrop.
 */
export { parseIngredientString, parseQuantity, parseItemLine, type ParsedItemLine } from '@veckis/shared';
