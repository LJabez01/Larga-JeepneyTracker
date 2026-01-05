// Client-side Supabase initializer (ES module)
// This file uses the ESM build of `@supabase/supabase-js` via CDN so it works without bundling.
// Usage in HTML: <script type="module" src="/login/supabaseClient.js"></script>

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// Replace with your project values (keep anon key public-safe)
// Example URL format: https://abcdxyzcompany.supabase.co
const SUPABASE_URL = 'https://tydvoylhjojxzykdotxf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_A8lnpV3CPNxvieBXuMYmiA_hlSkQUUp';

function validateSupabaseConfig(url, key) {
  const placeholder = /<YOUR_PROJECT>|<YOUR_ANON_KEY>/i;
  if (placeholder.test(url) || placeholder.test(key)) {
    console.error('[Supabase] Configuration placeholders detected. Set SUPABASE_URL and SUPABASE_ANON_KEY in supabaseClient.js.');
    throw new Error('Supabase configuration not set: replace placeholders.');
  }
  const urlPattern = /^https:\/\/.+\.supabase\.co$/i; // basic expected pattern
  if (!urlPattern.test(url)) {
    console.error('[Supabase] Malformed URL provided:', url);
    throw new Error('Invalid Supabase URL. Expected format https://xxxxx.supabase.co');
  }
  if (!key || key.length < 30) {
    console.warn('[Supabase] Anon key seems unusually short. Double-check Project Settings > API.');
  }
}

try {
  validateSupabaseConfig(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
  // Surface user-friendly alert while keeping throw for module consumers
  alert(e.message);
  throw e;
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function signUp(email, password) {
  // Where the user lands after clicking the verification link
  // Example: send them back to the login page of this app
  let redirectTo = undefined;
  if (typeof window !== 'undefined') {
    redirectTo = `${window.location.origin}/login/Log-in.html`;
  }
  return await supabase.auth.signUp({
    email,
    password,
    options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
  });
}

export async function signIn(email, password) {
  return await supabase.auth.signInWithPassword({ email, password });
}

export async function uploadDocument(userId, file, documentType = 'id', bucket = 'documents') {
  if (!file) return { path: null, uploadError: null, metaError: null };
  const safePath = `${userId}/${Date.now()}_${file.name.replace(/\s+/g,'_')}`;
  let uploadError = null;
  let metaError = null;
  // Storage upload
  const uploadRes = await supabase.storage.from(bucket).upload(safePath, file, { cacheControl: '3600', upsert: false });
  uploadError = uploadRes.error || null;
  if (uploadError) {
    console.error('[uploadDocument] Storage upload failed', uploadError.message);
    return { path: null, uploadError, metaError: null };
  }
  // Metadata insert
  const insertRes = await supabase.from('documents').insert([{
    user_id: userId,
    storage_path: safePath,
    file_type: file.type,
    size: file.size,
    document_type: documentType
  }], { returning: 'minimal' });
  metaError = insertRes.error || null;
  if (metaError) {
    console.error('[uploadDocument] Metadata insert failed', metaError.message);
    return { path: safePath, uploadError: null, metaError };
  }
  return { path: safePath, uploadError: null, metaError: null };
}

// Convenience: expose for console debugging (non-sensitive public anon key only)
if (typeof window !== 'undefined') {
  window.supabase = supabase;
  window.supabaseUploadDocument = uploadDocument;
  window.supabaseSignUp = signUp;
  window.supabaseSignIn = signIn;
}
