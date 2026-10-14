-- Ejecutar en DEV y PRO, incluso si migrate-contacto-familia-y-notificaciones.sql ya se aplico.
-- Conserva el texto completo anterior y propone primer termino como nombre, resto como apellidos.
ALTER TABLE public."Jugadores"
  ADD COLUMN IF NOT EXISTS "ApellidosPadre1" text,
  ADD COLUMN IF NOT EXISTS "ApellidosPadre2" text,
  ADD COLUMN IF NOT EXISTS "NombrePadre1Original" text,
  ADD COLUMN IF NOT EXISTS "NombrePadre2Original" text;

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
