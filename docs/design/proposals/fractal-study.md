# Zellige: retícula y autosimilitud finita

Propuesta del 2 de octubre de 2026. El logo original y los despliegues no se
modifican mediante estos scripts. Es una reinterpretación geométrica del motivo,
no una extracción vectorial exacta del PNG original ni una reproducción histórica.

## Investigación utilizada

- [Met, *Islamic Art and Geometric Design: Activities for Learning*](https://resources.metmuseum.org/resources/metpublications/pdf/Islamic_Art_and_Geometric_Design_Activities_for_Learning.pdf), pp. impresas 26–29 y 32–33: construcción de ocho divisiones y selección de trazos desde una retícula. Lectura del texto del manual.
- [Craig Kaplan, *Computer Generated Islamic Star Patterns* (2000)](https://cs.uwaterloo.ca/~csk/publications/Papers/kaplan_2000.pdf), secciones 2–3: construir motivos sobre una teselación y resolver los intersticios mediante geometría compartida. La sección final advierte que una construcción válida puede dejar huecos visualmente desproporcionados.
- [Jay Bonner, *Three Traditions of Self-Similarity…* (2003)](https://www.bonner-design.com/downloads/Bonner-3017.pdf), pp. 3–4 y 10–11: jerarquía de dos escalas, color que conserva la lectura grande y ejemplo del Patio de las Doncellas. Su razón 1:4,828 pertenece a esa construcción; no se impone a nuestro logo.
- [John Hutchinson, *Fractals and Self Similarity* (1981)](https://maths-people.anu.edu.au/~john/Assets/Research%20Papers/fractals_self-similarity.pdf), introducción y secciones 2–3: sistemas contractivos e iteración. Nuestra pieza finita no demuestra un conjunto fractal infinito ni una dimensión no entera.
- [Universidad de Bielefeld, Ammann–Beenker](https://tilings.math.uni-bielefeld.de/substitution/ammann-beenker/): la razón de plata aparece en una sustitución octogonal aperiódica. Nuestro patrón sigue siendo periódico; no es un teselado Ammann–Beenker.

No se han inspeccionado visualmente las láminas de los PDF: el navegador de
documentos solo devolvió sus referencias y texto. Las pruebas visuales propias sí
se han renderizado en Chromium.

## Decisión de diseño

La primera retícula dejaba un 34,31 % del área en grandes cuadrados azules.
La nueva conserva la estrella central y los conectores cuadrados girados, y
extiende los ocho pétalos marfil para que compartan los encuentros. Los cuadrados
azules pasan a un 8,58 %: su lado coincide con el de los conectores.

No se añaden triángulos de relleno ni se deforman los rombos. La estrella mantiene
ocho puntas; el conjunto tiene simetría de cuarto de vuelta, no simetría global
de octavo de vuelta. Las piezas marfil cambian de contorno exterior: esa es la
innovación propuesta, no debe describirse como logo idéntico.

La aplicación fractal es **autosimilitud geométrica local y finita**: dentro de
cada cuadrado azul se coloca una copia del mismo módulo, a menor escala y con
contraste subordinado. Solo se utiliza un nivel secundario en la propuesta.
Los bordes exteriores de la pieza no cambian. Aparecen uniones en T entre escalas;
no se afirma una teselación estrictamente arista-a-arista a todas las escalas.

Con `a = 1 + √2`, `s = 1/√2`, el período es `2a`. La escala secundaria se deriva
del encaje, `r = s/a = 1 − 1/√2 ≈ 0,292893`. No se ha elegido una proporción
"mágica" ni se presenta como una regla histórica universal.

## Archivos y comprobación

- `rosette.mjs`: geometría nativa, invariantes y renderizador SVG con definiciones reutilizables por nivel.
- `rosette-study.html`: comparación inicial de cuatro construcciones.
- `fractal-study.html`: comparación de uno y dos niveles; `?material` añade material; `?material&single&count=2` muestra solo el patrón.
- `build-rosette.mjs`: genera `zellige-rosette-v2.svg`, independiente de la imagen original.
- `ceramic-grain.png`: material monocromo generado; no contiene la geometría.
- `tests/pattern-geometry.test.mjs`: cobertura, ausencia de solapes positivos, coincidencia de fronteras periódicas, encaje recursivo y límite de tamaño.

```sh
node docs/design/proposals/build-rosette.mjs
node --test --test-isolation=none tests/pattern-geometry.test.mjs
```

El SVG de dos escalas usa unas 12 KB, no miles de polígonos duplicados por cada
repetición. El material se aplica en una sola pasada; filtrar un bitmap distinto
por cada pieza resultó innecesariamente costoso en la primera prueba.

## Material generado

Modo: herramienta integrada `image_gen` (no CLI). Solo material; la geometría no
se delega al modelo. Salida original `exec-c476261e-908f-4006-82c7-8274dcda726d.png`;
copia reutilizable `ceramic-grain.png`. Su continuidad de píxel no está certificada;
la periodicidad demostrada corresponde al módulo geométrico.

Prompt final:

> Use case: photorealistic-natural. Asset type: reusable material texture for mathematically constructed Zellige ceramic SVG polygons. Generate ONE square grayscale seamless texture swatch ONLY, filling the whole image edge to edge. Surface: close-up orthographic handmade glazed ceramic with subtle mineral mottling, satin-gloss microvariation, very fine restrained irregular crazing, luxurious authentic Moroccan zellige material. No tile outlines, no grout, no shapes, no mosaics, no logo, no border, no text, no objects, no scene or directional spotlight, no perspective. Neutral medium-gray albedo (most pixels between 30% and 70% luminance), fine tonal texture so it can be tinted deep blue, teal or ivory in an SVG material shader. Very faint hairline crazing rather than dramatic broken marble cracks. Uniform lighting and scale, no obvious repeated radial cracks or central focus. This is a MATERIAL, not a finished artwork. Square 1024 by 1024 or larger. Aim for seamlessly repeatable opposite edges.
