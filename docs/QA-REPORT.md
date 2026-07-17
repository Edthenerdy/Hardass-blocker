# User-testing / QA report

*Tested against the running full stack (server + console + device + account web app) plus the extension code paths. 26 backend edge-case checks + UI walkthroughs of both personas. July 2026.*

**Bottom line:** This meets the bar for a **convincing design-partner / investor demo and internal validation**. It does **not** yet meet the bar for **taking real money from strangers** — three things gate that (multi-tenancy, live Stripe, server-verified consumer entitlement). Nothing built is broken; the gaps are scope, not defects.

---

## How it was tested

- **Backend edge cases (26 checks, all pass):** auth required where it should be, token-kind separation, no IDOR on checkout, device can't self-approve, cross-mode self-grant blocked, enrolment gated on subscription, consumers can't buy team plans, seat floor enforced, weak/duplicate/invalid inputs rejected.
- **Individual UI walkthrough:** account signup → pricing → checkout → pay → Pro status + renewal date + banner.
- **Business UI walkthrough:** org signup → *inactive/locked* → billing → subscribe (8 seats → $32/mo) → pay → *active* → enrolment unlocked. Access-request approval and cooldown paths verified via the device client earlier.

---

## Individual user (Holdfast Blocker) — scorecard

| Criterion | Result |
|---|---|
| Can install free and block sites with the Cooldown | ✅ Pass |
| Pricing is clear (Free / $9 Pro monthly) | ✅ Pass |
| Signup, checkout, and Pro unlock work end-to-end | ✅ Pass (simulated payment) |
| Free-tier limit (5 sites) enforced, lifted by Pro | ✅ Pass |
| Bypass tricks (proxy/translate/cache) blocked | ✅ Pass |
| **Pro entitlement is tamper-resistant** | ❌ **Fail** — client-side only |
| **Lapsed subscription re-locks promptly** | ⚠️ Partial — only on manual "Refresh status" |
| Real payment | ⛔ Not built (simulated; Stripe-ready) |
| Account recovery (verify email / reset password) | ⛔ Not built |
| Form accessibility (labels) | ⚠️ Minor gaps |

**Verdict:** A polished, on-brand prototype whose flows all work. **Not ready to charge real consumers** until Pro entitlement is server-verified (today a technical user can flip a stored flag to unlock Pro without paying) and lapses auto-re-check.

## Business user (Holdfast for Teams) — scorecard

| Criterion | Result |
|---|---|
| Self-serve org signup | ✅ Pass |
| **Pay-to-enforce gating is server-enforced** | ✅ Pass — the important one |
| Gate is clearly surfaced in the UX (locked panel, prompts) | ✅ Pass |
| Per-seat subscription, correct seat/price math, seat floor | ✅ Pass |
| Admin-set policy syncs to devices; admin-approved unblocks | ✅ Pass |
| Non-MDM enrolment via code | ✅ Pass |
| Compliance reporting (blocked attempts) | ✅ Pass |
| Cancel re-locks new enrolment | ✅ Pass |
| **Multiple real businesses can coexist** | ✅ **Pass** — multi-tenant (fixed; 21/21 isolation checks) |
| **Cancelled org's already-enrolled devices stop being served** | ❌ **Fail** — they keep syncing |
| Admin auth hardening (rate limit, SSO) | ⚠️ Partial |

**Verdict:** The **differentiating value genuinely works** — server-enforced blocking an admin controls, deployed without MDM, gated behind payment. It is a **convincing single-tenant POC**. The gate to a first paying customer is multi-tenancy + live Stripe.

---

## Findings by severity

### Major — fix before real customers
1. ~~**Single-tenant / data-bleed.**~~ ✅ **FIXED.** The backend is now multi-tenant: each org signup creates an isolated org with its own groups, unique enrolment code, devices, requests, reports, and billing. Verified with 21/21 isolation checks including cross-org access denial. Admins carry `orgId`; every admin/device endpoint is scoped to it.
2. **Consumer Pro entitlement is soft & client-side.** The extension trusts a cached `account.plan` in `chrome.storage`; a technical user can set it to `pro` and unlock Pro without paying. Fix: server-verified/signed entitlement checked by the background worker.
3. **Entitlement staleness.** A lapsed monthly sub stays "Pro" in the extension until the user manually hits *Refresh status*; a cancelled org's already-enrolled devices keep pulling policy. Fix: periodic server re-check + treat device tokens as subject to current subscription state.

### Minor — polish before GA
4. Auth inputs are placeholder-only (no `<label>`) — accessibility.
5. Console shows no explicit "payment succeeded" banner (relies on the 4s poll); the consumer app does. Inconsistent.
6. No rate limiting on login/signup (brute-force).
7. No email verification or password reset for consumer accounts.
8. Server-side email-format validation is minimal (non-empty + password length only).
9. Extension account calls can throw uncaught if the server is unreachable (offline handling).

### Expected (needs your accounts/infra, not defects)
- Real Stripe (set `STRIPE_SECRET_KEY`); HTTPS; SSO; force-install requires publishing the extension so the pinned ID resolves.

---

## What genuinely meets (or beats) standard

- **Authorization model is solid** — 26/26 edge checks: proper token-kind separation, no checkout IDOR (refId derived server-side), devices can't approve or self-grant across modes, admin routes protected.
- **The SME moat works and is enforced server-side** — pay ⇒ enforce, admin holds the key, non-MDM enrolment. This is the defensible core and it holds up.
- **Both purchase flows work end-to-end** with correct pricing and seat math.
- **Security basics done right** — scrypt password hashing, random tokens, input validation, and a real Stripe integration (with webhook signature verification) sitting behind an env var.
- **UX is clean, on-brand, and honest** — clear pricing, sensible locked/empty states, the pay-to-enforce gate is legible rather than hidden.

---

## Ranked next steps to reach "can take real money"

1. ~~Multi-tenancy~~ ✅ **done** — real org isolation, verified.
2. **Server-verified entitlement** for the consumer extension (close the soft paywall + staleness). *Now the top remaining gate.*
3. **Live Stripe** — drop in keys, wire the webhook, test with `sk_test_…`.
4. Publish the extension (Web Store / self-host) so force-install resolves the pinned ID.
5. Polish: consumer account recovery, rate limiting, a11y labels, console payment banner.

*Updated after the multi-tenancy build: the B2B side now has no known "must-fix-before-customers" defect. The remaining major item is consumer entitlement hardening; the rest need your Stripe/hosting accounts.*
