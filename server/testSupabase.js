// Simple server-side test for Supabase.
// Usage:
// 1. npm install @supabase/supabase-js dotenv
// 2. create a `.env` (not committed) with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// 3. node server/testSupabase.js

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function main() {
  try {
    // 1) Example read from a table named 'trips' (replace with a table in your DB)
    const { data: tripsData, error: tripsError } = await supabase.from('trips').select('*').limit(5);
    if (tripsError) {
      console.error('Error reading trips table:', tripsError);
    } else {
      console.log('Sample rows from `trips`:', tripsData);
    }

    // 2) Example admin action: list users (requires service_role key)
    const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers();
    if (usersError) {
      console.error('Error listing users (admin):', usersError);
    } else {
      const users = usersData?.users ?? usersData;
      if (Array.isArray(users)) {
        console.log(`Users count: ${users.length}`);
      } else {
        console.log('Users result:', JSON.stringify(users, null, 2));
      }
    }
  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(1);
  }
}

main();