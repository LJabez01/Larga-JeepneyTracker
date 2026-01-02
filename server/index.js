require('dotenv').config();

const express = require('express');
const cors = require('cors');
const https = require('https');

const PORT = process.env.PORT || 3000;

const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY; // Google reCAPTCHA secret

const app = express();

app.use(cors({
  origin: '*', // adjust to your frontend origin if you deploy (e.g., http://localhost:5500)
}));

app.use(express.json());

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

app.listen(PORT, () => {
  console.log(`[Server] Express API listening on port ${PORT}`);
});
