-- CreateTable
CREATE TABLE "UnitEquivalence" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "baseAmount" DOUBLE PRECISION NOT NULL,
    "baseUnit" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "seenCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitEquivalence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UnitEquivalence_name_unit_key" ON "UnitEquivalence"("name", "unit");

-- CreateIndex
CREATE INDEX "UnitEquivalence_name_idx" ON "UnitEquivalence"("name");

-- Seed: kuraterade typiska svenska förpackningsstorlekar (source='seed').
-- Namnen matchar stripIngredient()-output (t.ex. "kikärtor" → "kikärt").
INSERT INTO "UnitEquivalence" ("id", "name", "unit", "baseAmount", "baseUnit", "source", "seenCount", "updatedAt") VALUES
  ('seed-krossade-tomater-paket', 'krossade tomater', 'paket', 400, 'g',  'seed', 1, CURRENT_TIMESTAMP),
  ('seed-krossade-tomater-burk',  'krossade tomater', 'burk',  400, 'g',  'seed', 1, CURRENT_TIMESTAMP),
  ('seed-passerade-tomater-paket','passerade tomater','paket', 500, 'g',  'seed', 1, CURRENT_TIMESTAMP),
  ('seed-kokosmjolk-burk',        'kokosmjölk',       'burk',  400, 'ml', 'seed', 1, CURRENT_TIMESTAMP),
  ('seed-creme-fraiche-burk',     'crème fraiche',    'burk',  200, 'ml', 'seed', 1, CURRENT_TIMESTAMP),
  ('seed-graddfil-burk',          'gräddfil',         'burk',  300, 'ml', 'seed', 1, CURRENT_TIMESTAMP),
  ('seed-smor-paket',             'smör',             'paket', 500, 'g',  'seed', 1, CURRENT_TIMESTAMP),
  ('seed-jast-paket',             'jäst',             'paket', 50,  'g',  'seed', 1, CURRENT_TIMESTAMP),
  ('seed-tomatpure-burk',         'tomatpuré',        'burk',  140, 'g',  'seed', 1, CURRENT_TIMESTAMP),
  ('seed-kikart-burk',            'kikärt',           'burk',  400, 'g',  'seed', 1, CURRENT_TIMESTAMP),
  ('seed-vita-bonor-burk',        'vita bönor',       'burk',  400, 'g',  'seed', 1, CURRENT_TIMESTAMP),
  ('seed-majs-burk',              'majs',             'burk',  340, 'g',  'seed', 1, CURRENT_TIMESTAMP),
  ('seed-bacon-paket',            'bacon',            'paket', 140, 'g',  'seed', 1, CURRENT_TIMESTAMP),
  ('seed-fetaost-paket',          'fetaost',          'paket', 150, 'g',  'seed', 1, CURRENT_TIMESTAMP),
  ('seed-halloumi-paket',         'halloumi',         'paket', 200, 'g',  'seed', 1, CURRENT_TIMESTAMP),
  ('seed-ansjovis-burk',          'ansjovis',         'burk',  125, 'g',  'seed', 1, CURRENT_TIMESTAMP)
ON CONFLICT ("name", "unit") DO NOTHING;
