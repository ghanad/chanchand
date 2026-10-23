# UI Guidance

Read this when changing the dashboard or its JSON API.

## File Map

- App Router entrypoint: `src/app/page.tsx` (protected dashboard overview) and `src/app/admin/page.tsx` (admin overview)
- Authentication & Login: `src/app/login/page.tsx`, `src/middleware.ts`, `src/lib/auth.ts`, `src/lib/jwt.ts`
- User Management (Admin only): `src/app/admin/users/page.tsx`, `src/components/views/UsersView.tsx`, `src/app/api/admin/users/*`
- Global styles & fonts: `src/app/globals.css`
- API Route handlers: `src/app/api/...` and `src/app/admin/...`
- Authentication Policy: **All pages and data endpoints require authentication.** Only `/login`, `/api/auth/login`, and `/api/health` are unauthenticated.
- Role-based Access Control (RBAC):
  - `admin`: Full access to overview, prices, history, runs, products configuration, manual price collection (`/admin/run-now`), and user management (`/admin/users`).
  - `viewer`: Read-only access to overview, prices, history, and runs. Cannot modify configuration or trigger runs.
- `/admin/run-now` starts collection in a background task and returns immediately with `status: "running"`; repeated calls while a run is active return the active `run_id` instead of starting a second run.
- Serializers: `src/lib/serializers.ts` (`serializePrice`, `serializeError`, `serializeRun`, `productsPayload`, `sourcesPayload`)
- History price rows include `price_toman`, `price_usd`, and `usd_rate_toman`; `price_usd` is calculated from the configured `usd` product history.
