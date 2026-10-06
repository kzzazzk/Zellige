import test from 'node:test';
import assert from 'node:assert/strict';
import { affects, pendingChanges, deploymentChanged } from '../deploy/deployment-scope.mjs';
const old='a'.repeat(40),head='b'.repeat(40);
test('deploys application changes and rejects unsupported targets',()=>{
  for(const path of ['web/src/App.tsx', 'zellige/server.py', 'migrations/003_example.sql', 'uv.lock']) assert.equal(affects('pilot',[path]),true);
  assert.equal(affects('pilot',['docs/note.md','tests/example.test.mjs']),false);
  assert.equal(affects('pilot',['deploy/deployment-scope.mjs']),true);
  assert.throws(()=>affects('marketing',[]),/Unknown deployment target/);
});
test('compares with deployed commit, preserving pending changes across later pushes',()=>{
  let invocation;
  assert.equal(pendingChanges('pilot',old,head,args=>{invocation=args;return 'deploy/deployment-scope.mjs\0docs/note.md\0';}),true);
  assert.deepEqual(invocation,['diff','--no-renames','--name-only','-z',old,head,'--']);
  assert.equal(pendingChanges('pilot',old,head,()=> 'docs/note.md\0'),false);
  assert.equal(pendingChanges('pilot',old,old,()=>''),false);
});
test('unknown and unreachable baselines conservatively deploy',()=>{
  assert.equal(pendingChanges('pilot',undefined,head),true);
  assert.equal(pendingChanges('pilot',old,head,()=>{throw Error('missing commit');}),true);
});
test('uses current project production alias and labelled deployment without exposing values',async()=>{
  const env={DEPLOY_TARGET:'pilot',APPROVED_SHA:head,VERCEL_ORG_ID:'team',VERCEL_PROJECT_ID:'pilot',VERCEL_TOKEN:'test'};
  const fetchImpl=async url=>Response.json(url.pathname.startsWith('/v9/')?{name:'zellige-demo',targets:{production:{id:'current'}}}:{readyState:'READY',meta:{pilotSourceSha:old}});
  assert.equal(await deploymentChanged({env,fetchImpl,git:()=> 'docs/note.md\0'}),false);
  assert.equal(await deploymentChanged({env,fetchImpl,git:()=> 'web/src/App.tsx\0'}),true);
});
