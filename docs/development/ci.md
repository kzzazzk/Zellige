# Continuous integration

## Repository scope

The `CI pilot` workflow validates this application's web frontend, backend and
packaging. The public website has its own repository and CI in
[zellige-oss/landing](https://github.com/zellige-oss/landing).

Pushes to `minimal-mvp-chat-web` run pilot CI and can call its reusable
deployment workflow from the validated commit. `[skip pilot deploy]` disables
that publication. The approved SHA must still be the source branch head.
PRs targeting any branch, pushes to `main`, and manual dispatches also run CI.
Other feature pushes do not automatically deploy.

## Bootstrap while main has no MVP

Keep the workflow alongside the MVP on its feature branch and introduce both
through a PR to `main`. Local checks can run before opening that PR. Do not
publish the deployment workflows alone against the initial `main`, which does
not contain their application files. Manual workflow dispatch becomes available
once the workflow exists on the default branch.

SonarQube is temporarily disabled in the pilot workflow. Its existing project
configuration is retained for later reactivation, but no Sonar credentials or
quality gate are required for CI or deployment.

## Checks

- **Web lint, types, tests and build** installs from `web/package-lock.json`
  with `npm ci`, then checks ESLint, TypeScript, Vitest, and the Vite build.
- **Build** checks the dependency lock, builds the Python source distribution
  and wheel, verifies both can create a database from their packaged migrations,
  and builds the Docker image. Python distributions are retained for seven days
  as workflow artifacts.
- **Tests** runs the API suite with line and branch coverage, then retains
  `coverage.xml` for seven days.

Web, Build, and Tests run in parallel in CI pilot. Dependencies are resolved
from `web/package-lock.json` and `uv.lock`; third-party actions use pinned
commit hashes. Validation has read-only repository permissions. Concurrency
cancellation is disabled so newer pushes do not interrupt an active run.
Distribution and Python coverage artifacts are retained for seven days.

## Future SonarQube setup (inactive)

Use the free OSS plan for this public, Apache-2.0-licensed project. It includes
public-project branch and PR analysis. Confirm the selected plan during
onboarding; no paid subscription is needed for this setup. See the
[official plan documentation](https://docs.sonarsource.com/sonarqube-cloud/administering-sonarcloud/managing-subscription/subscription-plans).

1. Sign in to [SonarQube Cloud](https://sonarcloud.io/) with GitHub, grant its
   GitHub integration access to `kzzazzk/Zellige`, and import that repository
   as a public project. Select the free OSS plan.
2. Set its main branch to `main`. Select CI-based analysis with GitHub Actions.
   Disable automatic analysis under the project's **Administration > Analysis
   Method** if it is enabled: it conflicts with scanner-based analysis and
   cannot import our coverage report.
3. In GitHub **Settings > Secrets and variables > Actions**, configure:

   | Name | Kind | Value |
   | --- | --- | --- |
   | `SONAR_TOKEN` | Secret | Analysis token issued by SonarQube Cloud |
   | `SONAR_PROJECT_KEY` | Variable | Project key shown by SonarQube Cloud |
   | `SONAR_ORGANIZATION` | Variable | Organization key shown by SonarQube Cloud |
   | `SONAR_HOST_URL` | Optional variable | Defaults to `https://sonarcloud.io` |

   Copy the exact keys from Sonar's onboarding screen; they are not necessarily
   the same as the GitHub repository and account names. Tokens belong in GitHub
   secrets, never in this repository or chat.
4. Run an initial analysis of `main` after the workflow is merged, so PR analysis
   has a baseline. Re-run the first PR's checks if it lacks that baseline.
5. Keep the default Sonar way quality gate initially, and inspect its results.
   Coverage is measured by Coverage.py and imported by Sonar; the scanner does
   not execute the tests.

The integration cannot pass until the project, keys, and token exist. Merely
adding these files does not create a Sonar project or activate GitHub rules.

## Protect main

After the workflow is published and its checks have appeared, configure an
active GitHub branch ruleset for `main` with:

- Pull requests required. Require one approval when another reviewer is available;
  a solo maintainer must not be blocked by an approval they cannot provide.
- Require **Pilot CI required**, which evaluates Web, Build and Tests and fails
  when any validation fails, is cancelled or skipped. Remove the former
  **Marketing CI required** requirement if configured; that check now belongs
  to the website repository.
- Dismiss outdated approvals, require resolved review conversations, and require
  the branch to be up to date before merging.
- Block force pushes and branch deletion, with no routine bypass actors.
- Squash merging for short-lived feature branches.

These settings are applied in GitHub, not enforced by this document. No Sonar
status should be required while its integration is disabled.

## External contributions

Pilot CI runs without repository secrets, including on fork PRs.
Deployment credentials are used only by the separate CD workflows after a
successful push to this repository's main branch.

## Local equivalents

```sh
uv sync --locked --dev
uv run --locked coverage run -m unittest discover -s tests -v
uv run --locked coverage xml
uv run --locked coverage report
uv build --no-sources
docker build --tag zellige:ci .
cd web
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Generated coverage files, distributions, and scanner working files are ignored
by Git.

## Delivery

The private pilot has its own [deployment workflow](../deployment/pilot-cd.md).
It uses the exact validated commit and compares it with the last READY
production deployment. Changes to `web/`, `zellige/`, `migrations/`, `schemas/`,
`app.py`, Python dependencies or pilot deployment scripts trigger publication.
Docs-only and test-only changes do not publish after CI passes. An unknown
baseline triggers a conservative rebuild. Deleted and renamed files count.

Website publication is managed exclusively by `zellige-oss/landing`.
