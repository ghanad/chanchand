# UI Notes

Read this when changing the local dashboard or its JSON API.

## Backend

- FastAPI app factory: `src/price_getter/ui.py:create_app`
- API endpoints: `/api/latest`, `/api/products`, `/api/history`, `/api/runs`, `/api/errors`, `/run-now`, `/config/products...`
- Payload helpers: `_products_payload`, `_sources_payload`
- Serializers: `_serialize_price`, `_serialize_error`, `_serialize_run`
- UI tests: `tests/test_ui.py`

Use `rg` for the endpoint or helper name before reading the whole file.

## Frontend

- React app: `frontend/src/main.tsx`
- Styles: `frontend/src/styles.css`
- Vite config: `frontend/vite.config.ts`
- Built assets: `src/price_getter/ui_dist/`

Use `rg` for state names, labels, endpoint paths, and CSS selectors before opening large sections.

## Build And Verify

```bash
cd frontend && npm run build
.venv/bin/pytest tests/test_ui.py
```

Rebuild frontend assets only when the shipped dashboard needs to change.
