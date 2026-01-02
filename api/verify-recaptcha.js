const https = require('https');

const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;

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

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end(JSON.stringify({ success: false, error: 'Method not allowed' }));
    return;
  }

  if (!RECAPTCHA_SECRET_KEY) {
    res.statusCode = 500;
    res.end(JSON.stringify({ success: false, error: 'RECAPTCHA_SECRET_KEY not configured on server' }));
    return;
  }

  // Parse JSON body manually
  let body = '';
  for await (const chunk of req) {
    body += chunk;
  }

  let token = '';
  try {
    const parsed = JSON.parse(body || '{}');
    token = parsed.token || '';
  } catch (err) {
    console.error('[reCAPTCHA] Failed to parse request body:', err);
  }

  if (!token) {
    res.statusCode = 400;
    res.end(JSON.stringify({ success: false, error: 'Missing reCAPTCHA token' }));
    return;
  }

  try {
    const result = await verifyRecaptcha(token);
    if (!result.success) {
      console.warn('[reCAPTCHA] Verification failed:', result['error-codes']);
    }
    res.statusCode = 200;
    res.end(JSON.stringify({
      success: !!result.success,
      score: result.score,
      action: result.action,
      errorCodes: result['error-codes'] || result.errorCodes || null,
    }));
  } catch (err) {
    console.error('[reCAPTCHA] Unexpected error:', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ success: false, error: 'Unexpected reCAPTCHA error' }));
  }
};
