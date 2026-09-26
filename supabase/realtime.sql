CREATE TABLE IF NOT EXISTS public.app_sync_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  revision bigint NOT NULL DEFAULT 0,
  changed_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.app_sync_state (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_sync_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.app_sync_state FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.app_sync_state TO anon, authenticated;

DROP POLICY IF EXISTS "Read app sync marker" ON public.app_sync_state;
CREATE POLICY "Read app sync marker"
  ON public.app_sync_state
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.bump_app_sync_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.app_sync_state
  SET revision = revision + 1,
      changed_at = clock_timestamp()
  WHERE id = true;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_app_sync_state() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'Temporadas',
    'Equipos',
    'Horarios',
    'Jugadores',
    'Jugadores_Equipos',
    'Entrenadores',
    'Entrenadores_Equipos',
    'Sesiones',
    'Asist_Jugadores',
    'Asist_Entrenadores'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS app_sync_change ON public.%I', table_name);
    EXECUTE format(
      'CREATE TRIGGER app_sync_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.bump_app_sync_state()',
      table_name
    );
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'app_sync_state'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_sync_state;
  END IF;
END;
$$;
