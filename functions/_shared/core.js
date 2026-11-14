export const STATUSES = ['TEST', 'NEW', 'GENUINE', 'SPAM', 'CONTACTED', 'QUOTED', 'WON', 'LOST'];

export function clean(value, limit = 1000) {
  return String(value == null ? '' : value).trim().slice(0, limit);
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function publicOriginAllowed(origin) {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:') return false;
    if (url.hostname === 'bryantgroupholdings.co.uk' || url.hostname === 'www.bryantgroupholdings.co.uk') return true;
    return url.hostname === 'bryantholdings-com.pages.dev' || url.hostname.endsWith('.bryantholdings-com.pages.dev');
  } catch (_) {
    return false;
  }
}

export function withPublicCors(response, request) {
  const origin = clean(request.headers.get('origin'));
  if (!publicOriginAllowed(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', origin);
  headers.set('access-control-allow-methods', 'POST, OPTIONS');
  headers.set('access-control-allow-headers', 'content-type, accept');
  headers.append('vary', 'Origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export function publicCorsPreflight(request) {
  const origin = clean(request.headers.get('origin'));
  if (!publicOriginAllowed(origin)) return json({ error: 'Origin is not allowed.' }, 403);
  return withPublicCors(new Response(null, { status: 204 }), request);
}

export function text(body, status = 200, type = 'text/plain; charset=utf-8') {
  return new Response(body, { status, headers: { 'content-type': type, 'cache-control': 'no-store' } });
}

async function secretsMatch(left, right) {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right))
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
}

function base64UrlBytes(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function base64UrlJson(value) {
  return JSON.parse(new TextDecoder().decode(base64UrlBytes(value)));
}

const accessKeyCache = new Map();

async function accessSigningKeys(teamDomain, fetcher) {
  const cached = accessKeyCache.get(teamDomain);
  if (cached && cached.expires > Date.now()) return cached.keys;
  const response = await fetcher('https://' + teamDomain + '/cdn-cgi/access/certs');
  if (!response.ok) throw new Error('Access certs unavailable');
  const { keys = [] } = await response.json();
  accessKeyCache.set(teamDomain, { keys, expires: Date.now() + 10 * 60 * 1000 });
  return keys;
}

// Verifies a Cloudflare Access JWT: RS256 signature, issuer, audience and expiry.
// Never trust the mere presence of an Access header or cookie: anyone can send those.
export async function verifyAccessJwt(token, env, fetcher = fetch) {
  const teamDomain = clean(env.CF_ACCESS_TEAM_DOMAIN).replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const audience = clean(env.CF_ACCESS_AUD);
  if (!token || !teamDomain || !audience) return false;
  try {
    const [headerPart, payloadPart, signaturePart] = token.split('.');
    if (!headerPart || !payloadPart || !signaturePart) return false;
    const header = base64UrlJson(headerPart);
    const payload = base64UrlJson(payloadPart);
    if (header.alg !== 'RS256') return false;
    const now = Math.floor(Date.now() / 1000);
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(audience)) return false;
    if (payload.iss !== 'https://' + teamDomain) return false;
    if (!payload.exp || payload.exp < now) return false;
    if (payload.nbf && payload.nbf > now + 60) return false;
    const keys = await accessSigningKeys(teamDomain, fetcher);
    const jwk = keys.find(key => key.kid === header.kid);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, base64UrlBytes(signaturePart),
      new TextEncoder().encode(headerPart + '.' + payloadPart));
  } catch (_) {
    return false;
  }
}

export async function adminAllowed(request, env, fetcher = fetch) {
  const accessEnabled = clean(env.CLOUDFLARE_ACCESS_ENABLED).toLowerCase() === 'true';
  if (accessEnabled && await verifyAccessJwt(clean(request.headers.get('cf-access-jwt-assertion'), 8000), env, fetcher)) return true;
  const configured = clean(env.LEADS_EXPORT_TOKEN);
  const authorization = clean(request.headers.get('authorization'));
  const bearer = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';
  return Boolean(configured && bearer && await secretsMatch(bearer, configured));
}

// Keyed hash so stored values cannot be reversed by hashing every possible IP address.
export async function hashIp(ip, env = {}) {
  const secret = clean(env.IP_HASH_SECRET || env.LEADS_EXPORT_TOKEN);
  if (!ip || !secret || !crypto.subtle) return '';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

// Simple per-IP limit backed by D1 so bots cannot flood the inbox or the database.
export async function overRateLimit(db, table, ipHash, limit, minutes) {
  if (!ipHash) return false;
  const column = table === 'leads' ? 'submitted_at' : 'occurred_at';
  const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  const row = await db.prepare('SELECT COUNT(*) count FROM ' + (table === 'leads' ? 'leads' : 'lead_events') +
    ' WHERE ip_hash=? AND ' + column + '>?').bind(ipHash, since).first();
  return Number(row && row.count || 0) >= limit;
}

export async function ensureSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT, submitted_at TEXT NOT NULL, name TEXT NOT NULL,
    phone TEXT, email TEXT, postcode TEXT, service TEXT, timeframe TEXT, message TEXT,
    page TEXT, source TEXT, landing_page TEXT, referrer TEXT, utm_source TEXT, utm_medium TEXT,
    utm_campaign TEXT, utm_term TEXT, utm_content TEXT, gclid TEXT, fbclid TEXT, msclkid TEXT,
    session_id TEXT, client_id TEXT, form_name TEXT, marketing_consent INTEGER NOT NULL DEFAULT 0,
    delivery_status TEXT NOT NULL DEFAULT 'pending', delivery_errors TEXT,
    lead_status TEXT NOT NULL DEFAULT 'NEW', quote_value_pence INTEGER NOT NULL DEFAULT 0,
    won_revenue_pence INTEGER NOT NULL DEFAULT 0, status_updated_at TEXT, user_agent TEXT, ip_hash TEXT
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS lead_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, occurred_at TEXT NOT NULL, event_name TEXT NOT NULL,
    page TEXT, landing_page TEXT, referrer TEXT, source TEXT, medium TEXT, campaign TEXT,
    term TEXT, content TEXT, gclid TEXT, fbclid TEXT, msclkid TEXT, service TEXT,
    link_url TEXT, link_text TEXT, phone_number TEXT, whatsapp_number TEXT, email_address TEXT,
    session_id TEXT, client_id TEXT, user_agent TEXT, ip_hash TEXT
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_leads_submitted_at ON leads (submitted_at DESC)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (lead_status)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON lead_events (occurred_at DESC)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_events_name ON lead_events (event_name)').run();
}

export function normalizeLead(input) {
  const splitName = [input.first_name, input.last_name].map(value => clean(value, 160)).filter(Boolean).join(' ');
  const truthy = value => ['1', 'true', 'yes', 'on'].includes(clean(value).toLowerCase());
  const utmSource = clean(input.utm_source, 240).toLowerCase();
  const suppliedSource = clean(input.source, 160).toLowerCase();
  const referrer = clean(input.referrer, 1000).toLowerCase();
  let inferredSource = utmSource;
  if (!inferredSource && (input.fbclid || referrer.includes('facebook.com') || referrer.includes('fb.com'))) inferredSource = 'facebook';
  if (!inferredSource && referrer.includes('instagram.com')) inferredSource = 'instagram';
  if (!inferredSource && (input.gclid || referrer.includes('google.') || referrer.includes('g.co'))) inferredSource = 'google';
  if (!inferredSource && (input.msclkid || referrer.includes('bing.com'))) inferredSource = 'bing';
  if (!inferredSource && referrer.includes('linkedin.com')) inferredSource = 'linkedin';
  if (!inferredSource && (referrer.includes('whatsapp.com') || referrer.includes('wa.me'))) inferredSource = 'whatsapp';
  if (!inferredSource && suppliedSource && suppliedSource !== 'website' && !suppliedSource.startsWith('website-')) inferredSource = suppliedSource;
  if (!inferredSource) inferredSource = 'direct / unknown';
  return {
    submitted_at: new Date().toISOString(),
    name: clean(input.name || input.full_name || splitName || 'Website visitor', 240),
    phone: clean(input.phone, 80), email: clean(input.email, 240), postcode: clean(input.postcode, 80),
    service: clean(input.service || 'Website enquiry', 160), timeframe: clean(input.timeframe || input.preferred_date, 240),
    message: clean(input.message, 4000), page: clean(input.page || input.page_url, 1000),
    source: inferredSource,
    landing_page: clean(input.landing_page || input.page || input.page_url, 1000),
    referrer: clean(input.referrer, 1000), utm_source: clean(input.utm_source, 240),
    utm_medium: clean(input.utm_medium, 240), utm_campaign: clean(input.utm_campaign, 240),
    utm_term: clean(input.utm_term, 240), utm_content: clean(input.utm_content, 240),
    gclid: clean(input.gclid, 300), fbclid: clean(input.fbclid, 300), msclkid: clean(input.msclkid, 300),
    session_id: clean(input.session_id, 120), client_id: clean(input.client_id, 120),
    form_name: clean(input.form_name, 200), marketing_consent: truthy(input.marketing_consent || input.consent) ? 1 : 0
  };
}

export async function insertEvent(db, request, event, ipHash = '') {
  await db.prepare(`INSERT INTO lead_events (
    occurred_at,event_name,page,landing_page,referrer,source,medium,campaign,term,content,
    gclid,fbclid,msclkid,service,link_url,link_text,phone_number,whatsapp_number,email_address,
    session_id,client_id,user_agent,ip_hash
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    new Date().toISOString(), clean(event.event_name, 80), clean(event.page), clean(event.landing_page),
    clean(event.referrer), clean(event.source, 160), clean(event.medium, 160), clean(event.campaign, 240),
    clean(event.term, 240), clean(event.content, 240), clean(event.gclid, 300), clean(event.fbclid, 300),
    clean(event.msclkid, 300), clean(event.service, 160), clean(event.link_url), clean(event.link_text, 500),
    clean(event.phone_number, 100), clean(event.whatsapp_number, 100), clean(event.email_address, 240),
    clean(event.session_id, 120), clean(event.client_id, 120), clean(request.headers.get('user-agent')), ipHash
  ).run();
}

export function csv(rows, headers, filename) {
  const escape = value => {
    let string = String(value == null ? '' : value);
    if (/^[=+\-@]/.test(string)) string = "'" + string;
    return /[",\n\r]/.test(string) ? '"' + string.replace(/"/g, '""') + '"' : string;
  };
  const body = [headers.join(','), ...rows.map(row => headers.map(key => escape(row[key])).join(','))].join('\n') + '\n';
  return new Response(body, { headers: {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': 'attachment; filename="' + filename + '"',
    'cache-control': 'no-store'
  } });
}
