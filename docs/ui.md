# UI Notes

Read this when changing the local dashboard or its JSON API.

## Backend

- FastAPI app factory: `src/price_getter/ui.py:create_app`
- Runtime env defaults: `src/price_getter/runtime.py`
- Routes/endpoints: `/`, `/admin`, public reads under `/api/latest`, `/api/products`, `/api/history`, `/api/runs`, `/api/errors`, and admin writes under `/admin/run-now` and `/admin/config/products...`
- Payload helpers: `_products_payload`, `_sources_payload`
- Serializers: `_serialize_price`, `_serialize_error`, `_serialize_run`
- History price rows include `price_toman`, `price_usd`, and `usd_rate_toman`; `price_usd` is calculated from the configured `usd` product history.
- UI tests: `tests/test_ui.py`

Use `rg` for the endpoint or helper name before reading the whole file.

## Production Access Model

- `/` serves the public read-only dashboard.
- `/admin` serves the admin dashboard. Put this path behind Nginx Basic Auth in production.
- `/api/*` exposes read-only JSON APIs publicly. Public users can view latest prices, history, products, runs, and errors.
- Mutating routes are admin-only at the reverse proxy: `/admin/run-now` and `/admin/config/products...`.
- Admin users can run collection manually and add, edit, delete, enable, or disable products.
- Authentication is handled by Nginx Basic Auth for `/admin`, `/admin/run-now`, and `/admin/config/products...`.
- The compose setup mounts `./data/.htpasswd-price-getter` into Nginx. Generate it outside the image, for example: `docker run --rm httpd:2.4-alpine htpasswd -nbB admin 'change-this-password' > data/.htpasswd-price-getter`.
- The app has no websocket endpoints; do not add websocket proxy headers unless a future route needs them.
- TLS can be added by Certbot with a `listen 443 ssl` server that keeps these same location rules, or by external TLS termination in front of this Nginx service.
- Do not add application user accounts, sessions, or cookies in this phase.
- Container-friendly startup can rely on `PRICE_GETTER_CONFIG`, `PRICE_GETTER_DB_URL`, `PRICE_GETTER_HOST`, and `PRICE_GETTER_PORT`; explicit CLI flags still override these env vars.

Minimal Nginx boundary:

```nginx
location = /admin {
    auth_basic "Price Getter Admin";
    auth_basic_user_file /etc/nginx/.htpasswd-price-getter;
    proxy_pass http://127.0.0.1:8000;
}

location ^~ /admin/ {
    auth_basic "Price Getter Admin";
    auth_basic_user_file /etc/nginx/.htpasswd-price-getter;
    proxy_pass http://127.0.0.1:8000;
}

location ^~ /api/ {
    limit_except GET HEAD {
        deny all;
    }
    proxy_pass http://127.0.0.1:8000;
}

```

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
