-- Aplicar antes de publicar la pantalla de Perfil: foto de perfil de entrenadores.
ALTER TABLE public."Entrenadores"
  ADD COLUMN IF NOT EXISTS "FotoURL" text;
