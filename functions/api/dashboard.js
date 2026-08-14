import { adminAllowed, ensureSchema, json, text } from '../_shared/core.js';

async function all(db, sql) {
  const result = await db.prepare(sql).all();
  return result.results || [];
}

const origin = `CASE
  WHEN COALESCE(NULLIF(utm_source,''),'') <> '' THEN LOWER(utm_source)
  WHEN LOWER(COALESCE(referrer,'')) LIKE '%google.%' THEN 'google'
  WHEN LOWER(COALESCE(referrer,'')) LIKE '%facebook.com%' THEN 'facebook'
  WHEN LOWER(COALESCE(referrer,'')) LIKE '%instagram.com%' THEN 'instagram'
  WHEN LOWER(COALESCE(referrer,'')) LIKE '%bing.com%' THEN 'bing'
  WHEN COALESCE(NULLIF(referrer,''),'') <> '' THEN referrer
  ELSE 'direct / unknown' END`;

export async function onRequestGet({ request, env }) {
  if (!await adminAllowed(request, env)) {
    const traceRequested = new URL(request.url).searchParams.get('auth_trace') === '1';
    if (traceRequested) {
      return json({
        ok: false,
        error: 'Unauthorized.',
        auth_trace: {
          access_enabled: String(env.CLOUDFLARE_ACCESS_ENABLED || '').trim().toLowerCase() === 'true',
          access_jwt_present: Boolean(String(request.headers.get('cf-access-jwt-assertion') || '').trim()),
          access_cookie_present: String(request.headers.get('cookie') || '').toLowerCase().includes('cf_authorization='),
          access_identity_present: Boolean(String(request.headers.get('cf-access-authenticated-user-email') || '').trim())
        }
      }, 401);
    }
    return text('Unauthorized.', 401);
  }
  if (!env.LEADS_DB) return text('Lead storage is not configured.', 503);
  await ensureSchema(env.LEADS_DB);

  const totals = await all(env.LEADS_DB, `SELECT COUNT(*) leads,
    SUM(CASE WHEN delivery_status='delivered' THEN 1 ELSE 0 END) delivered_leads,
    SUM(CASE WHEN delivery_status='failed' THEN 1 ELSE 0 END) failed_leads,
    SUM(CASE WHEN lead_status='WON' THEN 1 ELSE 0 END) won_leads,
    SUM(quote_value_pence) quoted_value_pence,SUM(won_revenue_pence) won_revenue_pence FROM leads`);
  const events = await all(env.LEADS_DB, 'SELECT event_name,COUNT(*) count FROM lead_events GROUP BY event_name ORDER BY count DESC');
  const eventTotals = Object.fromEntries(events.map(row => [row.event_name, Number(row.count || 0)]));
  return json({
    ok: true,
    generated_at: new Date().toISOString(),
    totals: totals[0] || {},
    event_totals: eventTotals,
    pipeline_summary: await all(env.LEADS_DB, 'SELECT lead_status status,COUNT(*) count FROM leads GROUP BY lead_status ORDER BY count DESC'),
    origin_summary: await all(env.LEADS_DB, `SELECT ${origin} origin,COUNT(*) count FROM leads GROUP BY ${origin} ORDER BY count DESC LIMIT 20`),
    revenue_origin_summary: await all(env.LEADS_DB, `SELECT ${origin} origin,COUNT(*) leads,
      SUM(CASE WHEN lead_status='WON' THEN 1 ELSE 0 END) won_leads,SUM(quote_value_pence) quote_value_pence,
      SUM(won_revenue_pence) won_revenue_pence FROM leads GROUP BY ${origin} ORDER BY won_revenue_pence DESC,leads DESC LIMIT 20`),
    service_summary: await all(env.LEADS_DB, `SELECT COALESCE(NULLIF(service,''),'Website enquiry') service,
      COUNT(*) count FROM leads GROUP BY COALESCE(NULLIF(service,''),'Website enquiry') ORDER BY count DESC LIMIT 20`),
    landing_page_summary: await all(env.LEADS_DB, `SELECT COALESCE(NULLIF(landing_page,''),'Unknown') landing_page,
      COUNT(*) count FROM lead_events GROUP BY COALESCE(NULLIF(landing_page,''),'Unknown') ORDER BY count DESC LIMIT 20`),
    recent_leads: await all(env.LEADS_DB, `SELECT id,submitted_at,name,phone,email,service,page,source,landing_page,
      referrer,utm_source,utm_medium,utm_campaign,delivery_status,delivery_errors,lead_status,quote_value_pence,
      won_revenue_pence,status_updated_at FROM leads ORDER BY submitted_at DESC LIMIT 25`),
    recent_events: await all(env.LEADS_DB, `SELECT occurred_at,event_name,page,landing_page,link_text,link_url,
      source,medium,campaign,service FROM lead_events ORDER BY occurred_at DESC LIMIT 50`)
  });
}
