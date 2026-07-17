# Enterprise policy — make the block unremovable (no MDM)

This is the second layer of the moat: **force-install** the extension via the browser's own enterprise policy so a user **cannot disable or remove it**, and close the incognito side-door. It needs no MDM suite — just a registry merge, a GPO, or a dropped JSON file.

Extension ID (pinned via the `key` in [`../extension/manifest.json`](../extension/manifest.json)): **`mdfcmhkfkelkdhjbjddmkmjkmobijbgc`**

## Windows (Chrome or Edge)

- **Quick:** right-click [`windows/holdfast-force-install.reg`](windows/holdfast-force-install.reg) → **Merge** (as admin). Restart Chrome.
- **At scale:** push the same keys via Group Policy (`Computer Configuration → Administrative Templates → Google → Google Chrome → Extensions → Configure the list of force-installed apps and extensions`) or Intune.

## macOS / Linux (Chrome)

- **Linux:** copy [`chrome-managed-policy.json`](chrome-managed-policy.json) to `/etc/opt/chrome/policies/managed/holdfast.json`.
- **macOS:** deliver the same keys as a configuration profile for `com.google.Chrome` (MDM or `profiles` command).

## Verify it worked

Open `chrome://policy` → you should see `ExtensionInstallForcelist` and `IncognitoModeAvailability` applied. On `chrome://extensions` the extension shows **"Installed by your organization"** with no remove/disable toggle.

## What this gives you

- The extension **cannot be turned off or removed** by the user.
- **Incognito is disabled**, so it can't be used to dodge the block.
- Combined with a `locked` team policy, the block is genuinely **enforced**, not advisory — the core promise, without an MDM platform.

## Important caveats (read before relying on this)

1. **Publishing required.** Force-install pulls the extension from an update URL. For production, publish to the Chrome Web Store (or self-host an `update.xml`) using the **same signing key** so the ID stays `mdfcmhkfkelkdhjbjddmkmjkmobijbgc`. The private key lives in `../.keys/` (gitignored) — keep it safe; losing it changes the ID. For local testing you can load unpacked, but force-install policy only binds to a hosted extension.
2. **Browser scope only.** This locks down Chrome/Edge. It does **not** stop a different browser, a portable browser, or OS-level DNS changes — that is Layer 3 (the native agent). See [`../docs/MOAT.md`](../docs/MOAT.md).
3. **Admin rights.** Applying machine policy requires local admin / management on the device — which is exactly the "company owns the device" case this product targets.
