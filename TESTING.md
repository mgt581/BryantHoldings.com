# Preview test checklist

Mark each line PASS or BLOCKED with evidence.

- Every public page loads the tracker once; dashboard does not.
- First landing records referrer, `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `gclid`, `fbclid` and `msclkid`.
- Navigation keeps first-touch attribution and stable session/client IDs.
- Page view reaches D1.
- Phone, WhatsApp, email and quote CTA clicks reach D1 with link detail.
- Every real form preserves its validation/UI and stores exactly one lead.
- Lead is stored before email delivery; failed delivery remains visible with `delivery_status=failed`.
- Dashboard is blocked when unauthenticated and works after Access sign-in.
- Query-string `token=` does not authenticate any admin route.
- Recent leads/events and source/service/landing-page summaries are correct.
- All eight pipeline values can be saved; invalid values return 400.
- Quote and won revenue accept non-negative currency values and roll up by source.
- Leads and events CSV exports download after auth and fail without auth.
- No secret appears in source, built assets, URLs, commits or logs.
- Mobile/desktop layout, console, accessibility basics and existing SEO/routes are unchanged.
- Preview form delivery, D1 binding and Access policy pass before production promotion.

