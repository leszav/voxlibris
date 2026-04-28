-- Migration 0039: Backfill book_genres from legacy personal_books.genre and club_books.genre
-- Safety + idempotency: INSERT guarded by NOT EXISTS, updates are conditional.

-- 1) Personal books -> book_genres
WITH personal_matches AS (
  SELECT
    pb."id" AS book_id,
    g."id" AS genre_id,
    row_number() OVER (PARTITION BY pb."id" ORDER BY g."sort_order" ASC, g."label_ru" ASC, g."id" ASC) AS rn
  FROM "personal_books" pb
  JOIN "genres" g
    ON lower(trim(pb."genre")) = lower(g."label_ru")
    OR lower(trim(pb."genre")) = lower(g."code")
  WHERE pb."genre" IS NOT NULL
    AND trim(pb."genre") <> ''
    AND NOT EXISTS (
      SELECT 1
      FROM "book_genres" bg
      WHERE bg."book_type" = 'personal'
        AND bg."book_id" = pb."id"
        AND bg."genre_id" = g."id"
    )
)
INSERT INTO "book_genres" ("book_id", "book_type", "genre_id", "source", "is_primary", "confidence")
SELECT
  pm."book_id",
  'personal',
  pm."genre_id",
  'migration',
  pm.rn = 1 AND NOT EXISTS (
    SELECT 1
    FROM "book_genres" bgp
    WHERE bgp."book_type" = 'personal'
      AND bgp."book_id" = pm."book_id"
      AND bgp."is_primary" = true
  ),
  100
FROM personal_matches pm;

-- 2) Club books -> book_genres
WITH club_matches AS (
  SELECT
    cb."id" AS book_id,
    g."id" AS genre_id,
    row_number() OVER (PARTITION BY cb."id" ORDER BY g."sort_order" ASC, g."label_ru" ASC, g."id" ASC) AS rn
  FROM "club_books" cb
  JOIN "genres" g
    ON lower(trim(cb."genre")) = lower(g."label_ru")
    OR lower(trim(cb."genre")) = lower(g."code")
  WHERE cb."genre" IS NOT NULL
    AND trim(cb."genre") <> ''
    AND NOT EXISTS (
      SELECT 1
      FROM "book_genres" bg
      WHERE bg."book_type" = 'club'
        AND bg."book_id" = cb."id"
        AND bg."genre_id" = g."id"
    )
)
INSERT INTO "book_genres" ("book_id", "book_type", "genre_id", "source", "is_primary", "confidence")
SELECT
  cm."book_id",
  'club',
  cm."genre_id",
  'migration',
  cm.rn = 1 AND NOT EXISTS (
    SELECT 1
    FROM "book_genres" bgp
    WHERE bgp."book_type" = 'club'
      AND bgp."book_id" = cm."book_id"
      AND bgp."is_primary" = true
  ),
  100
FROM club_matches cm;

-- 3) Fill personal_books.primary_genre_id (only when empty)
UPDATE "personal_books" pb
SET "primary_genre_id" = bg."genre_id"
FROM "book_genres" bg
WHERE pb."id" = bg."book_id"
  AND bg."book_type" = 'personal'
  AND bg."is_primary" = true
  AND pb."primary_genre_id" IS NULL;

-- 4) Fill club_books.primary_genre_id (only when empty)
UPDATE "club_books" cb
SET "primary_genre_id" = bg."genre_id"
FROM "book_genres" bg
WHERE cb."id" = bg."book_id"
  AND bg."book_type" = 'club'
  AND bg."is_primary" = true
  AND cb."primary_genre_id" IS NULL;

SELECT 'Migration 0039 completed: backfilled book genres from legacy fields' AS result;
