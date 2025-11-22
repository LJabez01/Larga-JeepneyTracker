require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  try {
    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) {
      console.error('Error listing users:', error);
      return;
    }
    // Supabase returns { users: [...] } inside data for the admin listUsers call
    const users = data?.users ?? data;
    if (Array.isArray(users)) {
      console.log(`Users count: ${users.length}`);
    } else {
      console.log('Users result:', JSON.stringify(users, null, 2));
    }
  } catch (err) {
    console.error('Unexpected error:', err);
  }
})();