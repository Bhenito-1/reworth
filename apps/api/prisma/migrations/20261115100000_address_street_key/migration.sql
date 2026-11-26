-- Street index for geocode anchoring (same road, same area).
ALTER TABLE "addresses" ADD COLUMN "streetKey" TEXT;
ALTER TABLE "addresses" ADD COLUMN "geocodeSource" TEXT;

CREATE INDEX "addresses_city_community_streetKey_idx"
  ON "addresses" ("city", "community", "streetKey")
  WHERE "geoLat" IS NOT NULL AND "streetKey" IS NOT NULL;

UPDATE "addresses"
SET "streetKey" = LOWER(
  TRIM(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        TRIM(
          REGEXP_REPLACE(
            TRIM("line1"),
            '^\d{1,5}\s*[a-zA-Z]?(\s*[-/]\s*|\s+)',
            '',
            'i'
          )
        ),
        '[.,/#!$%^&*;:{}=\-_`~()]',
        ' ',
        'g'
      ),
      '\s+',
      ' ',
      'g'
    )
  )
)
WHERE "streetKey" IS NULL AND length(trim("line1")) > 0;