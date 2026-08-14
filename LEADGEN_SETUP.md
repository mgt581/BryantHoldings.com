# Bryant Group Holdings Lead Generation Preview

This implementation is intentionally confined to `preview/lead-generation-dashboard`. Do not merge or
promote it until every item in `TESTING.md` has preview evidence.

## Cloudflare Pages preview

Create or use a Cloudflare Pages project connected to this GitHub repository and deploy the preview branch.
The build command is blank, the output directory is `/`, and Pages Functions are read from `functions/`.

Create a preview-only D1 database named `bryant-holdings-leads-preview`, bind it as `LEADS_DB`, and apply
`migrations/0001_lead_generation.sql`.

Set these preview variables:

- `BUSINESS_NAME=Bryant Group Holdings`
- `BUSINESS_DOMAIN=bryantgroupholdings.co.uk`
- `LEAD_FROM_EMAIL=Bryant Group Holdings <info@bryantgroupholdings.co.uk>`
- `LEAD_TO_EMAILS=ajbryantsleads@gmail.com`
- `CLOUDFLARE_ACCESS_ENABLED=true`

Add `RESEND_API_KEY` and `LEADS_EXPORT_TOKEN` as encrypted preview secrets. Never commit them, paste them
into a URL, or expose them to browser JavaScript.

## Resend

Verify `bryantgroupholdings.co.uk` in Resend before live delivery testing. The notification goes to
`ajbryantsleads@gmail.com` and is sent by `info@bryantgroupholdings.co.uk`. The visitor's supplied email is
used as the notification's Reply-To so replying reaches the enquirer.

Sending replies *from Gmail as* `info@bryantgroupholdings.co.uk` is a separate Gmail send-as/mailbox setup;
Resend notification configuration alone cannot change Gmail's From address.

## Cloudflare Access

Protect the preview hostname paths below with one owner-only Access application and policy:

- `/dashboard*`
- `/api/dashboard`
- `/api/leads/*`
- `/api/lead-events/export`

The public ingestion endpoints `/api/lead` and `/api/lead-event` must remain reachable. Confirm an anonymous
visitor receives an Access denial for every protected path, then sign in as the owner and test the dashboard,
all eight statuses, revenue fields and both CSV downloads.

## Production gate

Production remains GitHub Pages and is not changed by this branch. Promotion requires a deliberate hosting
decision because GitHub Pages cannot execute Pages Functions; production must either move to Cloudflare Pages
from the same GitHub source or use a separately routed Cloudflare Worker API.
