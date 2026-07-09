# Hardass Blocker — Chrome Web Store listing assets

Upload-ready graphics for the store listing. Every image is a screenshot of the
**real extension UI** (same markup, CSS, copy, Rocky logo and palette as
`extension/blocked.*` and `extension/popup.*`) — not marketing art.

## Files → store fields

| File | Size | Store field |
|---|---|---|
| `store-icon-128.png` | 128×128 (RGBA, transparent corners) | **Store icon** |
| `shot-1-cooldown.png` | 1280×800 | **Screenshot 1** (lead) — cooldown running, unblock locked |
| `shot-2-mirror.png` | 1280×800 | **Screenshot 2** — relapse history / "show the mirror" |
| `shot-3-popup.png` | 1280×800 | **Screenshot 3** — the popup: block a site in seconds |
| `shot-4-nice-try.png` | 1280×800 | **Screenshot 4** — anti-bypass ("no side doors") |
| `shot-5-reason.png` | 1280×800 | **Screenshot 5** — cooldown done, write a reason |
| `promo-440x280.png` | 440×280 | **Small promo tile** |
| `marquee-1400x560.png` | 1400×560 | **Marquee promo tile** (optional) |

Screenshots must be exactly **1280×800** or 640×400. The first screenshot is the
one shown largest, so it leads with the flagship cooldown block.

## Regenerating

```bash
bash store-assets/src/render.sh
```

`src/build-pages.js` writes one HTML page per asset (reproducing each real UI
state); `render.sh` drives headless Chrome to screenshot each at its exact pixel
size. Edit the generator to change copy or add states — never hand-edit the PNGs.

> Note: the display wordmark falls back to **Arial Black** (Windows) since Archivo
> Black isn't installed locally. If you want the exact brand face, install Archivo
> Black before re-rendering and it will be picked up automatically.
