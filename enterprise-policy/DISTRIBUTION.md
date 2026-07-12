# Enterprise distribution — how Deadbolt for Teams reaches devices

For the enterprise tier, **distribution *is* the product**: "genuinely-enforced blocking an SME can deploy without an IT department." This is the operational runbook for getting the managed extension onto staff devices, locked and self-enrolled.

## The one mechanism

Everything hinges on **browser-native force-install policy**, which does two jobs at once:

1. **Installs + locks** the extension — no disable/remove toggle on `chrome://extensions`, incognito disabled. (See [`chrome-managed-policy.json`](chrome-managed-policy.json) and [`windows/hardass-force-install.reg`](windows/hardass-force-install.reg).)
2. **Configures it** — the same policy pushes `serverUrl` + `enrollmentCode` as *3rd-party managed configuration*. The extension reads these via `chrome.storage.managed` (schema: [`../extension/managed_schema.json`](../extension/managed_schema.json)) and **self-enrols on first launch — no user input, no options screen** (`autoEnrollFromManagedConfig()` in [`../extension/background.js`](../extension/background.js)).

Pinned extension ID (from the manifest `key`): **`mdfcmhkfkelkdhjbjddmkmjkmobijbgc`**.

## Prerequisite — host the extension with a stable update URL

Force-install pulls from an update URL, so the extension must be hosted:

- **Chrome Web Store, published Unlisted** (recommended) — gives the standard update URL `https://clients2.google.com/service/update2/crx`. Unlisted = not searchable, install-by-ID only. Set to **Private** to restrict to a Google Workspace domain.
- **Self-hosted `update.xml` + `.crx`** — full control, no store dependency; you host and sign.

Either way, **publish with the existing signing key** so the ID stays `mdfcmhkfkelkdhjbjddmkmjkmobijbgc` — every deployed policy targets that ID. The private key lives in `../.keys/` (gitignored). **Store it in a secrets manager: lose it and the ID changes and every deployed policy breaks.**

---

## Channel 1 — Google Workspace / Microsoft 365 admin (cleanest; pick this as the lead demo)

Best for the large share of SMEs that already have a directory. Zero per-device work.

**Google Workspace (Chrome):**
1. Publish the extension Unlisted to the Chrome Web Store.
2. **Admin console → Devices → Chrome → Apps & extensions → Users & browsers.**
3. Select the org unit (e.g. "Reception"), add the extension by ID, set installation policy to **Force install**.
4. Under the extension's **Policy for extensions** field, paste the managed config:
   ```json
   { "serverUrl": "https://team.deadbolt.app", "enrollmentCode": "NSD-4K9-QX2" }
   ```
5. Devices in that OU force-install, lock, and self-enrol to the right group automatically.

**Microsoft 365 / Intune (Edge):** same idea via **Intune → Configuration profiles → Edge → `ExtensionInstallForcelist`** plus the Edge managed-config equivalent.

---

## Channel 2 — No directory at all (the "no IT" wedge)

Company-owned devices, no Workspace/Intune. This is the differentiated pitch: *deploy before lunch, no IT department.*

**Windows:** deploy [`windows/hardass-force-install.reg`](windows/hardass-force-install.reg) — right-click → **Merge** as admin, or push via GPO / login script. It already includes the force-install, incognito lockdown, **and** the `3rdparty\...\policy` keys carrying `serverUrl` + `enrollmentCode`. Edit those two values to the tenant's before shipping.

**macOS / Linux:** deploy [`chrome-managed-policy.json`](chrome-managed-policy.json).
- Linux: copy to `/etc/opt/chrome/policies/managed/hardass.json`.
- macOS: deliver the same keys as a configuration profile for `com.google.Chrome`.

**Productionize:** wrap the above in a **signed per-OS installer** that writes the policy with the tenant's values baked in, so the owner double-clicks one file per machine. Needs **code-signing certs** (Authenticode on Windows, Apple Developer ID on macOS) or SMBs get "unknown publisher" warnings that kill the story.

---

## Channel 3 — RMM

Many trades/clinics/call-centres run an RMM (NinjaOne, Atera, Action1) even without "IT". Push the same `.reg`/profile + installer to every endpoint in one click. Great for the 15–50 seat end.

---

## Verify a deployment

1. `chrome://policy` → confirm `ExtensionInstallForcelist`, `IncognitoModeAvailability`, and the 3rd-party config are **Applied**.
2. `chrome://extensions` → the extension shows **"Installed by your organization"** with no remove/disable toggle.
3. Open the extension → it should already say **"Managed by …"** and appear in the admin console's **Devices** list within ~30s (no manual enrolment).

## Honest scope (protects the brand)

This is **Layer 2** of the moat ([`../docs/MOAT.md`](../docs/MOAT.md)): it locks down **Chrome/Edge on a managed device**. It does **not** stop a second/portable browser or a DNS/hosts change. For an SME's duty-of-care use on **company-owned devices**, browser scope is often genuinely enough — say so plainly. The bulletproof version is the **Layer 3 native OS agent** (a signed service enforcing at DNS/hosts level), which is the harder build and the real long-term moat. Don't sell Layer 3 until it exists.
