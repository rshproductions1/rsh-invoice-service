# RSH Invoice Email Service

Headless-Chromium microservice: renders an RSH invoice to PDF and emails it via
Resend from `invoice@rifatshakhawathossain.com`. Called by the RSH ERP app; the
caller's Supabase admin JWT is verified server-side. No secrets in the repo —
all via env vars.

## Env vars (set in Render)
- `RESEND_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `ALLOWED_ORIGIN` (e.g. https://rsh-productions.vercel.app)
- `FROM_EMAIL` (invoice@rifatshakhawathossain.com)
- `FROM_NAME` (RSH Productions)

## Endpoint
`POST /send-invoice` — Authorization: Bearer <supabase-jwt>, body: { event, client, packages, addons, allEvents, recipient, message }
