# Private pilot CD

`Deploy private pilot` runs after **CI pilot succeeds for a push to main**. It does not
run for PR validation, feature branches or manual CI. The landing has its own CD.
Both workflows must first reach the default branch through the MVP PR.

The product remains React/shadcn/Tailwind plus Python and SQLite. Google login
belongs exclusively to the separately deployed `zellige-demo` gateway. Its
source and secrets are not imported into the product or this workflow.

The CD reuses a known READY gateway deployment as its template, updates the
Vercel production variable `DEV_SOURCE_SHA` to the exact approved main commit,
and redeploys that template. It never checks out or publishes gateway auth code
from this repository. It waits for Vercel READY; actual Google login and Sandbox
startup require separate initial end-to-end verification. All template releases
must remain compatible with `DEV_SOURCE_SHA` and must retain their deployment in
Vercel. Update the template variable when the external gateway is revised.

## GitHub environment: pilot-development

| Setting | Type | Purpose |
| --- | --- | --- |
| `VERCEL_ORG_ID` | Variable | Existing Vercel team |
| `VERCEL_PILOT_PROJECT_ID` | Variable | Separate zellige-demo project, never the landing |
| `VERCEL_PILOT_GATEWAY_DEPLOYMENT_ID` | Variable | READY external gateway deployment to reuse |
| `VERCEL_TOKEN` | Secret | Deployment access |

Google configuration stays exclusively in the demo project's Vercel environment:
`AUTH_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, and
`DEV_ALLOWED_EMAILS`. The CD checks that these are configured without decrypting
them. It does not create OAuth credentials or weaken deployment protection.

Do not enable automatic Git deployments for the gateway: this CD must be its
sole source of product-version updates. Keep deployment IDs and team/project IDs
in configuration, not source. No SQLite data or demo passwords are copied locally.

## Release safeguards

- CI pilot must pass for a push to this repository's main branch.
- Each release is serialized and rechecks that its source SHA is still main.
- The target must be zellige-demo and the template must belong to that project.
- Publication is skipped if no pilot files changed since its last labelled release.
- API failures and failed Vercel builds fail the CD; API payloads are not logged.

The workflow and settings are prepared locally, not yet active on GitHub. Main
still needs the MVP PR, the environment settings above, and Google configuration.
