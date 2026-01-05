// One-off helper to turn GPX waypoints into SQL for jeepney_terminals.
// Usage (from repo root):
//   node server/generate_terminals_sql_from_gpx.js > terminals.sql
// Then copy terminal-related INSERT/UPSERT statements into Supabase SQL editor.

const fs = require('fs');
const path = require('path');

function main() {
  const gpxPath = path.join(__dirname, '..', '.gpx', 'StaMaria_Angat_Jeepney_Terminals.gpx');

  if (!fs.existsSync(gpxPath)) {
    console.error('GPX file not found at:', gpxPath);
    process.exit(1);
  }

  const xml = fs.readFileSync(gpxPath, 'utf8');

  // Very small, targeted GPX parser for <wpt> with lat/lon + <name>.
  const regex = /<wpt\s+[^>]*lat="([^"]+)"\s+lon="([^"]+)"[^>]*>[\s\S]*?<name>([^<]+)<\/name>[\s\S]*?<\/wpt>/gi;

  const statements = [];
  let match;

  while ((match = regex.exec(xml)) !== null) {
    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);
    const rawName = match[3].trim();

    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !rawName) {
      continue;
    }

    const name = rawName.replace(/'/g, "''"); // escape single quotes for SQL

    // Adjust table/column names to match your schema if needed.
    // This version assumes public.jeepney_terminals(name, lat, lng) exists
    // and that `name` is unique or at least safe for ON CONFLICT.
    const sql = `INSERT INTO public.jeepney_terminals (name, lat, lng)\n` +
      `VALUES ('${name}', ${lat.toFixed(8)}, ${lon.toFixed(8)})\n` +
      `ON CONFLICT (name) DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng;`;

    statements.push(sql);
  }

  if (!statements.length) {
    console.error('No <wpt> waypoints with <name> found in GPX.');
    process.exit(1);
  }

  console.log('-- Generated from StaMaria_Angat_Jeepney_Terminals.gpx');
  console.log('-- Review before running in Supabase SQL editor.');
  console.log(statements.join('\n\n'));
}

main();
