/** Redeploy the external demo gateway; no authentication implementation belongs here. */
import { pathToFileURL } from 'node:url';

export async function publishPilot({ env = process.env, fetchImpl = fetch, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const required = ['APPROVED_SHA', 'GITHUB_REPOSITORY', 'VERCEL_ORG_ID', 'VERCEL_PILOT_PROJECT_ID', 'VERCEL_PILOT_GATEWAY_DEPLOYMENT_ID', 'VERCEL_TOKEN'];
  for (const key of required) if (!env[key]) throw new Error(`Missing ${key}`);
  if (!/^[a-f0-9]{40}$/.test(env.APPROVED_SHA)) throw new Error('Invalid approved commit');
  if (env.GITHUB_REPOSITORY !== 'kzzazzk/Zellige') throw new Error('Unexpected source repository');

  const branch = env.APPROVED_BRANCH || 'main';
  if (!['main', 'minimal-mvp-chat-web'].includes(branch)) throw new Error('Invalid approved branch');

  async function currentBranch() {
    const response = await fetchImpl(`https://api.github.com/repos/kzzazzk/Zellige/git/ref/heads/${encodeURIComponent(branch)}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'zellige-pilot-cd' },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error('Could not verify current branch');
    if ((await response.json()).object?.sha !== env.APPROVED_SHA) throw new Error('A newer branch commit superseded this release');
  }
  async function vercel(path, { method = 'GET', body, query = {} } = {}) {
    const url = new URL(path, 'https://api.vercel.com');
    url.searchParams.set('teamId', env.VERCEL_ORG_ID);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    const response = await fetchImpl(url, {
      method, headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000),
    });
    // Raw API errors may contain private configuration. Never publish them in CI logs.
    if (!response.ok) throw new Error(`Vercel request failed (${response.status})`);
    return response.json();
  }
  await currentBranch();
  const projectId = encodeURIComponent(env.VERCEL_PILOT_PROJECT_ID);
  const project = await vercel(`/v9/projects/${projectId}`);
  if (project.name !== 'zellige-demo' || project.id !== env.VERCEL_PILOT_PROJECT_ID) throw new Error('Target is not the isolated demo project');
  const template = await vercel(`/v13/deployments/${encodeURIComponent(env.VERCEL_PILOT_GATEWAY_DEPLOYMENT_ID)}`);
  if ((template.projectId ?? template.project?.id) !== project.id || template.readyState !== 'READY') throw new Error('Gateway template is not ready in the demo project');
  const { envs = [] } = await vercel(`/v10/projects/${projectId}/env`, { query: { decrypt: 'false' } });
  const keys = new Set(envs.filter(item => item.target?.includes('production')).map(item => item.key));
  for (const key of ['AUTH_URL', 'AUTH_SECRET', 'AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET', 'DEV_ALLOWED_EMAILS']) {
    if (!keys.has(key)) throw new Error(`Configure ${key} in the demo project before enabling CD`);
  }
  await currentBranch();
  await vercel(`/v10/projects/${projectId}/env`, {
    method: 'POST', query: { upsert: 'true' },
    body: { key: 'DEV_SOURCE_SHA', value: env.APPROVED_SHA, type: 'plain', target: ['production'] },
  });
  await currentBranch();
  const deployment = await vercel('/v13/deployments', {
    method: 'POST',
    body: {
      name: project.name, project: project.id, deploymentId: template.id,
      target: 'production', withLatestCommit: false,
      meta: { pilotSourceSha: env.APPROVED_SHA },
    },
  });
  if (!deployment.id) throw new Error('Vercel did not return a deployment');
  for (let attempt = 0; attempt < 72; attempt++) {
    const state = await vercel(`/v13/deployments/${encodeURIComponent(deployment.id)}`);
    if (state.readyState === 'READY') return env.APPROVED_SHA;
    if (['ERROR', 'CANCELED'].includes(state.readyState)) throw new Error('Pilot gateway deployment failed');
    await wait(5000);
  }
  throw new Error('Timed out waiting for the pilot gateway');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  publishPilot().then(sha => console.log(`Pilot gateway published for ${sha.slice(0, 12)}.`)).catch(error => {
    // Only deliberate messages from this module are safe to surface.
    const safe = /^(Missing |Invalid approved|Unexpected source|Could not verify|A newer branch|Vercel request failed|Target is not|Gateway template|Configure |Vercel did not|Pilot gateway deployment failed|Timed out waiting)/;
    console.error(safe.test(error.message) ? error.message : 'Pilot CD failed; inspect the private deployment dashboard.');
    process.exitCode = 1;
  });
}
