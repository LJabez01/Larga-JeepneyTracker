// Basic Express server for Larga Jeepney Tracker
// Uses Supabase service_role key on the server for admin and secure operations.

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET; // simple shared secret for admin endpoints

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[Server] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  console.error('Set them in a .env file or environment variables before starting the server.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const app = express();

app.use(cors({
  origin: '*', // adjust to your frontend origin if you deploy (e.g., http://localhost:5500)
}));

app.use(express.json());

// Simple health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Basic middleware to protect admin routes via a shared secret
function requireAdminSecret(req, res, next) {
  if (!ADMIN_SECRET) {
    return res.status(500).json({ error: 'ADMIN_SECRET not configured on server' });
  }

  const header = req.get('x-admin-secret');
  if (!header || header !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized: invalid admin secret' });
  }

  return next();
}

// Example admin route using Supabase service_role client
app.get('/api/admin/users', requireAdminSecret, async (req, res) => {
  try {
    const { data, error } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 50,
    });

    if (error) {
      console.error('[Admin] listUsers error:', error);
      return res.status(500).json({ error: 'Failed to list users' });
    }

    const users = data?.users ?? data;
    return res.json({
      count: Array.isArray(users) ? users.length : undefined,
      users,
    });
  } catch (err) {
    console.error('[Admin] Unexpected error in /api/admin/users:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
});

// Helper: validate numeric latitude/longitude
function isValidCoordinate(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

// Example driver location endpoint
// Expected JSON body: { driver_id, route_id, lat, lng }
app.post('/api/driver/location', async (req, res) => {
  const { driver_id, route_id, lat, lng } = req.body || {};

  if (!driver_id) {
    return res.status(400).json({ error: 'driver_id is required' });
  }

  if (!isValidCoordinate(lat) || !isValidCoordinate(lng)) {
    return res.status(400).json({ error: 'lat and lng must be valid numbers' });
  }

  try {
    const { data, error } = await supabase
      .from('jeepney_locations')
      .upsert({
        driver_id,
        route_id: route_id ?? null,
        lat,
        lng,
        updated_at: new Date().toISOString(),
      })
      .select();

    if (error) {
      console.error('[Driver] Failed to upsert jeepney_locations:', error);
      return res.status(500).json({ error: 'Failed to save driver location' });
    }

    return res.status(200).json({ success: true, row: Array.isArray(data) ? data[0] : data });
  } catch (err) {
    console.error('[Driver] Unexpected error in /api/driver/location:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
});

app.listen(PORT, () => {
  console.log(`[Server] Express API listening on port ${PORT}`);
});
