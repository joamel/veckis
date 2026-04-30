// Swedish prep/descriptor words that are safe to strip from ingredient names
const PREP_WORDS = new Set([
  // Cutting/chopping
  'hackad', 'hackade', 'finhackad', 'finhackade', 'grovhackad', 'grovhackade',
  'skuren', 'skurna', 'strimlad', 'strimlat', 'strimlad',
  'klyftad', 'klyftade',
  // Grating
  'riven', 'rivna', 'finriven', 'finrivna', 'grovriven', 'grovrivna',
  // Pressing/crushing
  'pressad', 'pressade', 'krossad', 'krossade', 'mosad', 'mosade',
  // Peeled/cleaned
  'skalad', 'skalade', 'sköljd', 'sköljda', 'putsad', 'putsade', 'välputsad', 'välputsade',
  'urkönad', 'urkörnade', 'urkärnad', 'urkärnade',
  // Temperature state
  'fryst', 'frysta', 'tinad', 'tinade', 'rumstempererad', 'rumstempererade',
  'kall', 'kallt', 'kalla', 'varm', 'varmt', 'varma',
  'smält', 'smälta',
  // Cooked
  'kokt', 'kokta', 'stekt', 'stekta', 'grillad', 'grillade', 'rostad', 'rostade',
  // Shape/size
  'halverad', 'halverade', 'delad', 'delade', 'hel', 'hela',
  // Consistency/grind
  'mald', 'malda', 'mixad', 'mixade',
  // Dried
  'torkad', 'torkade',
  // Size descriptors (context-free)
  'liten', 'litet', 'lilla', 'stor', 'stora', 'stort', 'grov', 'grovt', 'grova', 'fin', 'fint', 'fina',
  'mjuk', 'mjukt', 'mjuka',
]);

// Introductory approximation words
const APPROX_PREFIX = /^(ca\.?\s*|ungefär\s*|circa\s*|typ\s*)/i;

export function stripIngredient(raw: string): string {
  let s = raw.trim();

  // Remove parenthetical content
  s = s.replace(/\s*\([^)]*\)\s*/g, ' ').trim();

  // Remove approximation prefix
  s = s.replace(APPROX_PREFIX, '').trim();

  // If comma present, check if what follows is a prep description
  const commaIdx = s.indexOf(',');
  if (commaIdx > 0) {
    const afterComma = s.slice(commaIdx + 1).trim().toLowerCase();
    const firstWord = afterComma.split(/\s+/)[0];
    if (!firstWord || PREP_WORDS.has(firstWord)) {
      s = s.slice(0, commaIdx).trim();
    }
  }

  // Strip trailing prep words
  const words = s.split(/\s+/);
  while (words.length > 1 && PREP_WORDS.has(words[words.length - 1].toLowerCase())) {
    words.pop();
  }

  return words.join(' ').toLowerCase().trim();
}
