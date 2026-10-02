import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pageUrl = new URL('https://zellige.invalid/');
const html = readFileSync(resolve(root, 'marketing/index.html'), 'utf8');
const tags = [...html.matchAll(/<([a-z][\w:-]*)\b([^<>]*)>/gi)].map((match) => ({
  name: match[1].toLowerCase(),
  attrs: Object.fromEntries(
    [...match[2].matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)]
      .map((attr) => [attr[1].toLowerCase(), attr[2] ?? attr[3] ?? attr[4]]),
  ),
}));
const stylesheets = tags.filter(({ name, attrs }) =>
  name === 'link' && attrs.rel?.split(/\s+/).includes('stylesheet'));

function localAsset(reference, base = pageUrl) {
  const url = new URL(reference, base);
  assert.equal(url.origin, pageUrl.origin, `Asset must be local: ${reference}`);
  const pathname = decodeURIComponent(url.pathname);
  const file = pathname.startsWith('/brand/')
    ? resolve(root, 'web/public', `.${pathname}`)
    : resolve(root, 'marketing', `.${pathname}`);
  assert.ok(statSync(file).isFile(), `Asset must exist as a file: ${reference}`);
  return { file, url };
}

test('landing declares its language and responsive viewport', () => {
  assert.ok(tags.find(({ name }) => name === 'html')?.attrs.lang?.trim());
  const viewport = tags.find(({ name, attrs }) =>
    name === 'meta' && attrs.name?.toLowerCase() === 'viewport');
  assert.match(viewport?.attrs.content ?? '', /width\s*=\s*device-width/i);
});

test('landing has no links to the pilot, development domain, or GitHub', () => {
  const forbidden = /\b(?:piloto?|zellige-dev)\b|(?:^|\/\/)(?:[^/]+\.)?github\.com(?:[/:]|$)/i;
  for (const { attrs } of tags.filter(({ name }) => name === 'a')) {
    assert.doesNotMatch(decodeURIComponent(attrs.href ?? ''), forbidden);
  }
});

test('landing uses local styles, scripts, fonts, and existing file assets', () => {
  assert.ok(stylesheets.length > 0, 'Landing must reference a local stylesheet');
  for (const { name, attrs } of tags) {
    for (const attribute of ['src', 'poster']) {
      const reference = attrs[attribute];
      if (!reference || reference.startsWith('data:') || reference.startsWith('#')) continue;
      // Remote media is outside this file check; executable scripts must be local.
      if (name === 'script' || new URL(reference, pageUrl).origin === pageUrl.origin) {
        localAsset(reference);
      }
    }
    if (name === 'link' && attrs.href && /\b(?:stylesheet|icon|preload)\b/.test(attrs.rel ?? '')) {
      localAsset(attrs.href);
    }
  }

  const checked = new Set();
  function checkStylesheet(reference, base = pageUrl) {
    const { file, url } = localAsset(reference, base);
    if (checked.has(file)) return;
    checked.add(file);
    const css = readFileSync(file, 'utf8');
    assert.doesNotMatch(css, /pilot-preview|zellige-companion|mascot/i);
    for (const match of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)/gi)) {
      const asset = match[1] ?? match[2] ?? match[3];
      if (asset && !asset.startsWith('data:') && !asset.startsWith('#')) localAsset(asset, url);
    }
    for (const match of css.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/gi)) {
      checkStylesheet(match[1], url);
    }
  }
  for (const { attrs } of stylesheets) checkStylesheet(attrs.href);
});

test('landing has no pilot screenshot or mascot references', () => {
  assert.doesNotMatch(html, /pilot-preview|zellige-companion|mascot/i);
});

test('internal section links resolve to existing ids', () => {
  const ids = new Set(tags.map(({ attrs }) => attrs.id).filter(Boolean));
  for (const { attrs } of tags.filter(({ name }) => name === 'a')) {
    if (!attrs.href) continue;
    const target = new URL(attrs.href, pageUrl);
    if (target.origin === pageUrl.origin && target.pathname === '/' && target.hash) {
      const id = decodeURIComponent(target.hash.slice(1));
      assert.ok(ids.has(id), `Missing target for section link: ${attrs.href}`);
    }
  }
});
