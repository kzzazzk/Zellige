import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// These checks run against the prerendered build: what visitors (and crawlers,
// and browsers without JavaScript) receive. Build it first: `npm run build` in marketing/.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'marketing/dist');
assert.ok(existsSync(join(dist, 'index.html')), 'Run `npm run build` in marketing/ before these tests');
const pageUrl = new URL('https://zellige.invalid/');
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const sourceCss = readFileSync(resolve(root, 'marketing/src/styles.css'), 'utf8');
const tags = [...html.matchAll(/<([a-z][\w:-]*)\b([^<>]*)>/gi)].map((match) => ({
  name: match[1].toLowerCase(),
  attrs: Object.fromEntries(
    [...match[2].matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)]
      .map((attr) => [attr[1].toLowerCase(), attr[2] ?? attr[3] ?? attr[4]]),
  ),
}));
const builtFiles = (function list(prefix = '') {
  return readdirSync(join(dist, prefix), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? list(join(prefix, entry.name)) : [join(prefix, entry.name)]);
})();

function localAsset(reference, base = pageUrl) {
  const url = new URL(reference, base);
  assert.equal(url.origin, pageUrl.origin, `Asset must be local: ${reference}`);
  const file = join(dist, decodeURIComponent(url.pathname));
  assert.ok(statSync(file).isFile(), `Asset must exist in the build: ${reference}`);
  return { file, url };
}

test('landing declares its language and responsive viewport', () => {
  assert.ok(tags.find(({ name }) => name === 'html')?.attrs.lang?.trim());
  const viewport = tags.find(({ name, attrs }) =>
    name === 'meta' && attrs.name?.toLowerCase() === 'viewport');
  assert.match(viewport?.attrs.content ?? '', /width\s*=\s*device-width/i);
});

test('content is prerendered, so it reads without JavaScript', () => {
  assert.match(html, /<h1[^>]*id="hero-title"[^>]*>\s*<img[^>]*alt="zellige"/);
  for (const id of ['inicio', 'piezas', 'ramas', 'proyecto']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /pequeña piedra pulida/, 'The name is explained under the title');
  assert.match(html, /Tu IA está repartida en mil apps\./);
  assert.match(html, /<details[^>]*open/, 'Principles use native disclosures');
});

test('landing has no links to the pilot, development domain, or GitHub', () => {
  const forbidden = /\b(?:piloto?|zellige-dev)\b|(?:^|\/\/)(?:[^/]+\.)?github\.com(?:[/:]|$)/i;
  for (const { attrs } of tags.filter(({ name }) => name === 'a')) {
    assert.doesNotMatch(decodeURIComponent(attrs.href ?? ''), forbidden);
  }
  assert.doesNotMatch(html, /pilot-preview/);
});

test('every referenced script, style, image and font is a local file in the build', () => {
  const stylesheets = tags.filter(({ name, attrs }) =>
    name === 'link' && attrs.rel?.split(/\s+/).includes('stylesheet'));
  assert.ok(stylesheets.length > 0, 'Landing must reference a local stylesheet');
  for (const { name, attrs } of tags) {
    for (const attribute of ['src', 'href']) {
      const reference = attrs[attribute];
      if (!reference || reference.startsWith('#')) continue;
      // Navigation links and hreflang alternates point at pages, not assets.
      if (name === 'a' || (name === 'link' && ['alternate', 'canonical'].includes(attrs.rel))) continue;
      assert.ok(!reference.startsWith('data:'), `No inline data: URIs under the CSP: ${reference}`);
      localAsset(reference);
    }
  }
  for (const { attrs } of stylesheets) {
    const { file, url } = localAsset(attrs.href);
    const css = readFileSync(file, 'utf8');
    for (const match of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)/gi)) {
      const asset = match[1] ?? match[2] ?? match[3];
      if (!asset || asset.startsWith('#')) continue;
      assert.ok(!asset.startsWith('data:'), 'No inline data: URIs under the CSP');
      localAsset(asset, url);
    }
  }
});

test('markup has no inline scripts or style attributes the CSP would refuse', () => {
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
  assert.doesNotMatch(html, /\sstyle="/i);
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

// Token blocks: `:root { … }` is the light theme, `.dark { … }` the dark one.
function palette(selector) {
  const start = sourceCss.indexOf(`${selector} {`);
  assert.ok(start >= 0, `Missing ${selector} token block`);
  const block = sourceCss.slice(start, sourceCss.indexOf('}', start));
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map(([, name, value]) => [name, value]));
}

test('light landing palette keeps text readable across its surfaces', () => {
  const colors = palette(':root');
  function luminance(hex) {
    assert.match(hex ?? '', /^#[0-9a-f]{6}$/i);
    const rgb = hex.slice(1).match(/../g).map((channel) => {
      const value = parseInt(channel, 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  }
  function contrast(a, b) {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (light + 0.05) / (dark + 0.05);
  }
  for (const surface of ['background', 'surface']) {
    for (const text of ['foreground', 'muted-foreground', 'accent', 'gold']) {
      assert.ok(contrast(colors[text], colors[surface]) >= 4.5, `${text} on ${surface}`);
    }
  }
  assert.ok(contrast(colors.background, colors.accent) >= 4.5, 'Selected and hover text');
  assert.ok(contrast(colors.input, colors.background) >= 3, 'Control border');
  for (const text of ['night-foreground', 'night-muted', 'night-gold']) {
    assert.ok(contrast(colors[text], colors.night) >= 4.5, `${text} on night`);
  }
});

test('dark landing palette keeps text readable too', () => {
  const light = palette(':root');
  const dark = { ...light, ...palette('.dark') };
  const lum = (hex) => hex.slice(1).match(/../g).map((c) => {
    const v = parseInt(c, 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, v, k) => sum + v * [0.2126, 0.7152, 0.0722][k], 0);
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  for (const surface of ['background', 'surface', 'popover']) {
    for (const text of ['foreground', 'muted-foreground', 'accent', 'gold']) {
      assert.ok(contrast(dark[text], dark[surface]) >= 4.5, `dark ${text} on ${surface}`);
    }
  }
  for (const text of ['night-foreground', 'night-muted', 'night-gold']) {
    assert.ok(contrast(dark[text], dark.night) >= 4.5, `dark ${text} on night`);
  }
});

test('theme follows the system or the saved choice, set before first paint', () => {
  const metas = tags.filter(({ name, attrs }) => name === 'meta' && attrs.name === 'theme-color');
  assert.equal(metas.find(({ attrs }) => /light/.test(attrs.media ?? ''))?.attrs.content, palette(':root').background);
  assert.equal(metas.find(({ attrs }) => /dark/.test(attrs.media ?? ''))?.attrs.content, palette('.dark').background);
  // A blocking external script in <head>, before the stylesheet paints the page.
  const head = html.slice(0, html.indexOf('</head>'));
  assert.match(head, /<script src="\/theme\.js"><\/script>/);
  assert.match(sourceCss, /color-scheme:\s*light/);
  assert.match(sourceCss, /\.dark \{\s*color-scheme:\s*dark/);
});

test('brand art: approved ceramic mosaic, emblem layers, emblem and moodboard wordmark', () => {
  const asset = (prefix, extension) => builtFiles.find((file) =>
    file.startsWith(`assets/${prefix}`) && file.endsWith(extension));
  for (const [prefix, extension] of [
    ['ceramic-', '.webp'], ['emblem-', '.webp'], ['layer-centre-', '.webp'], ['layer-crown-', '.webp'],
    ['layer-cobalt-', '.webp'], ['layer-points-', '.webp'], ['zellige-wordmark-', '.svg'],
  ]) assert.ok(asset(prefix, extension), `${prefix}*${extension} is published`);
  // Superseded artwork never reaches the public build.
  assert.ok(!builtFiles.some((file) => /zellige-mosaic|rosette-v2|ceramic-grain|interlocked/.test(file)));
  const ceramic = readFileSync(join(dist, asset('ceramic-', '.webp')));
  assert.equal(ceramic.subarray(8, 12).toString(), 'WEBP');
  assert.match(html, /alt="zellige"/, 'Wordmark image carries the brand name');
});

test('each language has its own prerendered page, linked with hreflang', () => {
  const pages = { es: readFileSync(join(dist, 'es/index.html'), 'utf8'), en: readFileSync(join(dist, 'en/index.html'), 'utf8') };
  assert.equal(html, pages.es, 'The root serves the Spanish page until locale.js redirects');
  const titles = new Set();
  for (const [locale, page] of Object.entries(pages)) {
    assert.match(page, new RegExp(`<html lang="${locale}">`));
    assert.match(page, /<link rel="alternate" hreflang="es" href="\/es\/" \/>/);
    assert.match(page, new RegExp(`<link rel="canonical" href="/${locale}/" />`));
    assert.match(page, /<link rel="alternate" hreflang="en" href="\/en\/" \/>/);
    assert.match(page, /<link rel="alternate" hreflang="x-default" href="\/" \/>/);
    assert.match(page, /<script src="\/locale\.js"><\/script>/, 'Browser-language redirect runs before paint');
    assert.doesNotMatch(page, /\sstyle="|<!--(?:app|head)-->/);
    titles.add(page.match(/<title>([^<]+)<\/title>/)?.[1]);
  }
  assert.equal(titles.size, 2, 'Titles are translated');
  assert.match(pages.en, /Your AI is scattered across a dozen apps\./);
  assert.doesNotMatch(pages.en, /Varias piedras|Mira cómo encaja|repartida/, 'No Spanish copy left on the English page');
});
