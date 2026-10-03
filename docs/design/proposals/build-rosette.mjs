import { writeFile } from 'node:fs/promises';
import { renderPattern } from './rosette.mjs';

// Reproducible native asset. Intentionally does not replace the original logo
// or the current marketing PNG. Texture is applied separately in CSS so that
// SVG-as-image never depends on blocked external SVG resources.
const output=new URL('./zellige-rosette-v2.svg',import.meta.url);
await writeFile(output,renderPattern({depth:1,count:2}));
console.log(`Built ${output.pathname}`);
