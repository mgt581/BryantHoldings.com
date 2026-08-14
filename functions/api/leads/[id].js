import { adminAllowed, ensureSchema, json, STATUSES } from '../../_shared/core.js';

export async function onRequestPatch({ request, env, params }) {
  if (!await adminAllowed(request, env)) return json({ ok: false, error: 'Unauthorized.' }, 401);
  if (!env.LEADS_DB) return json({ ok: false, error: 'Lead storage is not configured.' }, 503);
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id < 1) return json({ ok: false, error: 'Invalid lead id.' }, 400);
  let input;
  try { input = await request.json(); } catch (_) { return json({ ok: false, error: 'Invalid JSON.' }, 400); }
  const status = String(input.lead_status || '').trim().toUpperCase();
  const quote = Number(input.quote_value_pence);
  const revenue = Number(input.won_revenue_pence);
  if (!STATUSES.includes(status)) return json({ ok: false, error: 'Unsupported lead status.' }, 400);
  if (![quote,revenue].every(value => Number.isSafeInteger(value) && value >= 0)) {
    return json({ ok: false, error: 'Money values must be non-negative whole pence/cents.' }, 400);
  }
  await ensureSchema(env.LEADS_DB);
  const updatedAt = new Date().toISOString();
  const result = await env.LEADS_DB.prepare(`UPDATE leads SET lead_status=?,quote_value_pence=?,
    won_revenue_pence=?,status_updated_at=? WHERE id=?`).bind(status,quote,revenue,updatedAt,id).run();
  if (!result.meta || !Number(result.meta.changes)) return json({ ok: false, error: 'Lead not found.' }, 404);
  return json({ ok: true, lead: { id, lead_status: status, quote_value_pence: quote, won_revenue_pence: revenue, status_updated_at: updatedAt } });
}
