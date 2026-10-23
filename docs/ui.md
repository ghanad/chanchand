# Local UI Guidance

Read this when changing the local dashboard or its JSON API.

## File Map

- App Router entrypoint: `src/app/page.tsx` (public) and `src/app/admin/page.tsx` (admin)
- React Dashboard component: `src/app/Dashboard.tsx`
- Global styles & fonts: `src/app/globals.css`
- API Route handlers: `src/app/api/...` and `src/app/admin/...`
- Routes/endpoints: `/`, `/admin`, public reads under `/api/latest`, `/api/products`, `/api/history`, `/api/runs`, `/api/errors`, and admin writes under `/admin/run-now` and `/admin/config/products...`
- `/admin/run-now` starts collection in a background task and returns immediately with `status: "running"`; repeated calls while a run is active return the active `run_id` instead of starting a second run.
- Serializers: `src/lib/serializers.ts` (`serializePrice`, `serializeError`, `serializeRun`, `productsPayload`, `sourcesPayload`)
- History price rows include `price_toman`, `price_usd`, and `usd_rate_toman`; `price_usd` is calculated from the configured `usd` product history.
