-- Ejecutar una vez en cada base DEV y PRO antes de publicar el nuevo código.
-- Los nombres completos originales se conservan antes de dividirse.
ALTER TABLE public."Jugadores"
  ADD COLUMN IF NOT EXISTS "TelefonoPadre1" text,
  ADD COLUMN IF NOT EXISTS "TelefonoPadre2" text,
  ADD COLUMN IF NOT EXISTS "ApellidosPadre1" text,
  ADD COLUMN IF NOT EXISTS "ApellidosPadre2" text,
  ADD COLUMN IF NOT EXISTS "NombrePadre1Original" text,
  ADD COLUMN IF NOT EXISTS "NombrePadre2Original" text,
  ADD COLUMN IF NOT EXISTS "NotificarAusenciasPadre1" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "NotificarAusenciasPadre2" boolean NOT NULL DEFAULT true;

UPDATE public."Jugadores"
SET "NombrePadre1Original" = "NombrePadre1"
WHERE "NombrePadre1Original" IS NULL AND NULLIF(BTRIM("NombrePadre1"), '') IS NOT NULL;

UPDATE public."Jugadores"
SET "NombrePadre2Original" = "NombrePadre2"
WHERE "NombrePadre2Original" IS NULL AND NULLIF(BTRIM("NombrePadre2"), '') IS NOT NULL;

UPDATE public."Jugadores"
SET "NombrePadre1" = SPLIT_PART(REGEXP_REPLACE(BTRIM("NombrePadre1Original"), '\s+', ' ', 'g'), ' ', 1),
    "ApellidosPadre1" = REGEXP_REPLACE(REGEXP_REPLACE(BTRIM("NombrePadre1Original"), '\s+', ' ', 'g'), '^[^ ]+[ ]*', '')
WHERE "ApellidosPadre1" IS NULL AND NULLIF(BTRIM("NombrePadre1Original"), '') IS NOT NULL;

UPDATE public."Jugadores"
SET "NombrePadre2" = SPLIT_PART(REGEXP_REPLACE(BTRIM("NombrePadre2Original"), '\s+', ' ', 'g'), ' ', 1),
    "ApellidosPadre2" = REGEXP_REPLACE(REGEXP_REPLACE(BTRIM("NombrePadre2Original"), '\s+', ' ', 'g'), '^[^ ]+[ ]*', '')
WHERE "ApellidosPadre2" IS NULL AND NULLIF(BTRIM("NombrePadre2Original"), '') IS NOT NULL;

NOTIFY pgrst, 'reload schema';