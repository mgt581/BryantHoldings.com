import { clean, ensureSchema, hashIp, insertEvent, json, normalizeLead, publicCorsPreflight, withPublicCors } from '../_shared/core.js';

export function onRequestOptions({ request }) {
  return publicCorsPreflight(request);
}

export async function onRequestPost({ request, env }) {
  const reply = (body, status) => withPublicCors(json(body, status), request);
  if (!env.LEADS_DB) return reply({ error: 'Lead storage is not configured.' }, 503);
  let input;
  try { input = await request.json(); } catch (_) { return reply({ error: 'Invalid JSON.' }, 400); }
  if (clean(input.website)) return reply({ ok: true });

  const lead = normalizeLead(input);
  if ((!lead.phone && !lead.email) || !lead.name) return reply({ error: 'Please provide a name and phone or email.' }, 400);

  await ensureSchema(env.LEADS_DB);
  const ipHash = await hashIp(request.headers.get('cf-connecting-ip') || '');
  let inserted;
  try {
    inserted = await env.LEADS_DB.prepare(`INSERT INTO leads (
      submitted_at,name,phone,email,postcode,service,timeframe,message,page,source,landing_page,
      referrer,utm_source,utm_medium,utm_campaign,utm_term,utm_content,gclid,fbclid,msclkid,
      session_id,client_id,form_name,marketing_consent,delivery_status,user_agent,ip_hash
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      lead.submitted_at,lead.name,lead.phone,lead.email,lead.postcode,lead.service,lead.timeframe,
      lead.message,lead.page,lead.source,lead.landing_page,lead.referrer,lead.utm_source,lead.utm_medium,
      lead.utm_campaign,lead.utm_term,lead.utm_content,lead.gclid,lead.fbclid,lead.msclkid,
      lead.session_id,lead.client_id,lead.form_name,lead.marketing_consent,'pending',
      clean(request.headers.get('user-agent')),ipHash
    ).run();
  } catch (error) {
    return reply({ error: 'Your enquiry could not be stored safely.' }, 503);
  }

  const leadId = inserted && inserted.meta ? Number(inserted.meta.last_row_id || 0) : 0;
  const errors = [];
  let delivered = false;
  const destinations = clean(env.LEAD_TO_EMAILS).split(',').map(value => value.trim()).filter(Boolean);
  if (!env.RESEND_API_KEY) errors.push('RESEND_API_KEY is not configured');
  else if (!destinations.length) errors.push('LEAD_TO_EMAILS is not configured');
  else {
    const fields = [['Name',lead.name],['Phone',lead.phone],['Email',lead.email],['Service',lead.service],
      ['Postcode',lead.postcode],['Message',lead.message],['Page',lead.page],['Source',lead.utm_source || lead.source],
      ['Campaign',lead.utm_campaign]].filter(([,value]) => value);
    const body = fields.map(([key,value]) => key + ': ' + value).join('\n');
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: clean(env.LEAD_FROM_EMAIL) || 'Website Leads <onboarding@resend.dev>',
          to: destinations, reply_to: lead.email || undefined,
          subject: 'New website lead - ' + (clean(env.BUSINESS_NAME) || 'Website'),
          text: body
        })
      });
      if (!response.ok) throw new Error('Resend returned ' + response.status);
      delivered = true;
    } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  }

  await env.LEADS_DB.prepare('UPDATE leads SET delivery_status=?, delivery_errors=? WHERE id=?')
    .bind(delivered ? 'delivered' : 'failed', errors.join(' | '), leadId).run();
  await insertEvent(env.LEADS_DB, request, Object.assign({}, lead, {
    event_name: delivered ? 'generate_lead' : 'lead_delivery_failed',
    medium: lead.utm_medium, campaign: lead.utm_campaign, term: lead.utm_term, content: lead.utm_content
  }));
  if (!delivered) return reply({ error: 'Your enquiry was stored, but online delivery failed. Please call or message us.' }, 502);
  return reply({ ok: true });
}
