/*-- Cleaned Supabase-ready schema for Registration / Login + file metadata
-- Run in Supabase Dashboard -> SQL Editor -> New query

-- helper
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- trigger function to auto-update `updated_at`
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Profiles (single declaration; NO phone column)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,                 -- set to auth user id from supabase.auth
  email text NOT NULL,
  username text,
  full_name text,
  role text,                           -- 'commuter' or 'driver'
  is_active boolean DEFAULT true,
  is_verified boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles (email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles (username);

-- triggers for profiles
DROP TRIGGER IF EXISTS trg_profiles_set_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_set_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Commuters
CREATE TABLE IF NOT EXISTS public.commuters (
  commuter_id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  identity_document text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_commuters_set_updated_at ON public.commuters;
CREATE TRIGGER trg_commuters_set_updated_at
BEFORE UPDATE ON public.commuters
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Drivers
CREATE TABLE IF NOT EXISTS public.drivers (
  driver_id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plate_number text,
  license_number text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_drivers_set_updated_at ON public.drivers;
CREATE TRIGGER trg_drivers_set_updated_at
BEFORE UPDATE ON public.drivers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Documents (file metadata)
CREATE TABLE IF NOT EXISTS public.documents (
  document_id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  storage_path text NOT NULL,   -- path/key inside the Storage bucket
  file_type text,
  size bigint,
  document_type text,           -- e.g. 'id', 'license'
  uploaded_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_documents_set_updated_at ON public.documents;
CREATE TRIGGER trg_documents_set_updated_at
BEFORE UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commuters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if present (safe re-run)
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
DROP POLICY IF EXISTS profiles_delete_own ON public.profiles;

DROP POLICY IF EXISTS commuters_select_own ON public.commuters;
DROP POLICY IF EXISTS commuters_insert_own ON public.commuters;
DROP POLICY IF EXISTS commuters_update_own ON public.commuters;

DROP POLICY IF EXISTS drivers_select_own ON public.drivers;
DROP POLICY IF EXISTS drivers_insert_own ON public.drivers;
DROP POLICY IF EXISTS drivers_update_own ON public.drivers;

DROP POLICY IF EXISTS documents_select_own ON public.documents;
DROP POLICY IF EXISTS documents_insert_own ON public.documents;
DROP POLICY IF EXISTS documents_update_own ON public.documents;

-- Create policies: allow users to act only on their own rows (auth.uid() must equal id/user_id)
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY profiles_delete_own ON public.profiles FOR DELETE USING (auth.uid() = id);

CREATE POLICY commuters_select_own ON public.commuters FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY commuters_insert_own ON public.commuters FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY commuters_update_own ON public.commuters FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY drivers_select_own ON public.drivers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY drivers_insert_own ON public.drivers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY drivers_update_own ON public.drivers FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY documents_select_own ON public.documents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY documents_insert_own ON public.documents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY documents_update_own ON public.documents FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Optional convenience view
CREATE OR REPLACE VIEW public.user_profiles AS
SELECT p.*, c.identity_document, d.plate_number, d.license_number
FROM public.profiles p
LEFT JOIN public.commuters c ON c.user_id = p.id
LEFT JOIN public.drivers d ON d.user_id = p.id;*/

/*
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname='public' AND tablename='documents';


ALTER TABLE public.view_definition_backups
  ENABLE ROW LEVEL SECURITY;*/

  -- ROUTES (driver selects from this)
CREATE TABLE IF NOT EXISTS public.routes (
  route_id bigserial PRIMARY KEY,
  name      text NOT NULL,
  code      text UNIQUE,
  color     text,
  created_at timestamptz DEFAULT now()
);

-- DRIVER LIVE LOCATION (one row per driver)
CREATE TABLE IF NOT EXISTS public.jeepney_locations (
  driver_id  bigint PRIMARY KEY
             REFERENCES public.drivers(driver_id) ON DELETE CASCADE,
  route_id   bigint REFERENCES public.routes(route_id) ON DELETE SET NULL,
  lat        double precision NOT NULL,
  lng        double precision NOT NULL,
  speed      double precision,
  heading    double precision,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- COMMUTER LIVE LOCATION (one row per commuter)
CREATE TABLE IF NOT EXISTS public.commuter_locations (
  commuter_id bigint PRIMARY KEY
              REFERENCES public.commuters(commuter_id) ON DELETE CASCADE,
  route_id    bigint REFERENCES public.routes(route_id) ON DELETE SET NULL,
  lat         double precision NOT NULL,
  lng         double precision NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- indexes for fast filtering by route and recency
CREATE INDEX IF NOT EXISTS idx_jeepney_locations_route_updated
  ON public.jeepney_locations (route_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_commuter_locations_route_updated
  ON public.commuter_locations (route_id, updated_at DESC);

-- Enable RLS
ALTER TABLE public.routes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jeepney_locations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commuter_locations ENABLE ROW LEVEL SECURITY;

-- ROUTES:
--  - everyone can read routes (public list)
--  - only service role can insert/update/delete (you can relax this later)
DROP POLICY IF EXISTS routes_select_all ON public.routes;
CREATE POLICY routes_select_all
  ON public.routes
  FOR SELECT
  USING (true);

-- JEEPNEY LOCATIONS (drivers' GPS)
DROP POLICY IF EXISTS jl_driver_rw ON public.jeepney_locations;
DROP POLICY IF EXISTS jl_commuter_select ON public.jeepney_locations;

-- Drivers: full read/write of *their own* location row
CREATE POLICY jl_driver_rw
  ON public.jeepney_locations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.drivers d
      WHERE d.driver_id = jeepney_locations.driver_id
        AND d.user_id   = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.drivers d
      WHERE d.driver_id = jeepney_locations.driver_id
        AND d.user_id   = auth.uid()
    )
  );

-- Commuters: can SELECT jeepney locations only for routes they are currently on
CREATE POLICY jl_commuter_select
  ON public.jeepney_locations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.commuters c
      JOIN public.commuter_locations cl
        ON cl.commuter_id = c.commuter_id
      WHERE c.user_id    = auth.uid()
        AND cl.route_id  = jeepney_locations.route_id
    )
  );

-- COMMUTER LOCATIONS
DROP POLICY IF EXISTS cl_commuter_rw ON public.commuter_locations;
DROP POLICY IF EXISTS cl_driver_select ON public.commuter_locations;

-- Commuters: full read/write of their own live location row
CREATE POLICY cl_commuter_rw
  ON public.commuter_locations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.commuters c
      WHERE c.commuter_id = commuter_locations.commuter_id
        AND c.user_id     = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.commuters c
      WHERE c.commuter_id = commuter_locations.commuter_id
        AND c.user_id     = auth.uid()
    )
  );

-- Drivers: can see commuters only on their current route
CREATE POLICY cl_driver_select
  ON public.commuter_locations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.drivers d
      JOIN public.jeepney_locations jl
        ON jl.driver_id = d.driver_id
      WHERE d.user_id  = auth.uid()
        AND jl.route_id = commuter_locations.route_id
    )
  );

  -- JEEPNEY TERMINALS (from GPX waypoints)
CREATE TABLE IF NOT EXISTS public.jeepney_terminals (
  terminal_id bigserial PRIMARY KEY,
  name        text NOT NULL,
  description text,
  lat         double precision NOT NULL,
  lng         double precision NOT NULL,
  created_at  timestamptz DEFAULT now()
);

-- Enable RLS for terminals
ALTER TABLE public.jeepney_terminals ENABLE ROW LEVEL SECURITY;

-- Everyone can read terminals; only service_role can modify (no insert/update/delete policy)
DROP POLICY IF EXISTS jt_select_all ON public.jeepney_terminals;
CREATE POLICY jt_select_all
  ON public.jeepney_terminals
  FOR SELECT
  USING (true);

  -- Link routes to terminals (safe to rerun)
ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS origin_terminal_id      bigint REFERENCES public.jeepney_terminals(terminal_id),
  ADD COLUMN IF NOT EXISTS destination_terminal_id bigint REFERENCES public.jeepney_terminals(terminal_id);

INSERT INTO public.jeepney_terminals (name, description, lat, lng)
VALUES
  ('New Santa Maria Jeepney Terminal',
   'Main jeepney terminal along C. De Jesus St, Poblacion, Santa Maria, Bulacan',
   14.808, 121.033),
  ('Muzon–Sta. Maria Jeepney Terminal',
   'Jeepney terminal near Muzon area along Santa Maria–Tungkong Mangga Road',
   14.802873, 121.032906),
  ('Santa Maria Bypass Road Jeepney Terminal',
   'Local jeepney terminal along Santa Maria Bypass Road',
   14.8045, 121.0302),
  ('North Luzon Express Terminal (NLET)',
   'Bus and PUJ terminal near Philippine Arena area, used for Santa Maria connections',
   14.829, 121.045),
  ('Caypombo P2P Terminal',
   'P2P bus terminal on Norzagaray–Santa Maria Road, Caypombo area',
   14.816, 121.036)
RETURNING terminal_id, name;

INSERT INTO public.routes
  (name, code, color, origin_terminal_id, destination_terminal_id)
VALUES
  ('Sta. Maria – Muzon',        'SM-MUZ',  '#1e6b35', 1, 2),
  ('Sta. Maria – Bypass Road',  'SM-BYP',  '#8bc34a', 1, 3),
  ('Sta. Maria – NLET',         'SM-NLET', '#2196f3', 1, 4),
  ('Sta. Maria – Caypombo',     'SM-CAY',  '#ff9800', 1, 5);

  -- 1) Drop the old commuter-select policy that filters by route
DROP POLICY IF EXISTS jl_commuter_select ON public.jeepney_locations;

-- 2) Create a simpler commuter-select policy:
--    Any authenticated user who has a commuters row can see all jeeps.
CREATE POLICY jl_commuter_select
  ON public.jeepney_locations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.commuters c
      WHERE c.user_id = auth.uid()
    )
  );