CREATE TABLE IF NOT EXISTS public."Temporadas" (
  "ID" text PRIMARY KEY,
  "Nombre" text,
  "FechaInicio" text,
  "FechaFin" text,
  "Activa" boolean
);

CREATE TABLE IF NOT EXISTS public."Equipos" (
  "ID" text PRIMARY KEY,
  "Nombre" text,
  "Categoria" text,
  "Modalidad" text,
  "ID_Temporada" text REFERENCES public."Temporadas" ("ID") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public."Horarios" (
  "ID" text PRIMARY KEY,
  "ID_Equipo" text REFERENCES public."Equipos" ("ID") ON DELETE CASCADE,
  "DiaSemana" integer,
  "HoraInicio" text,
  "HoraFin" text
);

CREATE TABLE IF NOT EXISTS public."Jugadores" (
  "ID" text PRIMARY KEY,
  "Nombre" text,
  "Apellidos" text,
  "FechaNac" text,
  "Telefono" text,
  "Email" text,
  "FotoURL" text,
  "Dorsal" text,
  "Usuario" text,
  "PIN" text,
  "CodigoPadres" text,
  "EmailPadre1" text,
  "EmailPadre2" text,
  "NombrePadre1" text,
  "ApellidosPadre1" text,
  "NombrePadre2" text,
  "ApellidosPadre2" text,
  "NombrePadre1Original" text,
  "NombrePadre2Original" text,
  "TelefonoPadre1" text,
  "TelefonoPadre2" text,
  "NotificarAusenciasPadre1" boolean NOT NULL DEFAULT true,
  "NotificarAusenciasPadre2" boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public."Jugadores_Equipos" (
  "ID" text PRIMARY KEY,
  "ID_Jugador" text REFERENCES public."Jugadores" ("ID") ON DELETE CASCADE,
  "ID_Equipo" text REFERENCES public."Equipos" ("ID") ON DELETE CASCADE,
  "Tipo" text,
  "Activo" boolean
);

CREATE TABLE IF NOT EXISTS public."Entrenadores" (
  "ID" text PRIMARY KEY,
  "Nombre" text,
  "Apellidos" text,
  "Email" text,
  "Telefono" text,
  "PIN" text,
  "EsAdmin" boolean
);

CREATE TABLE IF NOT EXISTS public."Administradores" (
  "ID" text PRIMARY KEY,
  "Email" text NOT NULL UNIQUE,
  "PIN" text NOT NULL,
  "Activo" boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public."Entrenadores_Equipos" (
  "ID" text PRIMARY KEY,
  "ID_Entrenador" text REFERENCES public."Entrenadores" ("ID") ON DELETE CASCADE,
  "ID_Equipo" text REFERENCES public."Equipos" ("ID") ON DELETE CASCADE,
  "Activo" boolean,
  "TipoRol" text
);

CREATE TABLE IF NOT EXISTS public."Sesiones" (
  "ID" text PRIMARY KEY,
  "ID_Equipo" text REFERENCES public."Equipos" ("ID") ON DELETE CASCADE,
  "ID_Temporada" text REFERENCES public."Temporadas" ("ID") ON DELETE CASCADE,
  "Fecha" text,
  "HoraInicio" text,
  "HoraFin" text,
  "EsExtra" boolean,
  "Notas" text,
  "AsistenciaGuardada" boolean
);

CREATE TABLE IF NOT EXISTS public."Asist_Jugadores" (
  "ID" text PRIMARY KEY,
  "ID_Sesion" text REFERENCES public."Sesiones" ("ID") ON DELETE CASCADE,
  "ID_Jugador" text REFERENCES public."Jugadores" ("ID") ON DELETE CASCADE,
  "Estado" text,
  "EsInvitado" boolean,
  "Excluido" boolean NOT NULL DEFAULT false,
  "FechaRegistro" text,
  "TieneJustificacion" boolean,
  "TipoJustificacion" text,
  "MotivoCategoria" text,
  "MotivoDetalle" text,
  "FechaJustificacion" text,
  "JustificadoPor" text,
  "MensajeGenerado" text,
  "NotificadoEntrenador" boolean,
  "EsProgramada" boolean DEFAULT false
);

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

CREATE TABLE IF NOT EXISTS public."Asist_Entrenadores" (
  "ID" text PRIMARY KEY,
  "ID_Sesion" text REFERENCES public."Sesiones" ("ID") ON DELETE CASCADE,
  "ID_Entrenador" text REFERENCES public."Entrenadores" ("ID") ON DELETE CASCADE,
  "Asistio" boolean,
  "EsInvitado" boolean,
  "Excluido" boolean NOT NULL DEFAULT false,
  "FechaRegistro" text
);

CREATE INDEX IF NOT EXISTS "idx_equipos_temporada" ON public."Equipos" ("ID_Temporada");
CREATE INDEX IF NOT EXISTS "idx_horarios_equipo" ON public."Horarios" ("ID_Equipo");
CREATE INDEX IF NOT EXISTS "idx_jugadores_equipos_jugador" ON public."Jugadores_Equipos" ("ID_Jugador");
CREATE INDEX IF NOT EXISTS "idx_jugadores_equipos_equipo" ON public."Jugadores_Equipos" ("ID_Equipo");
CREATE INDEX IF NOT EXISTS "idx_entrenadores_equipos_entrenador" ON public."Entrenadores_Equipos" ("ID_Entrenador");
CREATE INDEX IF NOT EXISTS "idx_entrenadores_equipos_equipo" ON public."Entrenadores_Equipos" ("ID_Equipo");
CREATE INDEX IF NOT EXISTS "idx_sesiones_equipo_fecha" ON public."Sesiones" ("ID_Equipo", "Fecha");
CREATE INDEX IF NOT EXISTS "idx_asist_jugadores_sesion" ON public."Asist_Jugadores" ("ID_Sesion");
CREATE INDEX IF NOT EXISTS "idx_asist_jugadores_jugador" ON public."Asist_Jugadores" ("ID_Jugador");
CREATE INDEX IF NOT EXISTS "idx_asist_entrenadores_sesion" ON public."Asist_Entrenadores" ("ID_Sesion");
CREATE INDEX IF NOT EXISTS "idx_programaciones_justif_jugador" ON public."Programaciones_Justificaciones" ("ID_Jugador");
CREATE INDEX IF NOT EXISTS "idx_programaciones_justif_horario" ON public."Programaciones_Justificaciones" ("ID_Horario");

ALTER TABLE public."Temporadas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Equipos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Horarios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Jugadores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Jugadores_Equipos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Entrenadores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Administradores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Entrenadores_Equipos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Sesiones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Asist_Jugadores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Asist_Entrenadores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Programaciones_Justificaciones" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;