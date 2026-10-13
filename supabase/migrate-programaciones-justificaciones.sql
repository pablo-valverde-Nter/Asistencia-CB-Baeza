ALTER TABLE public."Asist_Jugadores"
  ADD COLUMN IF NOT EXISTS "EsProgramada" boolean DEFAULT false;

ALTER TABLE public."Sesiones"
  ADD COLUMN IF NOT EXISTS "ID_Horario" text REFERENCES public."Horarios" ("ID") ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public."Programaciones_Justificaciones" (
  "ID" text PRIMARY KEY,
  "ID_Jugador" text REFERENCES public."Jugadores" ("ID") ON DELETE CASCADE,
  "ID_Equipo" text REFERENCES public."Equipos" ("ID") ON DELETE CASCADE,
  "ID_Horario" text REFERENCES public."Horarios" ("ID") ON DELETE CASCADE,
  "TipoIncidencia" text NOT NULL,
  "MotivoCategoria" text,
  "MotivoDetalle" text,
  "HoraIncorporacion" text,
  "Activo" boolean NOT NULL DEFAULT true,
  "FechaCreacion" text,
  "FechaActualizacion" text
);

CREATE INDEX IF NOT EXISTS "idx_programaciones_justif_jugador" ON public."Programaciones_Justificaciones" ("ID_Jugador");
CREATE INDEX IF NOT EXISTS "idx_programaciones_justif_horario" ON public."Programaciones_Justificaciones" ("ID_Horario");

ALTER TABLE public."Programaciones_Justificaciones" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."Programaciones_Justificaciones" FROM anon, authenticated;
GRANT ALL ON public."Programaciones_Justificaciones" TO service_role;

NOTIFY pgrst, 'reload schema';