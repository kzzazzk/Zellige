import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { buildMarketing } from '../deploy/build-marketing.mjs';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
// A stand-in for the Vite output in marketing/dist.
const distFiles = {
  'index.html': '<!doctype html><html lang="es"><body><div id="root"><main>zellige</main></div><script type="module" src="/assets/index-abc.js"></script></body></html>',
  'assets/index-abc.js': 'console.log("landing");',
  'assets/index-abc.css': 'body{background:url(/assets/ceramic-abc.webp)}',
  'assets/ceramic-abc.webp': 'RIFF....WEBP',
  'fonts/onest-variable.ttf': 'font',
  'fonts/OFL.txt': 'license',
};
const expectedFiles = Object.keys(distFiles).sort();

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'zellige-marketing-build-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [file, contents] of Object.entries(distFiles)) {
    await mkdir(dirname(join(root, 'marketing/dist', file)), { recursive: true });
    await writeFile(join(root, 'marketing/dist', file), contents);
  }
  await mkdir(join(root, 'deploy'));
  await cp(join(repositoryRoot, 'deploy/vercel-marketing.json'), join(root, 'deploy/vercel-marketing.json'));
  return root;
}

async function listFiles(root, prefix = '') {
  const files = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, path));
    else files.push(path);
  }
  return files.sort();
}

test('the artifact contains exactly the built landing, unchanged', async (t) => {
  const root = await fixture(t);
  // Put private material beside the build to catch accidental copying from outside dist.
  for (const file of [
    '.env', 'data/private.sqlite', 'docs/private.md', 'zellige/server.py',
    'marketing/src/App.tsx', 'marketing/images/pilot-preview.png', 'web/public/brand/zellige-emblem.png',
  ]) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), 'must remain private');
  }
  const { output } = await buildMarketing(root);
  assert.deepEqual(await listFiles(output), [
    'config.json', ...expectedFiles.map((file) => `static/${file}`),
  ].sort());
  for (const file of expectedFiles) {
    assert.equal(await readFile(join(output, 'static', file), 'utf8'), distFiles[file]);
  }
});

test('rebuilds remove stale generated assets and preserve sibling data', async (t) => {
  const root = await fixture(t);
  const { output } = await buildMarketing(root);
  const before = await readFile(join(output, 'config.json'));
  await writeFile(join(output, 'static/private.txt'), 'stale output');
  await writeFile(join(root, '.output/keep.txt'), 'unrelated output');
  await writeFile(join(root, '.output/marketing/.vercel/project.json'), 'project metadata');
  await buildMarketing(root);
  assert.deepEqual(await listFiles(join(output, 'static')), expectedFiles);
  assert.deepEqual(await readFile(join(output, 'config.json')), before);
  assert.equal(await readFile(join(root, '.output/keep.txt'), 'utf8'), 'unrelated output');
  assert.equal(await readFile(join(root, '.output/marketing/.vercel/project.json'), 'utf8'), 'project metadata');
});

test('a missing build fails before replacing a previous artifact', async (t) => {
  const root = await fixture(t);
  const { output } = await buildMarketing(root);
  const before = await readFile(join(output, 'static/index.html'));
  await rm(join(root, 'marketing/dist/index.html'));
  await assert.rejects(buildMarketing(root), /Missing marketing\/dist\/index.html/);
  assert.deepEqual(await readFile(join(output, 'static/index.html')), before);
});

test('symlinked build files cannot package a different file', async (t) => {
  const root = await fixture(t);
  await rm(join(root, 'marketing/dist/index.html'));
  await writeFile(join(root, 'private.txt'), 'private contents');
  await symlink(join(root, 'private.txt'), join(root, 'marketing/dist/index.html'));
  await assert.rejects(buildMarketing(root), /without symlinks/);
});

test('unexpected files, inline data URIs, inline scripts and pilot links are refused', async (t) => {
  const cases = [
    ['assets/index-abc.js.map', '{}', /Unexpected public file type/],
    ['assets/index-abc.css', 'body{background:url("data:image/svg+xml,%3Csvg%3E")}', /Inline data: URI/],
    ['index.html', '<html><script>alert(1)</script></html>', /Inline script/],
    ['assets/index-abc.js', 'fetch("/v1/conversations")', /private surfaces/],
    ['index.html', '<a href="https://zellige-dev.example">pilot</a>', /private surfaces/],
  ];
  for (const [file, contents, error] of cases) {
    const root = await fixture(t);
    await writeFile(join(root, 'marketing/dist', file), contents);
    await assert.rejects(buildMarketing(root), error, file);
  }
});

test('symlinked output ancestors cannot redirect cleanup or writes', async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, 'protected'));
  await writeFile(join(root, 'protected/keep.txt'), 'preserve');
  await symlink(join(root, 'protected'), join(root, '.output'));
  await assert.rejects(buildMarketing(root), /Refusing to replace/);
  assert.equal(await readFile(join(root, 'protected/keep.txt'), 'utf8'), 'preserve');
  assert.deepEqual(await readdir(join(root, 'protected')), ['keep.txt']);
});

test('all paths inherit the existing landing security headers', async () => {
  const config = JSON.parse(await readFile(join(repositoryRoot, 'deploy/vercel-marketing.json')));
  const caddy = await readFile(join(repositoryRoot, 'deploy/marketing.Caddyfile'), 'utf8');
  assert.equal(config.version, 3);
  const headers = Object.fromEntries(
    [...caddy.matchAll(/^\s*(X-Content-Type-Options|Referrer-Policy|X-Frame-Options|Content-Security-Policy)\s+(.+)$/gm)]
      .map(([, name, value]) => [name, value.replace(/^"|"$/g, '')]),
  );
  assert.equal(Object.keys(headers).length, 4);
  assert.deepEqual(config.routes[0], { src: '/.*', headers, continue: true });
  assert.deepEqual(config.routes.slice(1), [
    { src: '^/$', dest: '/index.html' },
    { src: '^/es/?$', dest: '/es/index.html' },
    { src: '^/en/?$', dest: '/en/index.html' },
    { handle: 'filesystem' },
  ]);
});

test('landing CD is separate, waits for successful main CI and checks the same commit', async () => {
  const workflow = await readFile(join(repositoryRoot, '.github/workflows/deploy-marketing.yml'), 'utf8');
  const ci = await readFile(join(repositoryRoot, '.github/workflows/ci-marketing.yml'), 'utf8');
  assert.doesNotMatch(ci, /deploy-marketing:/);
  assert.match(workflow, /workflow_run:\n\s+workflows: \[CI marketing\]\n\s+types: \[completed\]/);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /github\.event\.workflow_run\.event == 'push'/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}/);
  assert.match(workflow, /if \[ "\$latest_sha" != "\$APPROVED_SHA" \]/);
  assert.match(workflow, /^\s+VERCEL_ORG_ID: \$\{\{ vars\.VERCEL_ORG_ID \}\}$/m);
  assert.match(workflow, /^\s+VERCEL_PROJECT_ID: \$\{\{ vars\.VERCEL_PROJECT_ID \}\}$/m);
  assert.match(workflow, /^\s+VERCEL_TOKEN: \$\{\{ secrets\.VERCEL_TOKEN \}\}$/m);
  assert.match(workflow, /vercel deploy --prebuilt --prod --yes --meta sourceSha="\$APPROVED_SHA" --token="\$VERCEL_TOKEN" >"\$deployment_log" 2>&1/);
  assert.match(workflow, /trap 'rm -f "\$deployment_log"' EXIT/);
});

test('CD files do not publish installation identifiers or internal deployment URLs', async () => {
  for (const path of [
    '.github/workflows/deploy-marketing.yml', 'deploy/build-marketing.mjs',
    'deploy/vercel-marketing.json', 'docs/deployment/vercel.md',
    'tests/marketing-build.test.mjs',
  ]) {
    const contents = await readFile(join(repositoryRoot, path), 'utf8');
    assert.doesNotMatch(contents, /\b(?:team|prj|dpl)_[a-zA-Z0-9]{8,}\b/, path);
    assert.doesNotMatch(contents, /https?:\/\/[^\s<>]+\.(?:vercel\.app|vercel-dns-[0-9]+\.com)/, path);
  }
});
