# Becoming Engine — Mobile (PWA)

Read-only daily schedule view of your Becoming Engine, installable on
Android (or any modern browser) as a Progressive Web App. Mirrors the
desktop app's blocks; swipe left/right to step day-by-day.

## What's here

| File | Role |
|---|---|
| `index.html`           | App shell |
| `style.css`            | Dark monochromatic theme (mirrors desktop) |
| `app.js`               | Day rendering + swipe navigation |
| `manifest.webmanifest` | PWA manifest (installable, standalone, theme color) |
| `service-worker.js`    | Offline caching (cache-first for shell, network-first for `schedule.json`) |
| `icon.svg`             | App icon (any-purpose) |
| `icon-maskable.svg`    | App icon (Android adaptive icon, safe-zone padded) |
| `schedule.json`        | Exported schedule data (regenerated from the desktop app) |

## How updates flow

```
Desktop Becoming Engine (Streamlit)
        │
        │ Settings → "Export schedule.json"
        ▼
mobile/schedule.json
        │
        │ git add + commit + push
        ▼
GitHub repo
        │
        │ GitHub Pages auto-deploys
        ▼
Phone PWA (Android / iOS)
        │
        │ next online launch — service worker fetches fresh schedule.json
        ▼
Updated daily view
```

The app shell (HTML/CSS/JS) is cached aggressively for instant launch
and offline use. `schedule.json` is **network-first**: every online
launch tries to fetch the latest, falling back to the cached copy when
offline.

## One-time setup — host on GitHub Pages

These steps put the `mobile/` folder on the public web so your phone
can install it as an app.

### 1. Initialise a GitHub repo

If the project isn't already a git repo:

```bash
cd "Becoming Engine Application/becoming_engine"
git init
git add .
git commit -m "initial Becoming Engine app + mobile PWA"
```

Create an empty repo on GitHub (private is fine — Pages still serves
static files publicly from a private repo if you choose Pages → Public).
Then:

```bash
git remote add origin git@github.com:<your-username>/<repo>.git
git branch -M main
git push -u origin main
```

### 2. Enable GitHub Pages on the repo

GitHub repo → **Settings** → **Pages**:

- **Source:** *Deploy from a branch*
- **Branch:** `main` / **Folder:** `/` (root)

Pages will serve every file in the repo including the `mobile/` folder.
After ~1 minute, the URL will be:

```
https://<your-username>.github.io/<repo>/mobile/
```

(If you'd rather have the mobile app at the root URL, use a separate
repo with just the contents of `mobile/` in it — same files, no
`/mobile/` path component.)

### 3. Install on Android

1. Open Chrome on your Android phone.
2. Visit `https://<your-username>.github.io/<repo>/mobile/`.
3. Tap the menu (⋮) → **Add to Home screen** / **Install app**.
4. The Becoming icon shows on your home screen. Tap to launch — opens
   in standalone mode (no browser chrome).

## Daily flow

```
Desktop:
  Plan/edit blocks in Streamlit
  Settings → Mobile schedule export → Export schedule.json
  git add mobile/schedule.json
  git commit -m "schedule update <date>"
  git push

Phone:
  Open the Becoming app
  Pull-to-refresh OR close & reopen → service worker fetches the new
  schedule.json
  Swipe forward/back to navigate days
```

If the desktop app is something you change daily, you can script the
push (e.g. a one-liner that runs `python -m utils.mobile_export &&
git add … && git commit … && git push`).

## Schedule format

`schedule.json` is intentionally lean — the PWA reads it as-is, no
preprocessing.

```jsonc
{
  "exported_at":      "2026-05-07T11:00:00",
  "exported_through": "2026-05-21",
  "window_days":      14,
  "blocks_by_date": {
    "2026-05-07": [
      {
        "name":          "Mastery Block",
        "start":         "09:00",
        "duration":      90,
        "status":        "planned",
        "color":         "#3a4050",
        "objective":     "60 min Becoming Engine + 30 min salsa cognitive prep",
        "buffer_before": 0,
        "buffer_after":  15
      }
    ]
  },
  "architecture": {
    "daily":  [ /* template slots that fire every day */ ],
    "by_dow": {
      "Mon":  [ /* template slots specific to Monday */ ],
      "Tue":  [ ... ],
      "...":  [ ... ]
    }
  }
}
```

The PWA picks `blocks_by_date[date]` for explicit days; falls back to
`architecture.daily + architecture.by_dow[dow]` for any day not in the
window.

## Update the app shell

If you change `index.html`, `style.css`, `app.js`, or any of the
icons/manifest, bump `CACHE_VERSION` in `service-worker.js` (e.g.
`be-mobile-v1` → `be-mobile-v2`) before committing. Old caches get
cleaned up on the next service-worker activate, so installed PWAs
pick up the new shell on their next launch.
