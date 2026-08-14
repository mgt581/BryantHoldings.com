import { clean, ensureSchema, insertEvent, json, publicCorsPreflight, withPublicCors } from '../_shared/core.js';

const ALLOWED = [
  'page_view', 'quote_cta_click', 'phone_click', 'whatsapp_click', 'email_click',
  'lead_form_submit_attempt', 'lead_form_error', 'generate_lead', 'lead_delivery_failed'
];

export async function onRequestPost({ request, env }) {
  const reply = (body, status) => withPublicCors(json(body, status), request);
  if (!env.LEADS_DB) return reply({ ok: false, error: 'Lead event storage is not configured.' }, 503);
  let payload;
  try { payload = await request.json(); } catch (_) { return reply({ ok: false, error: 'Invalid JSON.' }, 400); }
  const eventName = clean(payload.event_name || payload.event, 80);
  if (!ALLOWED.includes(eventName)) return reply({ ok: false, error: 'Unsupported event.' }, 400);
  await ensureSchema(env.LEADS_DB);
  await insertEvent(env.LEADS_DB, request, Object.assign({}, payload, { event_name: eventName }));
  return reply({ ok: true });
}

export function onRequestOptions({ request }) {
  return publicCorsPreflight(request);
}
