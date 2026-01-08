require('dotenv').config();

const express = require('express');
const cors = require('cors');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');
const { supabaseAdmin } = require('./adminClient');

const PORT = process.env.PORT || 3000;

const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY; // Google reCAPTCHA secret

const app = express();

app.use(cors({
  origin: '*', // adjust to your frontend origin if you deploy (e.g., http://localhost:5500)
}));

app.use(express.json());

// Anonymous client used only for verifying JWTs from the frontend
const supabaseAnon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Simple health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// NOTE: This server is currently only used for reCAPTCHA verification.

// Helper: verify reCAPTCHA token with Google
function verifyRecaptcha(token) {
  return new Promise((resolve) => {
    if (!RECAPTCHA_SECRET_KEY) {
      return resolve({ success: false, error: 'RECAPTCHA_SECRET_KEY not configured' });
    }

    const postData = new URLSearchParams({
      secret: RECAPTCHA_SECRET_KEY,
      response: token,
    }).toString();

    const options = {
      hostname: 'www.google.com',
      path: '/recaptcha/api/siteverify',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (resp) => {
      let data = '';
      resp.on('data', (chunk) => {
        data += chunk;
      });
      resp.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (err) {
          console.error('[reCAPTCHA] Failed to parse response:', err);
          resolve({ success: false });
        }
      });
    });

    req.on('error', (err) => {
      console.error('[reCAPTCHA] HTTPS request error:', err);
      resolve({ success: false });
    });

    req.write(postData);
    req.end();
  });
}

// Public API to verify reCAPTCHA tokens from the frontend
app.post('/api/verify-recaptcha', async (req, res) => {
  if (!RECAPTCHA_SECRET_KEY) {
    return res.status(500).json({ success: false, error: 'RECAPTCHA_SECRET_KEY not configured on server' });
  }

  const token = req.body && req.body.token;
  if (!token) {
    return res.status(400).json({ success: false, error: 'Missing reCAPTCHA token' });
  }

  try {
    const result = await verifyRecaptcha(token);
    if (!result.success) {
      console.warn('[reCAPTCHA] Verification failed:', result['error-codes']);
    }
    return res.status(200).json({
      success: !!result.success,
      score: result.score,
      action: result.action,
    });
  } catch (err) {
    console.error('[reCAPTCHA] Unexpected error:', err);
    return res.status(500).json({ success: false, error: 'Unexpected reCAPTCHA error' });
  }
});

// Secure admin endpoint: returns users with signed ID image URLs
app.get('/api/admin/id-documents', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : null;

    if (!token) {
      return res.status(401).json({ error: 'Missing bearer token' });
    }

    // Validate token and get user using anon client (respects JWT but not RLS here)
    const { data: userData, error: userErr } = await supabaseAnon.auth.getUser(token);
    if (userErr || !userData || !userData.user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const userId = userData.user.id;

    // Confirm caller is an admin using service-role client (bypasses RLS at DB level)
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('id, role')
      .eq('id', userId)
      .single();

    if (profileErr) {
      console.error('[admin] Failed to load admin profile:', profileErr);
      return res.status(500).json({ error: 'Failed to load admin profile' });
    }

    if (!profile || String(profile.role).toLowerCase() !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: admin role required' });
    }

    // Load all users and their documents (service role ignores RLS)
    const { data: users, error: usersErr } = await supabaseAdmin
      .from('profiles')
      .select(`
        id,
        email,
        username,
        role,
        is_active,
        is_verified,
        documents:documents(document_id, storage_path, document_type, file_type)
      `)
      .order('created_at', { ascending: true });

    if (usersErr) {
      console.error('[admin] Failed to load users for ID documents:', usersErr);
      return res.status(500).json({ error: 'Failed to load users' });
    }

    // For each document, generate a short-lived signed URL from the private bucket
    const usersWithSignedUrls = await Promise.all(
      (users || []).map(async (u) => {
        const docs = await Promise.all(
          (u.documents || []).map(async (d) => {
            try {
              const { data: signed, error: signErr } = await supabaseAdmin
                .storage
                .from('documents')
                .createSignedUrl(d.storage_path, 600); // 10 minutes

              if (signErr || !signed) {
                console.warn('[admin] Failed to sign URL for', d.storage_path, signErr);
                return {
                  document_id: d.document_id,
                  document_type: d.document_type,
                  file_type: d.file_type,
                  url: null,
                };
              }

              return {
                document_id: d.document_id,
                document_type: d.document_type,
                file_type: d.file_type,
                url: signed.signedUrl,
              };
            } catch (err) {
              console.error('[admin] Exception while signing URL for', d.storage_path, err);
              return {
                document_id: d.document_id,
                document_type: d.document_type,
                file_type: d.file_type,
                url: null,
              };
            }
          })
        );

        return {
          id: u.id,
          email: u.email,
          username: u.username,
          role: u.role,
          is_active: u.is_active,
          is_verified: u.is_verified,
          documents: docs,
        };
      })
    );

    return res.json({ users: usersWithSignedUrls });
  } catch (err) {
    console.error('[admin] Unexpected error in /api/admin/id-documents:', err);
    return res.status(500).json({ error: 'Unexpected admin error' });
  }
});

app.listen(PORT, () => {
  console.log(`[Server] Express API listening on port ${PORT}`);
});
