-- Migracion aditiva para DEV: solo crea/configura Administradores y agrega admins.
-- No modifica temporadas, entrenadores ni otros datos de negocio.
-- Reemplaza el unico marcador de PIN antes de ejecutar en Supabase SQL Editor.

BEGIN;

CREATE TABLE IF NOT EXISTS public."Administradores" (
  "ID" text PRIMARY KEY,
  "Email" text NOT NULL UNIQUE,
  "PIN" text NOT NULL,
  "Activo" boolean NOT NULL DEFAULT true
);

ALTER TABLE public."Administradores" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Administradores" FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public."Administradores" TO service_role;

-- Copia admins legacy sin cambiar filas de Entrenadores.
INSERT INTO public."Administradores" ("ID", "Email", "PIN", "Activo")
SELECT gen_random_uuid()::text, lower(trim("Email")), "PIN", true
FROM public."Entrenadores"
WHERE "EsAdmin" IS TRUE
  AND nullif(trim("Email"), '') IS NOT NULL
  AND nullif(trim("PIN"), '') IS NOT NULL
ON CONFLICT ("Email") DO NOTHING;

-- Configura la cuenta solicitada. Solo actualiza esa fila si ya existe.
DO $$
DECLARE
  admin_pin text := '__INTRODUCIR_PIN_ADMIN_DEV__';
BEGIN
  IF admin_pin = chr(95) || 'INTRODUCIR_PIN_ADMIN_DEV' || chr(95) THEN
    RAISE EXCEPTION 'Reemplaza el marcador por el PIN privado antes de ejecutar esta migracion.';
  END IF;

  INSERT INTO public."Administradores" ("ID", "Email", "PIN", "Activo")
  VALUES (gen_random_uuid()::text, 'vnpablo2002@gmail.com', admin_pin, true)
  ON CONFLICT ("Email") DO UPDATE
  SET "PIN" = EXCLUDED."PIN",
      "Activo" = true;
END;
$$;

COMMIT;
