-- Aplicar antes de publicar la pantalla de Perfil: foto de perfil de entrenadores.
ALTER TABLE public."Entrenadores"
  ADD COLUMN IF NOT EXISTS "FotoURL" text;

-- Asistente de bienvenida de jugador/familia: NULL = se muestra en la próxima entrada.
ALTER TABLE public."Jugadores"
  ADD COLUMN IF NOT EXISTS "BienvenidaVista" timestamptz;
