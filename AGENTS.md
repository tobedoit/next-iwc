# Repository Guidelines

## Project Structure & Module Organization
- `src/app` – Next.js App Router pages and layouts. API routes live under `src/app/api/<resource>/route.ts`.
- `src/app/components` – Reusable UI (e.g., `Shell.tsx`, `StatCard.tsx`).
- `src/lib` – Client utilities and integrations: `supabase/` clients, `db.ts`, and Drizzle ORM.
- `src/lib/drizzle` – `schema.ts` and generated SQL under `migrations/`.
- `public/` – Static assets. `next.config.ts`, `tsconfig.json`, and `eslint.config.mjs` configure the toolchain.

## Build, Test, and Development Commands
- `pnpm dev` – Run the dev server (Turbopack) at `http://localhost:3000`.
- `pnpm build` – Create a production build (Turbopack).
- `pnpm start` – Start the production server.
- `pnpm lint` – Run ESLint with Next/TypeScript presets.
- `pnpm db:generate` – Generate Drizzle migrations from `src/lib/drizzle/schema.ts`.
- `pnpm db:studio` – Open Drizzle Studio to inspect/apply changes.
TypeScript path alias: import from `@/*` (maps to `src/*`). Example: `import { getClient } from "@/lib/supabase/server"`.

## Coding Style & Naming Conventions
- TypeScript, strict mode enabled; 2-space indentation.
- ESLint extends `next/core-web-vitals` and `next/typescript` (see `eslint.config.mjs`). Fix lint issues before opening a PR.
- Components: PascalCase (`MyComponent.tsx`). Utilities: camelCase (`formatPhone.ts`). API routes: `route.ts` under resource folders.
- Use Tailwind CSS utilities in components; keep styles co-located (see `src/app/globals.css`).

## Testing Guidelines
- No test runner is configured yet. When adding tests, prefer colocated files: `module.test.ts`/`component.test.tsx` next to sources.
- Aim for fast unit tests (lib and API) and minimal page rendering tests (React Testing Library). Add a `test` script if you introduce a runner (Vitest/Jest).

## Commit & Pull Request Guidelines
- Follow Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `build:`. Example: `feat(leads): add conversion status column`.
- PRs must include: concise description, linked issue, screenshots for UI changes, migration notes (if `src/lib/drizzle/migrations` changed), and any new env vars.
- Keep PRs focused and small; update docs when behavior/config changes.

## Security & Configuration Tips
- Create `.env.local` with: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Never commit secrets.
- RLS is enforced; ensure queries include tenant context. Review `src/lib/drizzle/withRLS.ts` when touching DB access.
