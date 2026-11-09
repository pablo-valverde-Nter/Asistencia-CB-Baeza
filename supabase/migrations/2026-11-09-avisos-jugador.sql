-- Aplicar antes de publicar la versión que permite quitar o cambiar de hora un entrenamiento con programaciones
-- de ausencia (Equipos.setHorariosEquipo con forzar) y avisa a la familia (marcarAvisoLeido).
-- Idempotente: puede ejecutarse varias veces.
CREATE TABLE IF NOT EXISTS public."Avisos_Jugador" (
  "ID" text PRIMARY KEY,
  "ID_Jugador" text NOT NULL REFERENCES public."Jugadores" ("ID") ON DELETE CASCADE,
  "Tipo" text NOT NULL,
  "Mensaje" text NOT NULL,
  "FechaCreacion" text,
  "Leido" boolean NOT NULL DEFAULT false,
  "FechaLectura" text
);

CREATE INDEX IF NOT EXISTS "idx_avisos_jugador_jugador" ON public."Avisos_Jugador" ("ID_Jugador");

-- Solo Apps Script (service_role) la lee y escribe; Supabase concede por defecto acceso a anon en tablas nuevas.
ALTER TABLE public."Avisos_Jugador" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Avisos_Jugador" FROM anon, authenticated;
GRANT ALL ON TABLE public."Avisos_Jugador" TO service_role;

-- Reversión (borra los avisos guardados; ejecutar solo con el código anterior ya publicado):
-- DROP INDEX IF EXISTS public."idx_avisos_jugador_jugador";
-- DROP TABLE IF EXISTS public."Avisos_Jugador";
