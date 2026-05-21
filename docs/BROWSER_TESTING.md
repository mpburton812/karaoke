# Cross-browser testing

## Automated (Playwright)

From the repo root:

```bash
npm install
npx playwright install
npm run test:e2e
```

This runs the production build (`vite preview`) against:

| Project | Engine | Typical device |
|---------|--------|----------------|
| `chromium` | Chromium | Desktop Chrome / Edge |
| `firefox` | Gecko | Desktop Firefox |
| `webkit` | WebKit | Desktop Safari |
| `mobile-chrome` | Chromium | Android Chrome (emulated) |
| `mobile-safari` | WebKit | iOS Safari (emulated) |

Playwright does **not** ship a separate “Android Firefox” profile; test that browser manually on a device.

## Android Chrome white screen after deploy

Chrome (especially an **installed PWA**) keeps an aggressive service worker cache. Firefox on Android often behaves like a normal tab and is less sticky.

The app mitigates this by:

1. Not precaching hashed `/assets/*` bundles (network-first instead).
2. Reloading when a new service worker takes control.
3. Comparing `/build-stamp.json` to the embedded commit on boot.
4. Clearing caches via **God mode → Restart & update** (or reinstall).

If Chrome still shows a blank page after a deploy: use **Restart & update**, clear site data, or reinstall the PWA once.

## Manual checklist (real devices)

After each production deploy:

- [ ] Desktop: Chrome, Firefox, Safari — open site, log in, switch tabs
- [ ] Android: Chrome (browser + installed app if used), Firefox
- [ ] iOS: Safari (browser + Add to Home Screen if used)
