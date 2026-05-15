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

You need **two** pieces: the API server and the static frontend.

### 1. Deploy the API

Run `server/` on any Node host (Render, Railway, Fly.io, VPS, etc.).

**Start command:**

```bash
npm run start:server
```

**Required environment variables:**

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `JWT_SECRET`
- `PORT` (often set by the platform, e.g. `10000`)

The API runs `initDb()` on startup (schema migrations).

### 2. Deploy the frontend

Build with your public API URL:

```bash
VITE_API_URL=https://your-api.example.com npm run build
```

Serve the `dist/` folder (Netlify, Vercel, Render static site, S3, etc.).

CORS is enabled on the API for browser requests. For production, consider restricting origins in `server/app.ts`.

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
