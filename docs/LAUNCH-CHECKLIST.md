# Launch checklist — path to taking real money

Living punch list. **[Me]** = buildable with no accounts. **[You→Me]** = you provide one thing, then I build. **[You]** = only you can (accounts, payments, real-world).

## Gate 1 — Consumer entitlement ✅ DONE
- [x] **[Me]** Extension re-checks entitlement against the server hourly + on startup, with a grace window; a lapsed sub downgrades to free automatically (no more staleness).
- [x] **[Me]** Server signs entitlements (ECDSA P-256); the extension verifies the signature with the server's public key. A flipped `chrome.storage` flag has no valid signature → treated as free. Closes the soft-paywall.
- *Note: a determined user can still patch the extension's own code — that's the irreducible ceiling for any client-side consumer paywall. This raises the bar from "edit a flag" to "patch and re-sign," which is the standard consumer bar.*

## Gate 2 — Live payments (Stripe)
- [ ] **[You · ~10 min]** Create a Stripe account; copy the **test** secret key (`sk_test_…`).
- [ ] **[You · ~5 min]** Add a webhook → `…/api/stripe/webhook`; copy its signing secret (`whsec_…`). For local testing: `stripe listen --forward-to localhost:8787/api/stripe/webhook`.
- [ ] **[You→Me]** Send me the two test values → I set `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` and run a real test-mode purchase for consumer + SME, confirming entitlements flip via webhook.
- [ ] **[You]** Live mode: business + bank details in Stripe, then swap test keys for live.

## Gate 3 — Ship the extension (needed for force-install)
- [ ] **[You · one-time $5]** Register a Chrome Web Store developer account.
- [ ] **[Me]** Produce the final upload zip; verify listing copy + permission justifications ([`STORE-LISTING.md`](STORE-LISTING.md), assets in `store-assets/`).
- [ ] **[You · ~15 min]** Upload zip, paste listing, submit for review (~1–3 days).
- [ ] **[You→Me]** Send the assigned extension ID → I confirm it matches the pinned key or update [`enterprise-policy/`](../enterprise-policy/).

## Gate 4 — Production hosting
- [x] **[Me]** Containerized (`Dockerfile`, `docker-compose.yml`, `.env.example`); state + keys persist to a `/data` volume via `DATA_DIR`. Ready to deploy — see [`DEPLOY.md`](DEPLOY.md).
- [ ] **[You · decision]** Pick a host (Render / Railway / Fly / VPS) + a domain, point it at the repo, add a `/data` disk. HTTPS comes free.
- [ ] **[Me · later]** Swap the JSON-file store for Postgres — only when you outgrow a single instance.

## Polish ✅ DONE
- [x] **[Me]** Accessibility labels on the consumer auth form.
- [x] **[Me]** "Payment received" banner in the console (consumer app already had one).
- [x] **[Me]** Rate-limit auth (10 attempts / 15 min per IP).
- [x] **[Me]** Server-side email-format validation.

## Deferred bigger bets
- [ ] **Moat layer 3** — native OS agent (DNS / other-browser / uninstall resistance). Needs native dev + code-signing certs. See [`MOAT.md`](MOAT.md).
- [ ] **SSO** for enterprise admins — needs an IdP app registration.
- [ ] **Firefox** build — manifest tweak + AMO account.
- [ ] **Email service** (password reset / verify) — needs Postmark / SES.

---

## Fastest path to first dollar
1. ~~Gate 1~~ ✅ and ~~polish~~ ✅ — done.
2. **Gate 2 test mode** — you send 2 keys, I wire + verify. *(smallest unlock)*
3. **Gate 4 hosting** — you pick a host, I build; gets it off localhost.
4. **Gate 3 store** — you submit in parallel (review takes days).

After Gate 2, the SME product can take real money from a design partner on a hosted instance. The B2B side has no remaining must-fix defects.
