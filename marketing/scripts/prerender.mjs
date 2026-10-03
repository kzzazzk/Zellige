// Prerender one page per locale into the built shell, then drop the SSR bundle.
// Spanish (default) is /index.html, English is /en/index.html; both list each other
// with hreflang so search engines serve the right one.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const shell = await readFile(`${root}dist/index.html`, 'utf8');
const { render, locales, localePath } = await import(`${root}.ssr/entry-server.js`);
for (const placeholder of ['<!--app-->', '<!--head-->', '<html lang="es">']) {
  if (!shell.includes(placeholder)) throw new Error(`Missing ${placeholder} in dist/index.html`);
}
const escape = (text) => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const alternates = Object.entries(localePath)
  .map(([locale, path]) => `<link rel="alternate" hreflang="${locale}" href="${path}" />`)
  .concat(`<link rel="alternate" hreflang="x-default" href="${localePath.es}" />`)
  .join('\n    ');

for (const [locale, path] of Object.entries(localePath)) {
  const html = render(locale);
  // Inline style attributes would be refused by the landing CSP (style-src 'self').
  if (/\sstyle="/.test(html)) throw new Error(`Prerendered ${locale} markup must not contain inline style attributes`);
  const { title, description } = locales[locale].meta;
  const head = `<title>${escape(title)}</title>\n    <meta name="description" content="${escape(description)}" />\n    ${alternates}`;
  const page = shell
    .replace('<html lang="es">', `<html lang="${locale}">`)
    .replace('<!--head-->', head)
    .replace('<!--app-->', html);
  const file = `${root}dist${path}index.html`;
  await mkdir(`${root}dist${path}`, { recursive: true });
  await writeFile(file, page);
  console.log(`Prerendered dist${path}index.html (${locale})`);
}
await rm(`${root}.ssr`, { recursive: true, force: true });
