# UI Guidance

Read this when changing the Next.js dashboard, components, or JSON API routes.

## Architecture

Price Getter uses Next.js 16 App Router with React 19 Server and Client Components, styled with vanilla CSS variables and responsive layouts.

## File Map

- **Layout & Shell**:
  - Global layout & font definitions: `src/app/layout.tsx`, `src/app/globals.css`
  - App Shell: `src/components/layout/AppShell.tsx` (Single-column layout with top navbar)
  - Horizontal Top Navbar: `src/components/layout/WorkspaceHeader.tsx` (Compact, responsive navigation bar)
  - User Menu: `src/components/layout/UserMenu.tsx`
  - Status Strip: `src/components/layout/StatusStrip.tsx`
  - Dashboard Context: `src/context/DashboardContext.tsx`
- **Pages & Views**:
  - Products (Default Home): `src/app/products/page.tsx` & `src/app/admin/products/page.tsx` (`/` & `/admin` redirect here) -> `src/components/views/ProductsView.tsx`
  - Product Details: `src/app/products/[key]/page.tsx` & `src/app/admin/products/[key]/page.tsx` -> `src/components/views/ProductDetailView.tsx` (includes full history snapshots)
  - Runs & Errors: `src/app/runs/page.tsx` & `src/app/admin/runs/page.tsx` -> `src/components/views/RunsView.tsx`
  - Sources (Admin only): `src/app/sources/page.tsx` & `src/app/admin/sources/page.tsx` -> `src/components/views/SourcesView.tsx`
  - Users (Admin only): `src/app/admin/users/page.tsx` -> `src/components/views/UsersView.tsx`
  - Login: `src/app/login/page.tsx`
- **Authentication & RBAC**:
  - Route guard: `src/middleware.ts`
  - JWT token creation and verification: `src/lib/jwt.ts`
  - Password hashing and user DB management: `src/lib/auth.ts`
  - Roles:
    - `admin`: Full access to overview, prices, history, runs, products, sources, users, and trigger price runs (`/admin/run-now`).
    - `viewer`: Read-only access to overview, prices, history, runs, products, sources, and documentation. Cannot modify data or trigger runs.
- **API Endpoints**:
  - `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`
  - `/api/latest`, `/api/products`, `/api/sources`, `/api/history`, `/api/runs`, `/api/errors`, `/api/health`
  - `/admin/run-now`, `/admin/config/products/*`, `/api/admin/sources/*`, `/api/admin/users/*`
- **Serializers**:
  - `src/lib/serializers.ts` (`serializePrice`, `serializeError`, `serializeRun`, `productsPayload`, `sourcesPayload`)
