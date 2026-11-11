-- Aplicar antes de publicar la versión del asistente «Cancelar entrenamiento» (Sesiones.cancelarSesion con detalle):
-- Schema.gs envía "DetalleCancelacion" en cada alta de sesión, así que sin esta columna fallan la generación semanal
-- y las sesiones extra. Idempotente: puede ejecutarse varias veces.
ALTER TABLE public."Sesiones"
  ADD COLUMN IF NOT EXISTS "DetalleCancelacion" text;

-- Reversión (pierde los detalles guardados; ejecutar solo con el código anterior ya publicado):
-- ALTER TABLE public."Sesiones" DROP COLUMN IF EXISTS "DetalleCancelacion";
