import { adminAllowed, csv, ensureSchema, text } from '../../_shared/core.js';
const HEADERS = ['occurred_at','event_name','page','landing_page','referrer','source','medium','campaign','term',
  'content','gclid','fbclid','msclkid','service','link_url','link_text','phone_number','whatsapp_number',
  'email_address','session_id','client_id'];
export async function onRequestGet({ request, env }) {
  if (!await adminAllowed(request, env)) return text('Unauthorized.', 401);
  if (!env.LEADS_DB) return text('Lead storage is not configured.', 503);
  await ensureSchema(env.LEADS_DB);
  const result = await env.LEADS_DB.prepare('SELECT ' + HEADERS.join(',') + ' FROM lead_events ORDER BY occurred_at DESC LIMIT 5000').all();
  return csv(result.results || [], HEADERS, 'lead-events.csv');
}
