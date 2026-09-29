-- Apply this once to the existing PRO Supabase project.
-- Replace the one PIN placeholder before executing; do not commit that value.

CREATE TABLE IF NOT EXISTS public."Administradores" (
  "ID" text PRIMARY KEY,
  "Email" text NOT NULL UNIQUE,
  "PIN" text NOT NULL,
  "Activo" boolean NOT NULL DEFAULT true
);

ALTER TABLE public."Administradores" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Administradores" FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public."Administradores" TO service_role;

-- Preserve trainers already marked as admins in the old schema.
INSERT INTO public."Administradores" ("ID", "Email", "PIN", "Activo")
SELECT gen_random_uuid()::text, lower(trim("Email")), "PIN", true
FROM public."Entrenadores"
WHERE "EsAdmin" IS TRUE
  AND nullif(trim("Email"), '') IS NOT NULL
  AND nullif(trim("PIN"), '') IS NOT NULL
ON CONFLICT ("Email") DO NOTHING;

-- Enter the requested private PIN in place of the placeholder before running.
DO $$
DECLARE
  admin_pin text := '__INTRODUCIR_PIN_ADMIN__';
BEGIN
  IF admin_pin = chr(95) || 'INTRODUCIR_PIN_ADMIN' || chr(95) THEN
    RAISE EXCEPTION 'Set the private admin PIN in the bootstrap script before executing.';
  END IF;

  INSERT INTO public."Administradores" ("ID", "Email", "PIN", "Activo")
  VALUES (gen_random_uuid()::text, 'vnpablo2002@gmail.com', admin_pin, true)
  ON CONFLICT ("Email") DO UPDATE
  SET "PIN" = EXCLUDED."PIN",
      "Activo" = true;
END;
$$;

-- Keep exactly one active season and create/update the 2026-2027 season.
UPDATE public."Temporadas" SET "Activa" = false WHERE "Activa" IS TRUE;

DO $$
DECLARE
  season_id text;
BEGIN
  SELECT "ID" INTO season_id
  FROM public."Temporadas"
  WHERE "Nombre" = 'CB Baeza Baloncesto 2026-2027'
  ORDER BY "ID"
  LIMIT 1;

  IF season_id IS NULL THEN
    INSERT INTO public."Temporadas" ("ID", "Nombre", "FechaInicio", "FechaFin", "Activa")
    VALUES (
      gen_random_uuid()::text,
      'CB Baeza Baloncesto 2026-2027',
      '2026-09-01',
      '2027-06-30',
      true
    );
  ELSE
    UPDATE public."Temporadas"
    SET "FechaInicio" = '2026-09-01',
        "FechaFin" = '2027-06-30',
        "Activa" = true
    WHERE "ID" = season_id;
  END IF;
END;
$$;