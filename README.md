# VITS — Integrated Library Tools & Scheduling System

Offline-first Android mobile app (Students & Officers-in-Charge) and online-only Admin web portal built in one Ionic + Angular + NestJS `pnpm` monorepo.

## Quick Start

> **Corepack / pnpm:** If `pnpm` is not globally shimmed on your `PATH`, prefix commands with `corepack` (e.g. `corepack pnpm install`).

```bash
pnpm install
pnpm dev:mobile        # Runs mobile app at http://localhost:4200 (or `ionic serve` at :8100)
pnpm test              # Runs Vitest unit tests
pnpm lint              # Runs ESLint + design-token SCSS check
pnpm typecheck         # Runs strict TypeScript typecheck
pnpm build:mobile && pnpm cap:sync
```

## Licensed Fonts Notice

VITS uses **Knockout Welterweight** (headings) and **Marjari** (body). Because these are licensed fonts, font binaries are excluded from Git via `.gitignore`.

Place the `.woff2` files in `libs/shared-ui/assets/fonts/`:
- `libs/shared-ui/assets/fonts/Knockout-Welterweight.woff2`
- `libs/shared-ui/assets/fonts/Marjari-Regular.woff2`
- `libs/shared-ui/assets/fonts/Marjari-Bold.woff2`

Until supplied, `@font-face` rules in `libs/shared-ui/styles/_fonts.scss` fall back to `system-ui, -apple-system, sans-serif`.
