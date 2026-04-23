# Frontend CLAUDE.md

Next.js 16 docs site + merchant dashboard. Auth via WorkOS AuthKit.

## Commands

```bash
pnpm install            # Install dependencies
pnpm dev                # Dev server (port 3000)
pnpm build              # Production build (standalone output)
pnpm lint               # ESLint
pnpm format             # Prettier
```

## Architecture

- `(portal)/` — authenticated routes, wrapped by `withAuth({ ensureSignedIn: true })` and `OrganizationProvider`
- `(marketing)/` — public pages (docs, blog, landing)
- `api/backend/` — proxy routes that forward to the Go backend via `proxyToBackend()` in `lib/api-proxy.ts`
- `accept-invitation/` — public invitation acceptance page (no auth, token-based)

## Conventions

- Backend returns camelCase JSON (`isPersonal`, `isAdmin`). Frontend interfaces must match.
- `OrganizationContext` provides org selection across the dashboard. Pages that fetch org-scoped data should use `selectedOrgId` and include an `AbortController` for race condition safety on org switch.
- `useSearchParams()` must be wrapped in a `<Suspense>` boundary (Next.js 16 requirement for static generation).
- Output mode is `standalone` — production runs via `node .next/standalone/server.js`.
- Proxy routes and paginated list patterns: see root CLAUDE.md § Next.js App Conventions.

## Security

See root CLAUDE.md § Security.
