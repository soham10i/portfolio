/* The one Supabase client, shared by every store (chat, SceneLab).
 *
 * Server-side only, with the secret key — it bypasses row-level security, so
 * nothing from here may ever be returned to a browser verbatim. Created lazily
 * so an unconfigured deploy never loads supabase-js at all; db() returns null
 * when SUPABASE_URL / SUPABASE_SECRET_KEY are unset and callers degrade. */
const config = require('../config');

let client = null;

function db() {
  if (!config.supabase.ready) return null;
  if (!client) {
    const { createClient } = require('@supabase/supabase-js');
    client = createClient(config.supabase.url, config.supabase.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (id) => typeof id === 'string' && UUID.test(id);

module.exports = { db, isUuid };
