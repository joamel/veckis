/**
 * En Cloudinary-bild i den bredd den faktiskt visas i. Originalen är ofta
 * flera tusen pixlar breda, och i stora ikoner-läget ligger alla kort
 * monterade samtidigt: fullstora bilder där fick övergången in i ett recept
 * att hacka. Andra adresser än Cloudinarys lämnas som de är.
 */
export function cloudinaryOptimized(url: string, width = 800): string {
  const idx = url.indexOf('/upload/');
  if (idx === -1 || !url.includes('res.cloudinary.com')) return url;
  return url.slice(0, idx + 8) + `w_${width},q_auto,f_auto/` + url.slice(idx + 8);
}

/** Receptkort i murverket: halva skärmbredden, gånger pixeltätheten. */
export const CARD_IMAGE_WIDTH = 600;
/** Miniatyren på de kompakta raderna, 60 dp. */
export const THUMB_IMAGE_WIDTH = 200;
