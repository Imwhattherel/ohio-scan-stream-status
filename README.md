# ThinLine Radio Status Page

A small status page for a ThinLine Radio scanner that runs on Vercel. It needs no build step.

- `public/index.html` is the page. It refreshes every 30 seconds.
- `api/status.js` is a serverless function. It calls `/health` and `/health/systems` on your scanner with your API key and returns a sanitized summary. The key stays on the server.

## Setup

1. In ThinLine Radio, have the server owner enable **Health** on your user. Then open **API** in the console header and create a key. Copy the `tlr_...` secret, which is shown only once.
2. Push this folder to a Git repo, or run `npx vercel` inside it.
3. In the Vercel project, go to **Settings > Environment Variables** and add:

| Variable | Required | Meaning |
|---|---|---|
| `TLR_HOST` | yes | Your scanner's base URL, e.g. `https://scanner.example.com` (no trailing path) |
| `TLR_API_KEY` | yes | The `tlr_...` key |
| `STATUS_TITLE` | no | Page title |
| `SHOW_SYSTEMS` | no | `false` hides the per-system list (default `true`) |
| `SHOW_REASONS` | no | `false` hides the degraded reasons (default `true`) |
| `SHOW_VERSION` | no | `true` includes the server version in the API response (default `false`) |
| `SYSTEM_REFS` | no | Comma-separated `systemRef` values to show (default: all) |

4. Redeploy so the variables take effect.

## How status is decided

- **Operational**: `/health` returned 200.
- **Degraded**: `/health` returned 503. The `reasons` list is shown.
- **Service unavailable**: the scanner timed out, could not be reached, or returned another 5xx.
- **Status unknown**: a 401, 403, or 429. This usually means the key is wrong, revoked, lacks the Health capability, or was rate limited.

Systems with zero calls in the last hour show an amber dot labelled quiet, not an outage. Radio traffic is often legitimately silent overnight.

## Notes

- Responses are cached at Vercel's edge for 30 seconds, so about 4 upstream requests per minute no matter how many visitors you have. The limit is about 120 per minute per key.
- The key only sees systems your account can hear, so the page only lists those.
- Vercel functions are stateless, so there is no uptime history or incident log. To add one, store each check in Vercel KV or Postgres with a cron-triggered function (note that cron frequency is limited on Vercel's free tier).
- Local test: `npx vercel dev` with a `.env.local` copied from `.env.example`.
