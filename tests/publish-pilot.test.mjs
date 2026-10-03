import test from 'node:test';
import assert from 'node:assert/strict';
import { publishPilot } from '../deploy/publish-pilot.mjs';
const sha = 'a'.repeat(40);
const env = { APPROVED_SHA: sha, GITHUB_REPOSITORY: 'kzzazzk/Zellige', VERCEL_ORG_ID: 'test-team', VERCEL_PILOT_PROJECT_ID: 'test-project', VERCEL_PILOT_GATEWAY_DEPLOYMENT_ID: 'test-template', VERCEL_TOKEN: 'test-only-token' };
function scenario({ main = sha, name = 'zellige-demo', configured = true, templateProject = 'test-project', result = 'READY' } = {}) {
  const writes = [];
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input);
    if (url.hostname === 'api.github.com') return Response.json({ object: { sha: main } });
    if (options.method === 'POST') {
      writes.push({ path: url.pathname, body: JSON.parse(options.body) });
      return Response.json({ id: 'test-release' });
    }
    if (url.pathname.endsWith('/env')) return Response.json({ envs: configured ? ['AUTH_URL','AUTH_SECRET','AUTH_GOOGLE_ID','AUTH_GOOGLE_SECRET','DEV_ALLOWED_EMAILS'].map(key=>({key,target:['production']})) : [] });
    if (url.pathname.endsWith('/test-template')) return Response.json({id:'test-template',projectId:templateProject,readyState:'READY'});
    if (url.pathname.endsWith('/test-release')) return Response.json({readyState:result});
    return Response.json({id:'test-project',name});
  };
  return { writes, fetchImpl };
}
test('publishes the approved SHA while reusing the external gateway source', async()=>{
  const s=scenario(); assert.equal(await publishPilot({env,fetchImpl:s.fetchImpl}),sha);
  assert.equal(s.writes[0].body.key,'DEV_SOURCE_SHA');assert.equal(s.writes[0].body.value,sha);
  assert.equal(s.writes[1].body.deploymentId,'test-template');assert.equal(s.writes[1].body.withLatestCommit,false);
  assert.equal(s.writes[1].body.files,undefined);
});
test('stale commits, wrong projects, wrong templates and missing OAuth cause no writes',async()=>{
  for(const config of [{main:'b'.repeat(40)},{name:'zellige'},{templateProject:'landing'},{configured:false}]){
    const s=scenario(config);await assert.rejects(publishPilot({env,fetchImpl:s.fetchImpl}));assert.equal(s.writes.length,0);
  }
});
test('reports a deployment build failure instead of claiming success',async()=>{
  const s=scenario({result:'ERROR'});await assert.rejects(publishPilot({env,fetchImpl:s.fetchImpl}),/deployment failed/);
});
