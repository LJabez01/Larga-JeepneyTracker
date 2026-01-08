const fs = require('fs');
const path = require('path');

function writeRuntimeConfig() {
  const apiBase = process.env.API_BASE || process.env.NEXT_PUBLIC_API_BASE || '';
  const outDir = path.join(__dirname, '..', 'login');
  const outFile = path.join(outDir, 'runtime-config.js');

  const content = `window.__API_BASE__ = '${apiBase.replace(/'/g, "\\'")}';\n`;

  try {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, content, 'utf8');
    console.log('[generate-runtime-config] Wrote', outFile, 'with API_BASE=', apiBase);
  } catch (err) {
    console.error('[generate-runtime-config] Failed to write runtime-config.js', err);
    process.exit(1);
  }
}

writeRuntimeConfig();
