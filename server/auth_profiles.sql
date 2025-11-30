-- Cleaned Supabase-ready schema for Registration / Login + file metadata
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
LEFT JOIN public.drivers d ON d.user_id = p.id;