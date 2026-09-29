# Continuous integration

Work enters `main` through short-lived branches and pull requests. The GitHub
Actions workflow in `.github/workflows/ci.yml` runs on PRs targeting `main`,
pushes to `main`, and manual dispatches.

## Checks

- **Build** checks the dependency lock, builds the Python source distribution
  and wheel, verifies both can create a database from their packaged migrations,
  and builds the Docker image. Python distributions are retained for seven days
  as workflow artifacts.
- **Tests** runs the API suite with line and branch coverage, then retains
  `coverage.xml` for seven days.
- **SonarQube** waits for Build and Tests, downloads coverage from the same
  workflow run, analyzes the code, and waits up to five minutes for the quality
  gate. A rejected gate fails the check, as does missing configuration.

Build and Tests run in parallel. Dependencies are resolved from `uv.lock`, and
third-party actions are pinned to verified commit hashes. The workflow grants
only read access to repository contents; it does not publish packages.

## Connect SonarQube Cloud

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

- Pull requests required, with one approval from another team member.
- Required status checks: **Build**, **Tests**, and **SonarQube**.
- Dismiss outdated approvals, require resolved review conversations, and require
  the branch to be up to date before merging.
- Block force pushes and branch deletion, with no routine bypass actors.
- Squash merging for short-lived feature branches.

These settings are applied in GitHub, not enforced by this document. During the
initial rollout, bootstrap the main-branch Sonar baseline before requiring its
check, then verify a PR produces all three checks.

## External contributions

Fork PRs and Dependabot PRs do not normally receive the repository's Sonar token.
Build and Tests still run; SonarQube fails explicitly instead of appearing green
without an analysis. For a reviewed external contribution, a maintainer can
bring the exact reviewed changes to a repository branch and open a PR from
there so the full workflow can run. Do not run fork code with repository secrets
through `pull_request_target`.

## Local equivalents

```sh
uv sync --locked --dev
uv run --locked coverage run -m unittest discover -s tests -v
uv run --locked coverage xml
uv run --locked coverage report
uv build --no-sources
docker build --tag zellige:ci .
```

Generated coverage files, distributions, and scanner working files are ignored
by Git.

## Future delivery

CI currently validates and retains artifacts only. Nightly publication,
version-tag releases, registry publishing, and automatic deployment are not
enabled. Release publishing can be added later as a separate workflow. If the
product gains a website, its deployment can have its own workflow after the
relevant CI checks, without tying that deployment to backend releases.
