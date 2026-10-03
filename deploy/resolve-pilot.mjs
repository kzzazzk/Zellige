/** Resolve optional installation IDs from the existing isolated pilot project. */
import { appendFileSync } from 'node:fs';
for (const key of ['VERCEL_ORG_ID', 'VERCEL_TOKEN', 'GITHUB_ENV']) {
  if (!process.env[key]) throw new Error(`Missing ${key}`);
}
const url = new URL(`/v9/projects/${encodeURIComponent(process.env.VERCEL_PILOT_PROJECT_ID || 'zellige-demo')}`, 'https://api.vercel.com');
url.searchParams.set('teamId', process.env.VERCEL_ORG_ID);
const response = await fetch(url, { headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` }, signal: AbortSignal.timeout(20000) });
if (!response.ok) throw new Error(`Pilot project lookup failed (${response.status})`);
const project = await response.json();
if (project.name !== 'zellige-demo' || !/^prj_[a-zA-Z0-9]+$/.test(project.id)) throw new Error('Unexpected pilot project');
const template = process.env.VERCEL_PILOT_GATEWAY_DEPLOYMENT_ID || project.targets?.production?.id;
if (!/^dpl_[a-zA-Z0-9]+$/.test(template || '')) throw new Error('Missing ready production gateway template');
for (const value of [project.id, template]) console.log(`::add-mask::${value}`);
appendFileSync(process.env.GITHUB_ENV, `VERCEL_PILOT_PROJECT_ID=${project.id}\nVERCEL_PILOT_GATEWAY_DEPLOYMENT_ID=${template}\n`);
console.log('Resolved the existing isolated pilot project and gateway template.');
