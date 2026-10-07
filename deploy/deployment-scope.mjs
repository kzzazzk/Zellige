/** Detect pending application changes since that application's last deployment. */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function affects(target, paths) {
  const shared = new Set(['deploy/deployment-scope.mjs']);
  const specific = {
    pilot: new Set(['app.py', 'pyproject.toml', 'uv.lock', 'deploy/publish-pilot.mjs', 'deploy/resolve-pilot.mjs', '.github/workflows/cd.yml']),
  };
  const prefixes = { pilot: ['web/', 'zellige/', 'db/'] };
  if (!specific[target]) throw new Error('Unknown deployment target');
  return paths.some(path => shared.has(path) || specific[target].has(path) || prefixes[target].some(prefix => path.startsWith(prefix)));
}

export function pendingChanges(target, base, head, git = args => execFileSync('git', args, { encoding: 'utf8' })) {
  if (!/^[a-f0-9]{40}$/.test(head)) throw new Error('Invalid candidate commit');
  if (!base || !/^[a-f0-9]{40}$/.test(base)) return true; // First deployment or unlabelled historical deployment.
  let paths;
  try { paths = git(['diff', '--no-renames', '--name-only', '-z', base, head, '--']).split('\0').filter(Boolean); }
  catch { return true; } // Missing baseline after history rewrite: rebuild conservatively.
  return affects(target, paths);
}

export async function deploymentChanged({ env = process.env, fetchImpl = fetch, git } = {}) {
  for (const key of ['DEPLOY_TARGET', 'APPROVED_SHA', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID', 'VERCEL_TOKEN']) {
    if (!env[key]) throw new Error(`Missing ${key}`);
  }
  const expectedName = { pilot: 'zellige-demo' }[env.DEPLOY_TARGET];
  if (!expectedName) throw new Error('Unknown deployment target');
  async function api(path) {
    const url = new URL(path, 'https://api.vercel.com');
    url.searchParams.set('teamId', env.VERCEL_ORG_ID);
    const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}` }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Deployment baseline request failed (${response.status})`);
    return response.json();
  }
  const project = await api(`/v9/projects/${encodeURIComponent(env.VERCEL_PROJECT_ID)}`);
  if (project.name !== expectedName) throw new Error('Unexpected deployment project');
  if (env.DEPLOY_FORCE === 'true') return true;
  const id = project.targets?.production?.id;
  if (!id) return true;
  const deployment = await api(`/v13/deployments/${encodeURIComponent(id)}`);
  if (deployment.readyState !== 'READY') return true;
  const base = deployment.meta?.sourceSha ?? deployment.meta?.pilotSourceSha;
  return pendingChanges(env.DEPLOY_TARGET, base, env.APPROVED_SHA, git);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  deploymentChanged().then(changed => {
    appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
    console.log(changed ? 'Application has pending deployment changes.' : 'Application already matches the deployed source.');
  }).catch(error => {
    console.error(/^(Missing |Unknown deployment|Unexpected deployment|Invalid candidate|Deployment baseline request failed)/.test(error.message) ? error.message : 'Could not determine deployment scope.');
    process.exitCode = 1;
  });
}
