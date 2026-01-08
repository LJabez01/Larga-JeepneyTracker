# Larga-JeepneyTracker
This will be our main repo

## Deployment notes

This project has a static frontend (served from `login/`, `mainpage/`, `mainmenu/`, etc.) and an Express backend in `server/index.js` used for reCAPTCHA verification and admin endpoints. For production, host the backend on a public URL and set the frontend `API_BASE` at runtime so the client can call the correct API.

Recommended deployment flow

- Option A — Render (recommended for Express apps):
	1. Sign in to Render, create a new Web Service and connect your repo.
	2. Set the build command to `npm install` and the start command to `node server/index.js`.
	3. Add the following environment variables in Render (Settings → Environment):
		 - `SUPABASE_URL` — your Supabase project URL (e.g. `https://xxxx.supabase.co`)
		 - `SUPABASE_SERVICE_ROLE_KEY` — service role key (server only)
		 - `RECAPTCHA_SECRET_KEY` — Google reCAPTCHA secret
	4. Deploy. Note the service URL (e.g. `https://my-backend.onrender.com`).
	5. In your frontend hosting (Vercel or static host), create a file `login/runtime-config.js` at deploy time that sets `window.__API_BASE__ = 'https://my-backend.onrender.com'` (see Vercel instructions below) or configure the host to inject that file.

- Option B — Vercel (frontend + serverless backend):
	- If you prefer Vercel serverless functions, you will need to convert the Express server to Vercel handlers (exportable `handler`), or create an API folder for endpoints. For a straightforward Express app, Render is simpler.
	- Add environment variables in Vercel Dashboard for the backend functions or Render service.

Runtime configuration for frontend

- We added a small `login/runtime-config.js` which sets `window.__API_BASE__` at runtime. On your hosting platform, ensure that file is present and contains a single line like:

```js
window.__API_BASE__ = 'https://my-backend.onrender.com';
```

- If you don't set `window.__API_BASE__`, the frontend falls back to `http://localhost:3000` when served from `localhost`, or `window.location.origin` otherwise.

Quick local test

```powershell
# from repo root
npm install
# run backend
node server/index.js
# open the frontend pages via a static file server (or open files directly)
```

Security notes

- Never publish `SUPABASE_SERVICE_ROLE_KEY` in the frontend or commit it to the repo. It must remain server-side.
- Keep `RECAPTCHA_SECRET_KEY` private in the backend host environment.

Need help?

If you want, I can:
- Patch this repo to automatically generate `login/runtime-config.js` during deploy, or
- Walk you through deploying the backend to Render and setting the required environment variables.
 
Vercel-specific instructions

- Set an Environment Variable on your Vercel project named `API_BASE` with your backend URL (for example `https://my-backend.onrender.com`).
- In the Vercel project settings, set the **Build Command** to:

```
npm run vercel-build
```

- Vercel will run `npm run vercel-build` during build; that script writes `login/runtime-config.js` using the `API_BASE` env var. After that, Vercel serves the repository files (including the generated `login/runtime-config.js`) so your frontend will call the correct backend URL at runtime.

If you want, I can also create a `vercel.json` for more advanced configuration.

