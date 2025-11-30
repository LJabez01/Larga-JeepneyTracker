-- init_db.sql
-- Run these statements in the Supabase SQL editor (Dashboard -> SQL Editor -> New query)
-- or via the supabase CLI to create example tables used by the project.

-- 1) Simple `trips` table (example)
CREATE TABLE IF NOT EXISTS public.trips (
  id bigserial PRIMARY KEY,
  driver_id bigint,
  origin text,
  destination text,
  scheduled_at timestamptz,
  seats_available integer DEFAULT 0,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- 2) Simple `drivers` table (optional)
CREATE TABLE IF NOT EXISTS public.drivers (
  id bigserial PRIMARY KEY,
  auth_user_id uuid, -- link to Supabase auth users if needed
  fullname text,
  phone text,
  vehicle text,
  created_at timestamptz DEFAULT now()
);

-- 3) Simple `commuters` table (optional)
CREATE TABLE IF NOT EXISTS public.commuters (
  id bigserial PRIMARY KEY,
  auth_user_id uuid,
  fullname text,
  phone text,
  created_at timestamptz DEFAULT now()
);

-- Indexes and basic example policy notes can be added later.

-- After running these, re-run `node server/testSupabase.js` to see the trips read succeed.
