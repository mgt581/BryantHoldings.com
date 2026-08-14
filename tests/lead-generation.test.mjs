import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

import { adminAllowed, normalizeLead, STATUSES } from '../functions/_shared/core.js';
import { onRequestPost as storeEvent } from '../functions/api/lead-event.js';
import { onRequestPost as storeLead } from '../functions/api/lead.js';
import { onRequestPatch as updateLead } from '../functions/api/leads/[id].js';
import { onRequestGet as exportLeads } from '../functions/api/leads/export.js';
import { onRequestGet as exportEvents } from '../functions/api/lead-events/export.js';

const root = new URL('../', import.meta.url);

test('all public HTML pages load tracking exactly once and dashboard does not', async () => {
  const files = (await readdir(root)).filter((file) => file.endsWith('.html') && file !== 'dashboard.html');
  assert.deepEqual(files.sort(), ['about.html', 'companies.html', 'contact.html', 'gallery.html', 'index.html', 'privacy.html']);
  for (const file of files) {
    const html = await readFile(new URL(file, root), 'utf8');
    assert.equal((html.match(/src="lead-tracking\.js"/g) || []).length, 1, file);
    assert.equal((html.match(/src="site-config\.js"/g) || []).length, 1, file);
  }
  const dashboard = await readFile(new URL('dashboard.html', root), 'utf8');
  assert.doesNotMatch(dashboard, /lead-tracking\.js/);
  assert.match(dashboard, /noindex,nofollow/i);
});

test('real forms use the API, retain validation and expose no admin token', async () => {
  for (const file of ['index.html', 'contact.html']) {
    const html = await readFile(new URL(file, root), 'utf8');
    assert.match(html, /data-lead-form/);
    assert.match(html, /action="\/api\/lead"/);
    assert.match(html, /name="website"/);
    assert.doesNotMatch(html, /action="mailto:/i);
  }
  const source = await readFile(new URL('script.js', root), 'utf8');
  assert.match(source, /LeadGen\.getAttribution/);
  assert.match(source, /form_name/);
  assert.match(source, /fetch\('\/api\/lead'/);
  assert.doesNotMatch(source, /LEADS_EXPORT_TOKEN|RESEND_API_KEY/);
});

test('Facebook and click-id attribution use the proven source inference', () => {
  assert.equal(normalizeLead({ name: 'A', email: 'a@example.test', referrer: 'https://m.facebook.com/' }).source, 'facebook');
  assert.equal(normalizeLead({ name: 'A', email: 'a@example.test', gclid: '123' }).source, 'google');
  assert.equal(normalizeLead({ name: 'A', email: 'a@example.test', msclkid: '123' }).source, 'bing');
  assert.equal(normalizeLead({ name: 'A', email: 'a@example.test' }).source, 'direct / unknown');
});

test('Access or bearer auth works while query-string tokens never authenticate', async () => {
  const env = { CLOUDFLARE_ACCESS_ENABLED: 'true', LEADS_EXPORT_TOKEN: 'preview-secret' };
  assert.equal(await adminAllowed(new Request('https://example.test/dashboard', { headers: { 'cf-access-jwt-assertion': 'preview-jwt' } }), env), true);
  assert.equal(await adminAllowed(new Request('https://example.test/api/dashboard', { headers: { authorization: 'Bearer preview-secret' } }), env), true);
  assert.equal(await adminAllowed(new Request('https://example.test/api/dashboard?token=preview-secret'), env), false);
});

function eventDb(rows) {
  return {
    prepare(sql) {
      return {
        async run() { return { success: true }; },
        bind(...values) {
          return { async run() { rows.push({ sql, values }); return { success: true }; } };
        }
      };
    }
  };
}

test('page and contact events are accepted and invalid events fail', async () => {
  for (const eventName of ['page_view', 'phone_click', 'whatsapp_click', 'email_click', 'quote_cta_click']) {
    const rows = [];
    const response = await storeEvent({
      env: { LEADS_DB: eventDb(rows) },
      request: new Request('https://example.test/api/lead-event', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event_name: eventName })
      })
    });
    assert.equal(response.status, 200, eventName);
    assert.equal(rows.length, 1, eventName);
  }
  const invalid = await storeEvent({
    env: { LEADS_DB: eventDb([]) },
    request: new Request('https://example.test/api/lead-event', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event_name: 'invalid' })
    })
  });
  assert.equal(invalid.status, 400);
});

test('lead is stored before a failed email delivery and failure remains recorded', async () => {
  const operations = [];
  const db = {
    prepare(sql) {
      return {
        async run() { operations.push({ sql, values: [] }); return { success: true }; },
        bind(...values) {
          return { async run() {
            operations.push({ sql, values });
            if (sql.includes('INSERT INTO leads')) return { meta: { last_row_id: 42 } };
            return { meta: { changes: 1 } };
          } };
        }
      };
    }
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { operations.push({ sql: 'RESEND_FETCH', values: [] }); return new Response('rejected', { status: 400 }); };
  try {
    const response = await storeLead({
      env: {
        LEADS_DB: db,
        RESEND_API_KEY: 'test-only-key',
        LEAD_TO_EMAILS: 'ajbryantsleads@gmail.com',
        LEAD_FROM_EMAIL: 'Bryant Group Holdings <info@bryantgroupholdings.co.uk>'
      },
      request: new Request('https://example.test/api/lead', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Preview Test', email: 'lead@example.test', service: 'Partnership Opportunity' })
      })
    });
    assert.equal(response.status, 502);
    const insertIndex = operations.findIndex((item) => item.sql.includes('INSERT INTO leads'));
    const emailIndex = operations.findIndex((item) => item.sql === 'RESEND_FETCH');
    assert.ok(insertIndex >= 0 && insertIndex < emailIndex);
    const deliveryUpdate = operations.find((item) => item.sql.includes('UPDATE leads SET delivery_status'));
    assert.equal(deliveryUpdate.values[0], 'failed');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function updateDb() {
  return {
    prepare(sql) {
      return {
        async run() { return { success: true }; },
        bind() { return { async run() { return { meta: { changes: sql.includes('UPDATE leads') ? 1 : 0 } }; } }; }
      };
    }
  };
}

test('all eight statuses and non-negative revenue values validate', async () => {
  assert.deepEqual(STATUSES, ['TEST', 'NEW', 'GENUINE', 'SPAM', 'CONTACTED', 'QUOTED', 'WON', 'LOST']);
  for (const status of STATUSES) {
    const response = await updateLead({
      env: { LEADS_DB: updateDb(), LEADS_EXPORT_TOKEN: 'secret' }, params: { id: '1' },
      request: new Request('https://example.test/api/leads/1', {
        method: 'PATCH', headers: { 'content-type': 'application/json', authorization: 'Bearer secret' },
        body: JSON.stringify({ lead_status: status, quote_value_pence: 100, won_revenue_pence: 50 })
      })
    });
    assert.equal(response.status, 200, status);
  }
  const invalid = await updateLead({
    env: { LEADS_DB: updateDb(), LEADS_EXPORT_TOKEN: 'secret' }, params: { id: '1' },
    request: new Request('https://example.test/api/leads/1', {
      method: 'PATCH', headers: { 'content-type': 'application/json', authorization: 'Bearer secret' },
      body: JSON.stringify({ lead_status: 'INVALID', quote_value_pence: -1, won_revenue_pence: 0 })
    })
  });
  assert.equal(invalid.status, 400);
});

function exportDb() {
  return {
    prepare(sql) {
      return {
        async run() { return { success: true }; },
        async all() {
          if (sql.includes('FROM leads')) return { results: [{ submitted_at: '2026-08-14', name: '=Unsafe formula', email: 'lead@example.test' }] };
          if (sql.includes('FROM lead_events')) return { results: [{ occurred_at: '2026-08-14', event_name: 'page_view' }] };
          return { results: [] };
        }
      };
    }
  };
}

test('both CSV exports require auth and neutralise spreadsheet formulas', async () => {
  const env = { LEADS_DB: exportDb(), LEADS_EXPORT_TOKEN: 'secret' };
  assert.equal((await exportLeads({ env, request: new Request('https://example.test/api/leads/export') })).status, 401);
  assert.equal((await exportEvents({ env, request: new Request('https://example.test/api/lead-events/export?token=secret') })).status, 401);
  const headers = { authorization: 'Bearer secret' };
  const leads = await exportLeads({ env, request: new Request('https://example.test/api/leads/export', { headers }) });
  const events = await exportEvents({ env, request: new Request('https://example.test/api/lead-events/export', { headers }) });
  assert.equal(leads.status, 200);
  assert.equal(events.status, 200);
  assert.match(await leads.text(), /'=Unsafe formula/);
  assert.match(await events.text(), /occurred_at,event_name/);
});

test('contact identity and privacy disclosure are correct', async () => {
  for (const file of ['index.html', 'contact.html', 'privacy.html']) {
    const html = await readFile(new URL(file, root), 'utf8');
    assert.doesNotMatch(html, /info@bryantholdings\.com/i);
  }
  const privacy = await readFile(new URL('privacy.html', root), 'utf8');
  assert.match(privacy, /IP addresses are converted\s+into one-way hashes/i);
  assert.match(privacy, /Resend processes notification emails/i);
});
