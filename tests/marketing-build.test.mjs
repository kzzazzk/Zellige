import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { buildMarketing } from '../deploy/build-marketing.mjs';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const expectedFiles = [
  'brand/zellige-emblem.png',
  'fonts/CormorantGaramond-OFL.txt',
  'fonts/OFL.txt',
  'fonts/cormorant-garamond-italic-variable.ttf',
  'fonts/cormorant-garamond-variable.ttf',
  'fonts/onest-variable.ttf',
  'images/zellige-mosaic.png',
  'index.html',
  'styles.css',
];

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'zellige-marketing-build-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const file of expectedFiles) {
    const source = file.startsWith('brand/') ? `web/public/${file}` : `marketing/${file}`;
    await mkdir(dirname(join(root, source)), { recursive: true });
    await cp(join(repositoryRoot, source), join(root, source));
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

test('the artifact contains exactly the approved public files, unchanged', async (t) => {
  const root = await fixture(t);
  // Put excluded material beside inputs to catch accidental recursive copying.
  for (const file of [
    '.env', 'data/private.sqlite', 'docs/private.md', 'zellige/server.py',
    'marketing/images/pilot-preview.png', 'web/public/brand/zellige-companion-hello.png',
  ]) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), 'must remain private');
  }
  const { output } = await buildMarketing(root);
  assert.deepEqual(await listFiles(output), [
    'config.json', ...expectedFiles.map((file) => `static/${file}`),
  ].sort());
  for (const file of expectedFiles) {
    const source = file.startsWith('brand/') ? `web/public/${file}` : `marketing/${file}`;
    assert.deepEqual(await readFile(join(output, 'static', file)), await readFile(join(root, source)));
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

test('missing inputs fail before replacing a previous artifact', async (t) => {
  const root = await fixture(t);
  const { output } = await buildMarketing(root);
  const before = await readFile(join(output, 'static/index.html'));
  await rm(join(root, 'marketing/index.html'));
  await assert.rejects(buildMarketing(root), { code: 'ENOENT' });
  assert.deepEqual(await readFile(join(output, 'static/index.html')), before);
});

test('symlinked inputs cannot package a different file', async (t) => {
  const root = await fixture(t);
  await rm(join(root, 'marketing/index.html'));
  await writeFile(join(root, 'private.txt'), 'private contents');
  await symlink(join(root, 'private.txt'), join(root, 'marketing/index.html'));
  await assert.rejects(buildMarketing(root), /without symlinks/);
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
    { src: '^/$', dest: '/index.html' }, { handle: 'filesystem' },
  ]);
});

test('CD keeps deployment identifiers and the token in GitHub Secrets', async () => {
  const workflow = await readFile(join(repositoryRoot, '.github/workflows/deploy-marketing.yml'), 'utf8');
  assert.match(workflow, /^\s+VERCEL_ORG_ID: \$\{\{ secrets\.VERCEL_ORG_ID \}\}$/m);
  assert.match(workflow, /^\s+VERCEL_PROJECT_ID: \$\{\{ secrets\.VERCEL_PROJECT_ID \}\}$/m);
  assert.match(workflow, /^\s+VERCEL_TOKEN: \$\{\{ secrets\.VERCEL_TOKEN \}\}$/m);
  assert.doesNotMatch(workflow, /\$\{\{\s*vars\./);
  assert.match(workflow, /vercel deploy --prebuilt --prod --yes >"\$deployment_log" 2>&1/);
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
