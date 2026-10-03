# Continuous integration

## Branch delivery (2026-10-03)

Pushes to `minimal-mvp-chat-web` run both CI workflows. Each successful required
check calls its own reusable deployment workflow from that same commit. This
explicitly publishes the branch to the existing landing production and private
pilot environments without merging into `main`. The deployment checks that the
approved SHA is still the head of the source branch. Other feature branches and
PRs cannot publish. The existing `main` workflow-run path remains available.
CI cancellation is disabled so a newer push cannot interrupt publication.
This branch delivery supersedes the main-only activation instructions below.


Work enters `main` through short-lived branches and pull requests. The GitHub
Actions workflows `CI pilot` (`.github/workflows/ci.yml`) and `CI marketing`
(`.github/workflows/ci-marketing.yml`) run independently on PRs targeting `main`,
pushes to `main`, and manual dispatches. There is no `develop` branch.
Feature branches can use any name (`codex/…`, `feature/…`, or the existing MVP
branch); the PR target determines whether CI runs. Updating an open PR reruns
validation. Feature pushes without a PR do not start duplicate CI runs.

## Bootstrap while main has no MVP

Keep the workflow alongside the MVP on its feature branch and introduce both
through a PR to `main`. Local checks can run before opening that PR. Do not
publish the deployment workflows alone against the initial `main`, which does
not contain their application files. Manual workflow dispatch becomes available
once the workflow exists on the default branch.

SonarQube is temporarily disabled in both workflows. Its existing project
configuration is retained for later reactivation, but no Sonar credentials or
quality gate are required for CI or deployment.

## Checks

- **Web lint, types, tests and build** installs from `web/package-lock.json`
  with `npm ci`, then checks ESLint, TypeScript, Vitest, and the Vite build.
- **Landing lint, types, build and checks** installs from
  `marketing/package-lock.json`, builds the public landing, checks its output,
  and verifies the packaged artifact.
- **Build** checks the dependency lock, builds the Python source distribution
  and wheel, verifies both can create a database from their packaged migrations,
  and builds the Docker image. Python distributions are retained for seven days
  as workflow artifacts.
- **Tests** runs the API suite with line and branch coverage, then retains
  `coverage.xml` for seven days.

Landing runs in CI marketing. Web, Build, and Tests run in parallel in CI pilot.
There is no SonarQube job in either workflow. Dependencies are resolved from
the two npm lockfiles and `uv.lock`, and third-party actions are pinned to
verified commit hashes. Each CI workflow grants only read access to repository
contents; it does not publish packages.
Newer runs cancel in-progress validation for the same branch or PR within that
application only; the workflows have separate concurrency groups.
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
- Independent status checks: **Pilot CI required** evaluates Web, Build, and Tests;
  **Marketing CI required** evaluates Landing. Each fails if its
  own validations fail, are cancelled, or are skipped. There is no global gate.
  Requiring both in branch protection would block PR merging when either fails;
  this is a separate policy decision, not a dependency between deployments.
- Dismiss outdated approvals, require resolved review conversations, and require
  the branch to be up to date before merging.
- Block force pushes and branch deletion, with no routine bypass actors.
- Squash merging for short-lived feature branches.

These settings are applied in GitHub, not enforced by this document. No Sonar
status should be required while its integration is disabled.

## External contributions

Both CI workflows run without repository secrets, including on fork PRs.
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

The separate `Deploy marketing to Vercel` workflow builds and publishes the
public landing from `main`. Automatic publication waits for a successful
`CI marketing` push run on `main` and
uses that exact commit; a newer main commit supersedes the release. Manual
publication is an explicit operator action, not a feature-branch CI side effect. See [landing deployment setup and
operations](../deployment/vercel.md). The private pilot has a separate CD triggered only by successful `CI pilot` push runs
on `main`; it reuses the external gateway and selects the exact approved SHA. They do not merge branches or publish the landing. Nightly publication,
registry publishing, and version-tag releases remain disabled.


## Automatic deployment selection

Landing CD listens only for CI marketing; pilot CD listens only for CI pilot.
Both accept only successful runs caused by a push to main from this repository.
A failed marketing CI or CD does not block pilot publication, and a failed pilot
CI or CD does not block landing publication. PR CI and manual CI do not deploy
the pilot. There is no develop branch or feature-branch publication.

Each CD compares the approved commit with its own last READY production
version's source metadata. This includes changes left pending by a failed CI,
failed deployment, or superseded release. It is not just the last commit's diff.
Deleted and renamed files count. If the baseline is unknown, rebuild once.

| Changed files | Deployment |
| --- | --- |
| `marketing/**`, landing packaging/configuration or landing workflow | Landing |
| `web/**`, `zellige/**`, `migrations/**`, `schemas/**`, `app.py`, Python dependencies or pilot CD | Private pilot |
| Both groups, or the shared deployment selection helper | Both |
| Only docs or tests | Neither, after CI passes |

Both CI workflows validate every PR and push to main, without workflow-level
path filters. Each has its own required-status job. Deployment selection then
limits publication to applications with pending changes. The deployment workflows may appear as successful runs with publishing
steps skipped when their application has no pending changes. Explicit manual
landing deployment remains available and bypasses only the change filter.

See [private pilot CD](../deployment/pilot-cd.md) for its configuration.
