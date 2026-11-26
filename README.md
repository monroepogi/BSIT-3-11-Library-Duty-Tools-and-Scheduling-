# VITS — Integrated Library Tools & Scheduling System

Offline-first Android mobile app (Students & Officers-in-Charge) built with Ionic + Angular + Capacitor in a `pnpm` monorepo.

## Quick Start

> **Corepack / pnpm:** If `pnpm` is not globally shimmed on your `PATH`, prefix commands with `corepack` (e.g., `corepack pnpm install`).

```bash
pnpm install
pnpm dev:mobile        # Runs mobile app at http://localhost:4200 (or `ionic serve` at :8100)
pnpm test              # Runs Vitest unit tests
pnpm lint              # Runs ESLint + design-token SCSS check
pnpm typecheck         # Runs strict TypeScript typecheck
pnpm build:mobile && pnpm cap:sync
```
