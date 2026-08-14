import { adminAllowed, csv, ensureSchema, text } from '../../_shared/core.js';
const HEADERS = ['submitted_at','name','phone','email','postcode','service','timeframe','message','page','source',
  'landing_page','referrer','utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid',
  'msclkid','session_id','client_id','form_name','marketing_consent','delivery_status','delivery_errors',
  'lead_status','quote_value_pence','won_revenue_pence','status_updated_at'];
export async function onRequestGet({ request, env }) {
  if (!await adminAllowed(request, env)) return text('Unauthorized.', 401);
  if (!env.LEADS_DB) return text('Lead storage is not configured.', 503);
  await ensureSchema(env.LEADS_DB);
  const result = await env.LEADS_DB.prepare('SELECT ' + HEADERS.join(',') + ' FROM leads ORDER BY submitted_at DESC LIMIT 5000').all();
  return csv(result.results || [], HEADERS, 'leads.csv');
}
