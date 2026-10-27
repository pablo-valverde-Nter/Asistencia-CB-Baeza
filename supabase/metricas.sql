-- Aplicar antes de publicar la captura y las estadísticas de asistencia.
ALTER TABLE public."Sesiones"
  ADD COLUMN IF NOT EXISTS "ID_Horario" text,
  ADD COLUMN IF NOT EXISTS "Cancelada" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "MotivoCancelacion" text,
  ADD COLUMN IF NOT EXISTS "FechaCancelacion" text,
  ADD COLUMN IF NOT EXISTS "FechaPrimerRegistro" text;

ALTER TABLE public."Jugadores_Equipos"
  ADD COLUMN IF NOT EXISTS "FechaAlta" text,
  ADD COLUMN IF NOT EXISTS "FechaBaja" text;

ALTER TABLE public."Entrenadores_Equipos"
  ADD COLUMN IF NOT EXISTS "FechaAlta" text,
  ADD COLUMN IF NOT EXISTS "FechaBaja" text;

ALTER TABLE public."Asist_Jugadores"
  ADD COLUMN IF NOT EXISTS "MinutosRetraso" integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'asist_jugadores_minutos_retraso_chk'
  ) THEN
    ALTER TABLE public."Asist_Jugadores"
      ADD CONSTRAINT asist_jugadores_minutos_retraso_chk
      CHECK ("MinutosRetraso" IS NULL OR ("MinutosRetraso" BETWEEN 1 AND 180));
  END IF;
END;
$$;
