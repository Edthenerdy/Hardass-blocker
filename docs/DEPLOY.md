# Deploy guide

Everything here is turnkey — the code is ready. The steps that need an account or a card are marked **[you]**; run them and the product is live.

---

## 1. Host the server (pilot-ready)

The server is a zero-dependency Node app in a container. State (`data.json`) and signing keys persist to the `/data` volume, so they survive redeploys. A single instance on a persistent disk is fine for a design-partner pilot; move to Postgres when you outgrow one box (see §4).

### Run it locally with Docker
```bash
docker compose up --build
# → http://localhost:8787/console/  ·  /account/  ·  /device/
```

### Deploy to Render (example — Railway/Fly are similar) **[you]**
1. Push is already done — point Render at the GitHub repo.
2. New → **Web Service** → pick `Edthenerdy/Hardass-blocker`.
3. Environment: **Docker** (it auto-detects the `Dockerfile`).
4. Add a **persistent disk** mounted at `/data` (1 GB is plenty).
5. Env vars: `PORT=8787`, `DATA_DIR=/data`. (Add the Stripe vars in §3.)
6. Deploy. Render gives you `https://<app>.onrender.com` with HTTPS included.

That URL is what staff enter as the **Server URL** when enrolling, and where the console/account pages live.

---

## 2. Point the clients at the hosted server

- **Console / account** are served by the same host — just share the URL.
- **Extension (managed mode):** staff enter the hosted URL + their org's enrolment code in the extension's Team settings.
- **Enterprise force-install** ([`enterprise-policy/`](../enterprise-policy/)) works once the extension is published (§5).

---

## 3. Turn on real payments (Stripe) **[you → me]**

1. Create a Stripe account → Developers → API keys → copy the **test** secret key `sk_test_…`.
2. Developers → Webhooks → **Add endpoint** → URL `https://<your-host>/api/stripe/webhook` → events: `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`. Copy the signing secret `whsec_…`.
3. Set env vars on the host: `STRIPE_SECRET_KEY=sk_test_…`, `STRIPE_WEBHOOK_SECRET=whsec_…`. Redeploy.
4. The app auto-switches from simulated to live Stripe (startup log confirms which). Test a purchase with card `4242 4242 4242 4242`.
5. **Local testing:** `stripe listen --forward-to localhost:8787/api/stripe/webhook`.
6. **Go live:** add business + bank details in Stripe, swap `sk_test_`/`whsec_` for live keys.

*Send me the test keys and I'll run an end-to-end test-mode purchase for both products and confirm entitlements flip via the webhook.*

---

## 4. Scale storage to Postgres (only when you outgrow one instance)

Not needed for a pilot. When you need multiple instances or heavy write volume, the persistence layer (`server/db.js`) is the single seam to swap: replace the JSON load/save with Postgres reads/writes behind the same interface. Flag me when you pick a managed Postgres and I'll do the adapter + migration.

---

## 5. Publish the extension (needed for force-install) **[you]**

1. Register a Chrome Web Store developer account (one-time **$5**).
2. Build the upload zip: `node tools/gen-icons.js` (icons) then zip the `extension/` folder contents (or use the pre-built `dist/hardass-blocker-*.zip`).
3. Create a listing — copy is in [`STORE-LISTING.md`](STORE-LISTING.md); assets in [`../store-assets/`](../store-assets/); privacy policy at [`privacy-policy.html`](privacy-policy.html) (host it or paste the URL).
4. Upload, submit for review (~1–3 days).
5. **Send me the assigned extension ID** — I confirm it matches the pinned key in the manifest, or update the force-install policy files in [`enterprise-policy/`](../enterprise-policy/).

---

## Quick reference — what only you can do

| Step | Why it needs you |
|---|---|
| Create Stripe account + keys | Financial account tied to your identity |
| Register Chrome Web Store dev account ($5) | Google account + payment |
| Pick + provision a host and domain | Hosting account + billing |

Everything else (container, config, webhook handling, entitlements, policy files, listing copy) is done.
