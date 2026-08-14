# Security model

- Cloudflare Access is the primary browser gate. Protect the dashboard and every read/write admin API path at the edge.
- Functions also fail closed without Access evidence or an exact bearer secret.
- Access evidence is trusted only when `CLOUDFLARE_ACCESS_ENABLED=true` and the paths are actually covered by an Access policy.
- URL tokens are unsupported to prevent leakage through history, referrers and logs.
- Store money as integer pence/cents, validate pipeline enums server-side, hash IP addresses and bound input lengths.
- Treat `.dev.vars`, `.env*`, `.wrangler/` and downloaded exports as sensitive local material.
- Rotate secrets immediately if exposed and audit git history, deployment logs and generated assets.

