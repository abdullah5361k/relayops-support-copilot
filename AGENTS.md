# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Preserve the zero-cost rule: no paid API, billing requirement, secret, cloud resource, or mandatory external account. See `README.md` for scope and setup.
- Use only original RelayOps branding and deterministic synthetic data; never imply unbuilt AI, auth, deployment, or customer outcomes exist.
- Derive tenant context server-side. Every private data model and query must be organization-scoped; keep isolation tests beside API changes.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before review. Prisma workflow is documented in `README.md`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
