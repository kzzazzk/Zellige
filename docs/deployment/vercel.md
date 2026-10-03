# Public landing on Vercel

## Current manual release (2026-10-02)

The ivory-background landing with the ceramic PNG is now `READY` in production
at <https://zellige.dev>. The eleven allowlisted public files were verified
byte-for-byte against the local artifact after deployment. HTTPS returns 200
with the expected CSP, frame denial, `nosniff` and referrer policy. The pilot
screenshot, mascot and `/v1/conversations` still return 404.

This was an explicitly requested manual deployment through the authenticated
Vercel connector, using an equivalent version-2 routing configuration. The
local artifact and future CD still use version 3. Only changed public files
were uploaded; unchanged files were reused by their verified content hashes.
No Git commit/push, DNS changes, pilot changes or CI/CD activation were made.
The new deployment reached READY in approximately two seconds of build time.
Its post-deploy error/fatal log query returned no entries; no drains are
configured, and this is not evidence of continuous monitoring.

## Migration status (2026-10-02)

The initial manual production deployment is `READY` on the public domain.
Account identifiers and internal deployment URLs are intentionally omitted
from this repository; inspect them in the provider dashboard when needed.
That initial deployment contained the nine allowlisted public files from the
worktree at that time and an equivalent v2 `vercel.json` routing configuration, uploaded
through the Vercel MCP. Future CD runs use the v3 prebuilt artifact below.

Public HTTPS at <https://zellige.dev> returns 200 with a valid certificate and
the expected security headers; HTTP redirects to HTTPS. All nine public files
match the packaged bytes. The pilot screenshot, mascot and `/v1/conversations`
return 404. The remote `/.env` probe was blocked by the credential-safety review;
no remote 404 claim is made for it. Packaging tests confirm its exclusion.
Desktop (1440px) and mobile (390px) browser checks found no broken images,
unloaded fonts, horizontal overflow or reported page errors. Keyboard expansion
of the second disclosure passed. Build logs contain no build failures. No log
drains or continuous monitoring have been configured.

`zellige.dev` is assigned to the Vercel project. Its Cloudflare zone uses the
exact apex CNAME target provided by the project's domain settings, with the
proxy disabled (DNS only). Retrieve that installation-specific target from
the dashboard rather than copying one from source control.

Cloudflare supports this apex CNAME through flattening. No existing DNS records
were replaced. Keep Cloudflare as DNS provider; no nameserver migration is needed.

Only the local marketing application container was removed after
public-domain checks succeeded. The pilot, its data, both existing VPN connectors
and the shared reverse proxy were preserved. The pilot's start time did not
change and its private HTTPS health check remains 200. A collaborator's device was
not used for this check; no access policies were changed.

The local marketing service is now opt-in (`local-marketing` Compose profile),
so ordinary stack startup does not recreate it. The former lab landing URL is
retired, not redirected. To restore the local fallback without touching the pilot:

```sh
docker compose -f compose.lab.yaml up -d --build --no-deps marketing
```

The CD is developed on `minimal-mvp-chat-web`; publishing it on that branch does
not deploy production. Activation requires the landing and workflow on `main`,
the Actions secrets below, and a successful first GitHub run. On 2026-10-02,
the repository owner confirmed adding `VERCEL_TOKEN` in GitHub; its presence and
permissions have not been independently verified by a deployment run.

## Automatic deployment

The `Deploy marketing to Vercel` workflow publishes the static landing on every
push to `main`, with no path filter. Manual dispatch runs only when `main` is
selected. It runs independently of the repository's CI workflow.

Production deployments share the `marketing-production` concurrency group and
queue without canceling a running deployment. GitHub allows up to 100 pending
runs with `queue: max`; queue order follows when runs start waiting, not strictly
commit order. Each serialized run checks out the current tip of `main` when it
starts, including manual dispatches and re-runs. It does not republish the older
commit that originally triggered a delayed or repeated run. A push that arrives
after checkout queues another run to publish the newer state.

## Vercel and GitHub configuration

Use a dedicated Vercel project with framework preset `Other`.
This workflow supplies prebuilt static output; it does not run a remote
build or deploy the repository root. Keep Vercel's automatic Git deployments
disconnected from this project to avoid a second deployment path.

Keep installation-specific values outside the repository. Configure the two
identifiers as GitHub Actions variables and the token as a secret, either at
repository level or in the `marketing-production` environment. Variables are
not masked in Actions logs, so do not print their values in workflow steps.

| Setting | Type | Value |
| --- | --- | --- |
| `VERCEL_ORG_ID` | Variable | Team ID from the Vercel dashboard |
| `VERCEL_PROJECT_ID` | Variable | Project ID from the Vercel dashboard |
| `VERCEL_TOKEN` | Secret | Vercel deployment token authorized for that team |

The workflow reads the token only during deployment, passes it through the
environment, and never writes it into the artifact. A missing setting fails the
deployment with the setting name, without printing values. No credentials or
GitHub settings are created by the files in this change.

For another installation, configure its identifiers in GitHub Actions settings,
attach the domain to its Vercel project and configure
the exact DNS record Vercel returns in Cloudflare. Domain verification and HTTPS must succeed
before declaring the domain live. The workflow deploys to the project's assigned
production domains; it does not modify DNS or attach domains.

## Artifact and local verification

The landing is a Vite + React + Tailwind/shadcn app in `marketing/`. Its build
prerenders the page to static HTML (content, anchors and disclosures work without
JavaScript) and hydrates it on the client. The workflow builds it, checks the
prerendered page, then packages `marketing/dist/` unchanged.

From the repository root, using Node.js 24:

```sh
(cd marketing && npm ci && npm run build)
node --test tests/marketing.test.mjs tests/marketing-build.test.mjs
node deploy/build-marketing.mjs
```

The output is `.output/marketing/.vercel/output/`, using Vercel Build Output API
version 3. Its `static/` directory is exactly `marketing/dist/`: `index.html`,
hashed `assets/` (script, stylesheet, images, wordmark) and `fonts/` with their
licenses. Packaging refuses symlinks, unexpected file types (including source
maps), inline `data:` URIs or inline scripts that the CSP would block, and any
reference to the pilot, its API or the development domain.

The builder copies these files unchanged and copies
`deploy/vercel-marketing.json` to `.vercel/output/config.json`. That configuration
applies the same CSP, `nosniff`, frame denial, and referrer policy as
`deploy/marketing.Caddyfile`. There is no catch-all page fallback: unknown paths
remain 404s. The pilot screenshot, mascot, application, backend, databases,
documentation, and secrets are excluded by the explicit file allowlist.

Rebuilding replaces only `.output/marketing/.vercel/output`, clearing stale
generated files while preserving siblings and project metadata. All source files
must exist before replacement starts. Symlinked inputs and output ancestors are
rejected. Do not store manual files in the generated output directory.

The deployment command runs from `.output/marketing` with the three settings
already available in its environment:

```sh
npm exec --yes --package=vercel@62.2.0 -- vercel deploy --prebuilt --prod --yes
```

The CLI version is pinned, runs without a global installation, and waits for
deployment completion. The workflow captures CLI output in a temporary runner
file, deletes it on exit, and reports only success or failure. It does not
publish raw logs or deployment URLs as Actions artifacts or step output.
For failures, inspect the private provider dashboard and Actions settings.
This avoids publishing deployment metadata, not discovery of the hosting
provider through the public site's DNS or HTTP behavior. No
`vercel pull` is needed because the static package has no build-time environment
variables; the project and team IDs select the existing project directly.

After the first deployment, verify `/` and its fonts, CSS, mosaic and emblem on
`https://zellige.dev`, inspect the response security headers, and check that
`/images/pilot-preview.png`, `/brand/zellige-companion-hello.png`, `/.env`, and
`/v1/conversations` return 404. The first actual GitHub run is required to verify
the configured credentials and end-to-end publication.

## References

- [Vercel Build Output API configuration](https://vercel.com/docs/build-output-api/configuration)
- [Vercel prebuilt deployments](https://vercel.com/docs/cli/deploy#prebuilt)
- [Vercel CLI project and token environment variables](https://vercel.com/docs/cli/global-options)
- [GitHub concurrency queue behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency)
- [GitHub variables are not masked in logs](https://docs.github.com/en/actions/concepts/workflows-and-actions/variables)
