# Karaoke Companion

Personal karaoke repertoire manager: song lookup (iTunes, KaraFun, lyrics), performances, tags, venues, and stats. React PWA with an Express API backed by [Turso](https://turso.tech/).

## Architecture

```
Browser (Vite)  →  Express API (:3001)  →  Turso (libSQL)
```

- **Frontend:** React 19, MUI 9, Vite 8 — `src/`
- **API:** Express, JWT auth, SQL guard — `server/`
- **Database:** Turso credentials live **only** on the server

## Prerequisites

- Node.js 22+
- A Turso database ([Turso CLI](https://docs.turso.tech/cli) or dashboard)

## Local development

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy the example file and fill in real values:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `TURSO_DATABASE_URL` | Yes | Turso libSQL URL (`libsql://...`) |
| `TURSO_AUTH_TOKEN` | Yes | Turso auth token (server only) |
| `JWT_SECRET` | Yes | Long random string for session tokens |
| `PORT` | No | API port (default `3001`) |
| `VITE_API_URL` | No | Leave **empty** locally — Vite proxies `/api` to the API |
| `VITE_API_PROXY_TARGET` | No | Proxy target if not `http://localhost:3001` |

**Never commit `.env` or put Turso tokens in `VITE_*` variables.**

### 3. Start dev servers

```bash
npm run dev
```

This runs **Vite** (http://localhost:5173) and the **API** (http://localhost:3001) together.

- App: http://localhost:5173/
- API health: http://localhost:3001/api/health
- API root: http://localhost:3001/ (JSON index of routes)

### Other scripts

| Command | Purpose |
|---------|---------|
| `npm run dev:web` | Vite only |
| `npm run dev:server` | API only (with hot reload) |
| `npm run build` | Production web build → `dist/` |
| `npm run start:server` | API only (production) |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (mocked DB, no Turso) |
| `npm run test:integration` | Live Turso tests (needs `.env`) |
| `npm run preview` | Preview production build |

## Testing

### Unit tests (CI on every PR)

```bash
npm test
```

Covers SQL guard, auth helpers, API routes (mocked DB), and row normalization.

### Integration tests (optional, live Turso)

```bash
npm run test:integration
```

Requires valid `TURSO_*` and `JWT_SECRET` in `.env`. Creates temporary users and cleans up after each run.

**GitHub Actions:** workflow `Integration Tests (Turso)` runs on push to `dev` and manual dispatch. Add these repository secrets:

| Secret | Purpose |
|--------|---------|
| `TURSO_DATABASE_URL` | Turso URL |
| `TURSO_AUTH_TOKEN` | Turso token |
| `JWT_SECRET` | Must match a strong production-style secret |

If secrets are missing in CI, integration tests skip automatically.

## Deployment

### Render (recommended — one URL for app + API)

The live site must be a **Web Service**, not a **Static Site**. A static deploy only serves `dist/` files; `/api/*` returns 404 and the app shows “API server unavailable”.

1. Use the repo’s [`render.yaml`](render.yaml) or create a **Web Service** from GitHub (`dev` branch).
2. **Build command:** `npm install && npm run build`
3. **Start command:** `npm start` (runs the API and serves `dist/` when `NODE_ENV=production`)
4. **Environment variables** (required):

   | Variable | Description |
   |----------|-------------|
   | `TURSO_DATABASE_URL` | Turso libSQL URL |
   | `TURSO_AUTH_TOKEN` | Turso token |
   | `JWT_SECRET` | Session signing secret |
   | `NODE_ENV` | `production` (set in `render.yaml`) |

5. Leave **`VITE_API_URL` empty** — the browser calls `/api` on the same host.
6. After deploy, open `https://your-service.onrender.com/api/health` — expect `{"ok":true,"turso":true}`.

If you already have a Static Site named `karaoke-companion`, delete it or switch to a Web Service with the settings above (same custom domain can be reattached).

### Split deploy (API + static frontend on different hosts)

**API** — any Node host:

```bash
npm run start:server
```

Env: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `JWT_SECRET`, `PORT`.

**Frontend** — build with the public API URL:

```bash
VITE_API_URL=https://your-api.example.com npm run build
```

Serve `dist/` (Netlify, Vercel, Render static site, etc.). CORS is enabled on the API; consider restricting origins in `server/app.ts` for production.

### 3. Android APK (optional)

CI builds a debug APK on push to `dev` (`.github/workflows/android-build.yml`).

Set GitHub secret `VITE_API_URL` to your deployed API before building.

Locally:

```bash
VITE_API_URL=https://your-api.example.com npm run build
npx cap sync android
```

## GitHub Actions summary

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | PR / push `main`, `dev` | Lint, unit tests, web build |
| `integration.yml` | push `dev`, manual | Turso integration tests (needs secrets) |
| `android-build.yml` | push `dev`, manual | Debug APK |
| `update-catalog.yml` | nightly, manual | KaraFun catalog sync |

## Security notes

- Passwords are hashed with bcrypt; sessions use JWT.
- Turso credentials are **not** shipped to the browser.
- `/api/execute` is authenticated but still accepts SQL from logged-in users — treat as a known limitation for untrusted multi-tenant use.
- Rotate `TURSO_AUTH_TOKEN` and `JWT_SECRET` if they were ever committed to git.

## License

Private project — see repository owner.
