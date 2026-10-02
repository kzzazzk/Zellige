# Frontend deployment

Vercel hosts the static frontend through its native GitHub integration.
Cloudflare remains registrar/DNS only for `zellige.dev`.

## Manual setup

1. Import `kzzazzk/Zellige` through Vercel for GitHub.
2. Set **Root Directory** to `web`, **Framework** to `Vite`,
   **Production Branch** to `main`, **Build Command** to `npm run build`,
   and **Output Directory** to `dist`.
3. Configure Vercel **Deployment Checks** to require these exact GitHub check
   names:
   - `Web lint, types, tests and build`
   - `Build`
   - `Tests`
   - `SonarQube`
4. Add `zellige.dev` in Vercel. Zaka manually applies the DNS records requested
   by Vercel in Cloudflare.

Previews are automatic for non-production branches and PRs. Production
builds for `main` may run while checks are pending, but `zellige.dev` must not
be assigned/promoted until all required Deployment Checks pass. Verify this
promotion gate during onboarding before directing production traffic.

No custom deployment workflow, Vercel CLI, or Vercel CI credentials are needed.
There are no Cloudflare CI secrets. No `repository_dispatch`/status action is
needed because this integration does not use `repository_dispatch`.

## Scope and rollback

This is a static frontend only. `/health` and `/v1` do not work in hosted
production until backend hosting is added; the Vite proxy is local-only.
Do not enter real API tokens in the hosted console. No serverless functions,
API rewrites, or backend deployment are configured.

Prefer rollback through a reviewed revert PR so Git remains the source of
truth. Vercel rollback/promote is an operational fallback; afterward reconcile
the source through Git, keeping the required production checks in place.
