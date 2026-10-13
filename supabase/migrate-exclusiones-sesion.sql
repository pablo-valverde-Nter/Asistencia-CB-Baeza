-- Ejecutar una vez en cada base DEV y PRO antes de publicar el nuevo código.
-- Solo añade indicadores de exclusión a los registros de asistencia existentes.
ALTER TABLE public."Asist_Jugadores"
  ADD COLUMN IF NOT EXISTS "Excluido" boolean NOT NULL DEFAULT false;

ALTER TABLE public."Asist_Entrenadores"
  ADD COLUMN IF NOT EXISTS "Excluido" boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';