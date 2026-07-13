# Chrome Web Store submission — click-by-click (Holdfast)

~40 minutes. Have `docs/STORE-LISTING.md` open in another tab to copy from. Everything you need is in this repo.

## Before you open the dashboard (2 pre-reqs)
- [ ] **Privacy-policy URL live.** Enable GitHub Pages: repo → *Settings → Pages → Source: Deploy from a branch → Branch: `main` (or your launch branch) / folder `/docs`* → Save. After ~1 min your policy is at `https://<username>.github.io/<repo>/privacy.html`. Open it to confirm it loads.
- [ ] **Contact email you own** in `docs/privacy.html` (currently `support@holdfast.app`). Either grab the domain + forwarding, or change it to an address you own, then rebuild the zip (or edit before zipping).

## The zip
- [ ] Use `holdfast-extension.zip` (in your Downloads / repo). It has `manifest.json` at the root — correct for upload.

## In the Developer Dashboard (chromewebstore.google.com/devconsole)
1. [ ] Click **+ New item** → upload `holdfast-extension.zip` → wait for it to process.
2. **Store listing** tab:
   - [ ] **Description** → paste the detailed description from `STORE-LISTING.md`.
   - [ ] **Category** → *Productivity* (sub: Workflow & Planning if asked).
   - [ ] **Language** → English.
   - [ ] **Store icon** → auto-pulled from the 128px icon; confirm it shows.
   - [ ] **Screenshots** → upload the four from `docs/store-assets/` (put `screenshot-01-cooldown.png` first — it's the hero).
   - [ ] **Small promo tile** → upload `docs/store-assets/promo-tile.png` (440×280).
3. **Privacy practices** tab:
   - [ ] **Single purpose** → paste from `STORE-LISTING.md`.
   - [ ] **Permission justifications** → paste each one from `STORE-LISTING.md` into its field (`declarativeNetRequest`, `storage`, `alarms`, `activeTab`, host permission).
   - [ ] **Remote code** → **No**.
   - [ ] **Data collection** → declare **none collected**.
   - [ ] **Tick all three data-usage certifications** (see `STORE-LISTING.md`).
   - [ ] **Privacy policy URL** → paste your GitHub Pages URL.
4. **Distribution** tab:
   - [ ] Visibility → **Public** (or Unlisted first if you want to soft-test the link before going public).
   - [ ] Regions → All.
5. [ ] **Save draft** → **Submit for review**.

## After submitting
- [ ] Note the item ID / confirm the pinned extension ID matches `mdfcmhkfkelkdhjbjddmkmjkmobijbgc` (from the signing key).
- [ ] Review usually lands in hours–days. If Google emails a **permission question** (likely about `<all_urls>`), reply fast quoting the host-permission justification in `STORE-LISTING.md`.
- [ ] Once approved, grab the live URL → swap it into `docs/index.html` (the `#` CTA, marked TODO) and into `docs/LAUNCH-CONTENT.md` (`<STORE_URL>`), then launch.

## Gotchas
- Don't include the word **"unbypassable"** anywhere — it invites both reviewer scrutiny and bad reviews.
- If the review flags the broad host permission, the honest single-purpose + justification usually clears it. Don't narrow the permission unless forced — blocking any user-chosen site genuinely needs it.
- Keep the **signing key private** (`.keys/`). It's what keeps the extension ID stable for the enterprise force-install story later.
