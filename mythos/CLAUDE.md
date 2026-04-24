@AGENTS.md

## Conventions

- Every backend call from mythos is an admin operation. `mythos/lib/api-proxy.ts` `proxyToBackend` enforces this at the proxy layer via `verifyAdmin()` in addition to the layout-level gate and backend's `RequireAdmin` middleware. If you add a non-admin route in the future, create a separate proxy helper — don't weaken the existing one.
- Proxy routes and paginated list patterns: see root CLAUDE.md § Next.js App Conventions.
