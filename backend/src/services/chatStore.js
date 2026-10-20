/* JARVIS conversation storage, in Supabase.
 *
 * Two tables (supabase/migrations/20261020_jarvis_chat.sql):
 *   chat_conversations  one row per conversation id the browser minted
 *   chat_messages       every user and assistant turn
 *
 * Storage is best-effort by design: every call here swallows and logs its own
 * errors, so a Supabase outage or missing key never breaks the chat itself.
 * The client is created lazily, so an unconfigured deploy never loads it. */
const config = require('../config');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isConversationId = (id) => typeof id === 'string' && UUID.test(id);

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

/** Store one exchange (the visitor's message and JARVIS's reply). */
async function saveTurn({ conversationId, page, userAgent, message, reply, voice }) {
  const sb = db();
  if (!sb || !isConversationId(conversationId) || !reply) return;
  try {
    const now = new Date().toISOString();
    const { error: convErr } = await sb.from('chat_conversations').upsert(
      {
        id: conversationId,
        updated_at: now,
        page: typeof page === 'string' ? page.slice(0, 200) : null,
        user_agent: typeof userAgent === 'string' ? userAgent.slice(0, 300) : null,
      },
      { onConflict: 'id' },
    );
    if (convErr) throw convErr;

    const { error: msgErr } = await sb.from('chat_messages').insert([
      { conversation_id: conversationId, role: 'user', content: message, voice: !!voice },
      { conversation_id: conversationId, role: 'assistant', content: reply, voice: !!voice },
    ]);
    if (msgErr) throw msgErr;
  } catch (err) {
    console.error('chat store: save failed —', err.message || err);
  }
}

/** The stored turns of one conversation, oldest first. */
async function loadConversation(conversationId, limit = 40) {
  const sb = db();
  if (!sb || !isConversationId(conversationId)) return [];
  try {
    const { data, error } = await sb
      .from('chat_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('id', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).reverse();
  } catch (err) {
    console.error('chat store: load failed —', err.message || err);
    return [];
  }
}

module.exports = { saveTurn, loadConversation, isConversationId };
