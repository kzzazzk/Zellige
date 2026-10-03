/** Resolve optional installation IDs from the existing isolated pilot project. */
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export async function resolvePilot({ env = process.env, fetchImpl = fetch } = {}) {
  const team = env.VERCEL_ORG_ID?.trim();
  const token = env.VERCEL_TOKEN?.trim();
  if (!team) throw new Error('Missing VERCEL_ORG_ID');
  if (!token) throw new Error('Missing VERCEL_TOKEN');
  async function get(path, query = {}) {
    const url = new URL(path, 'https://api.vercel.com');
    url.searchParams.set('teamId', team);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    return fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
  }
  const configured = env.VERCEL_PILOT_PROJECT_ID?.trim();
  let response = await get(`/v9/projects/${encodeURIComponent(configured || 'zellige-demo')}`);
  if (response.status === 404 && !configured) {
    // Some credentials can list a project but require its ID for a direct lookup.
    const list = await get('/v9/projects', { search: 'zellige-demo', limit: '100' });
    if (!list.ok) throw new Error(`Pilot project lookup returned 404; project listing failed (${list.status})`);
    const { projects = [] } = await list.json();
    const matches = projects.filter(project => project.name === 'zellige-demo');
    if (matches.length !== 1) throw new Error('Pilot project is not visible to the Actions credential in the configured team');
    response = await get(`/v9/projects/${encodeURIComponent(matches[0].id)}`);
  }
  if (!response.ok) throw new Error(`Pilot project lookup failed (${response.status})${configured ? '; verify VERCEL_PILOT_PROJECT_ID' : ''}`);
  const project = await response.json();
  if (project.name !== 'zellige-demo' || !/^prj_[a-zA-Z0-9]+$/.test(project.id) || project.accountId !== team) throw new Error('Unexpected pilot project or team');
  const template = env.VERCEL_PILOT_GATEWAY_DEPLOYMENT_ID?.trim() || project.targets?.production?.id;
  if (!/^dpl_[a-zA-Z0-9]+$/.test(template || '')) throw new Error('Missing ready production gateway template');
  return { projectId: project.id, templateId: template };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  resolvePilot().then(({ projectId, templateId }) => {
    if (!process.env.GITHUB_ENV) throw new Error('Missing GITHUB_ENV');
    for (const value of [projectId, templateId]) console.log(`::add-mask::${value}`);
    appendFileSync(process.env.GITHUB_ENV, `VERCEL_PILOT_PROJECT_ID=${projectId}\nVERCEL_PILOT_GATEWAY_DEPLOYMENT_ID=${templateId}\n`);
    console.log('Resolved the existing isolated pilot project and gateway template.');
  }).catch(error => {
    console.error(/^(Missing |Pilot project |Unexpected pilot)/.test(error.message) ? error.message : 'Pilot configuration lookup failed');
    process.exitCode = 1;
  });
}
