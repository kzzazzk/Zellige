import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePilot } from '../deploy/resolve-pilot.mjs';
const env = { VERCEL_ORG_ID: 'team_test', VERCEL_TOKEN: 'test-token' };
const project = { id: 'prj_test', name: 'zellige-demo', accountId: 'team_test', targets: { production: { id: 'dpl_test' } } };
test('resolves by ID after name lookup fails without choosing another project', async () => {
  const paths = [];
  const result = await resolvePilot({ env, fetchImpl: async url => {
    paths.push(url.pathname);
    if (url.pathname.endsWith('/zellige-demo')) return new Response('', { status: 404 });
    if (url.pathname === '/v9/projects') return Response.json({ projects: [{ ...project, name: 'zellige-demo-other' }, project] });
    return Response.json(project);
  } });
  assert.deepEqual(paths, ['/v9/projects/zellige-demo', '/v9/projects', '/v9/projects/prj_test']);
  assert.deepEqual(result, { projectId: 'prj_test', templateId: 'dpl_test' });
});
test('reports an invisible project without exposing the API response', async () => {
  await assert.rejects(resolvePilot({ env, fetchImpl: async url => url.pathname.endsWith('/zellige-demo') ? new Response('private provider details', { status: 404 }) : Response.json({ projects: [] }) }), /not visible to the Actions credential/);
});
test('rejects wrong team and does not silently replace a configured project', async () => {
  await assert.rejects(resolvePilot({ env, fetchImpl: async () => Response.json({ ...project, accountId: 'team_other' }) }), /Unexpected pilot/);
  let calls = 0;
  await assert.rejects(resolvePilot({ env: { ...env, VERCEL_PILOT_PROJECT_ID: 'prj_explicit' }, fetchImpl: async () => { calls++; return new Response('', { status: 404 }); } }), /verify VERCEL_PILOT_PROJECT_ID/);
  assert.equal(calls, 1);
});
