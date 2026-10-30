-- Aplicar antes de publicar la pantalla de Perfil: foto de perfil de entrenadores.
ALTER TABLE public."Entrenadores"
  ADD COLUMN IF NOT EXISTS "FotoURL" text;

-- Asistente de bienvenida de jugador/familia: NULL = se muestra en la próxima entrada.
ALTER TABLE public."Jugadores"
  ADD COLUMN IF NOT EXISTS "BienvenidaVista" timestamptz;

-- Datos de tutores y avisos de ausencia (Equipos.crearJugador, Editar perfil, bienvenida).
ALTER TABLE public."Jugadores"
  ADD COLUMN IF NOT EXISTS "ApellidosPadre1" text,
  ADD COLUMN IF NOT EXISTS "ApellidosPadre2" text,
  ADD COLUMN IF NOT EXISTS "NombrePadre1Original" text,
  ADD COLUMN IF NOT EXISTS "NombrePadre2Original" text,
  ADD COLUMN IF NOT EXISTS "TelefonoPadre1" text,
  ADD COLUMN IF NOT EXISTS "TelefonoPadre2" text,
  ADD COLUMN IF NOT EXISTS "NotificarAusenciasPadre1" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "NotificarAusenciasPadre2" boolean NOT NULL DEFAULT true;
