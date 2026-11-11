-- Aplicar antes de publicar la versión que guarda el emisor y el canal de cancelación.
ALTER TABLE public."Sesiones"
  ADD COLUMN IF NOT EXISTS "CanceladoPor" text,
  ADD COLUMN IF NOT EXISTS "CanalAvisoCancelacion" text;
