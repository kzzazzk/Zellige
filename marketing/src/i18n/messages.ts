// Landing copy, one dictionary per locale. Spanish is the source; English mirrors
// its shape exactly (the `satisfies` check fails the build if a key is missing).
// Headlines are { lead, turn }: the plain line, then the serif-italic turn.

const es = {
  meta: {
    title: "Zellige — Cada idea encuentra su lugar",
    description:
      "Zellige. Un proyecto abierto para reunir conversaciones, herramientas y agentes en un espacio propio. Distintas piezas, una misma historia.",
  },
  skip: "Ir al contenido",
  header: {
    home: "Zellige, inicio",
    nav: "Principal",
    links: { idea: "La idea", branches: "Las ramas", project: "El proyecto" },
    theme: "Cambiar entre modo claro y oscuro",
    themeTitle: "Modo claro / oscuro",
  },
  hero: {
    etymology: { from: "del árabe", source: "az-zellīj", meaning: "«pequeña piedra pulida»" },
    title: { lead: "Tu IA está repartida en mil apps.", turn: "Zellige la junta." },
    body: "Tus agentes personales, los gestores que orquestan modelos y el chat de siempre, encajados en un espacio abierto que guarda una sola historia: la tuya.",
    next: "Ir a la siguiente sección",
    primary: "Mira cómo encaja",
    secondary: "Cómo va el proyecto",
  },
  zel: {
    alt: "Zel, la mascota de Zellige",
    hello: "¡Hola! Soy Zel.",
    helloLine: "Junto las piezas de tu IA en un solo sitio.",
    bye: "¡Hasta pronto!",
  },
  layers: {
    crown: { name: "Corona", use: "Chat" },
    cobalt: { name: "Azul", use: "Gestores y meta-harness" },
    points: { name: "Puntas", use: "Agentes personales" },
  },
  story: {
    eyebrow: "El arte de unir",
    definition:
      "Del árabe az-zellīj, «pequeña piedra pulida». Mosaico de piezas de cerámica cortadas a mano que, por separado, no dicen nada; juntas forman un dibujo.",
    headline: { lead: "Varias piedras,", turn: "un mismo azulejo." },
    steps: {
      crown: {
        title: "La corona",
        body: "Lo primero que rodea a Zel: las piezas de marfil. Es el chat, donde piensas en voz alta con el modelo que elijas. La pieza más cercana.",
      },
      cobalt: {
        title: "El azul",
        body: "Las esquinas que sujetan el conjunto. Son los gestores y meta-harness: orquestan modelos, herramientas y flujos para que todo encaje.",
      },
      points: {
        title: "Las puntas",
        body: "Lo que mira hacia fuera. Tus agentes personales: salen, recuerdan, avisan y hacen recados por ti.",
      },
      tile: {
        title: "El azulejo",
        body: "Corona, azul y puntas, cada capa con su papel, encajadas alrededor de Zel. Él guarda tu historia para todas. Cambia una capa sin empezar de cero.",
      },
    },
  },
  panorama: {
    label: "Mosaico zellige formado por piezas cerámicas que encajan entre sí",
    caption: { lead: "Cada pieza es distinta.", turn: "Juntas cuentan una sola historia." },
  },
  branches: {
    label: "Diagrama: una historia de mensajes de la que nace una rama sin perder el original",
    original: "Historia original",
    branch: "Una rama nueva",
    caption: { lead: "La pieza de la que parte", turn: "se queda donde estaba." },
    eyebrow: "Pensado para permanecer",
    headline: { lead: "Cambia de rumbo.", turn: "No de historia." },
    principles: [
      ["Tu conversación, no la de un proveedor.", "La conversación es el centro. Los modelos y herramientas pueden cambiar sin llevarse por delante lo que has construido."],
      ["Explorar sin borrar el camino.", "Las ramas permiten seguir una idea en otra dirección y conservar el hilo del que partiste. Cambiar de opinión también forma parte del proceso."],
      ["Un espacio que puedes hacer tuyo.", "Un proyecto abierto y autoalojado. El servidor guarda tu historia; las interfaces son distintas maneras de entrar en ella."],
    ] as [string, string][],
  },
  project: {
    eyebrow: "Estamos poniendo las primeras piezas",
    headline: { lead: "Lo estamos", turn: "construyendo." },
    progress: [
      ["Guardar conversaciones en tu propio servidor", true],
      ["Explorar ideas en ramas sin perder el original", true],
      ["Conectar agentes y modelos a tu historia", false],
    ] as [string, boolean][],
    signature: "Pieza a pieza.",
  },
  guide: {
    panorama: "¡Mira cómo encajan!",
    ramas: "Una rama nueva no borra el camino.",
    proyecto: "Seguimos poniendo piezas.",
  },
  footer: {
    tagline: "Distintas piezas. Una misma historia.",
    top: "Volver arriba",
    home: "Zellige, volver al inicio",
  },
};

export type Messages = typeof es;

const en = {
  meta: {
    title: "Zellige — Every idea finds its place",
    description:
      "Zellige. An open project that brings conversations, tools and agents together in a space of your own. Different pieces, one story.",
  },
  skip: "Skip to content",
  header: {
    home: "Zellige, home",
    nav: "Main",
    links: { idea: "The idea", branches: "Branches", project: "The project" },
    theme: "Switch between light and dark mode",
    themeTitle: "Light / dark mode",
  },
  hero: {
    etymology: { from: "from Arabic", source: "az-zellīj", meaning: "“small polished stone”" },
    title: { lead: "Your AI is scattered across a dozen apps.", turn: "Zellige brings it together." },
    body: "Your personal agents, the managers that orchestrate models and the chat you already use, fitted into one open space that keeps a single story: yours.",
    next: "Go to the next section",
    primary: "See how it fits",
    secondary: "How the project is going",
  },
  zel: {
    alt: "Zel, Zellige's mascot",
    hello: "Hi! I'm Zel.",
    helloLine: "I put the pieces of your AI in one place.",
    bye: "See you soon!",
  },
  layers: {
    crown: { name: "Crown", use: "Chat" },
    cobalt: { name: "Blue", use: "Managers & meta-harnesses" },
    points: { name: "Points", use: "Personal agents" },
  },
  story: {
    eyebrow: "The art of joining",
    definition:
      "From Arabic az-zellīj, “small polished stone”. A mosaic of hand-cut ceramic pieces that say nothing on their own; together they make a pattern.",
    headline: { lead: "Many stones,", turn: "one tile." },
    steps: {
      crown: {
        title: "The crown",
        body: "The first ring around Zel: the ivory pieces. That's chat, where you think out loud with the model you choose. The closest layer.",
      },
      cobalt: {
        title: "The blue",
        body: "The corners that hold it all together. Managers and meta-harnesses: they orchestrate models, tools and flows so everything fits.",
      },
      points: {
        title: "The points",
        body: "What faces outward. Your personal agents: they go out, remember, remind and run errands for you.",
      },
      tile: {
        title: "The tile",
        body: "Crown, blue and points, each layer with its role, fitted around Zel, who keeps your story for all of them. Swap a layer without starting over.",
      },
    },
  },
  panorama: {
    label: "Zellige mosaic made of ceramic pieces fitting together",
    caption: { lead: "Every piece is different.", turn: "Together they tell one story." },
  },
  branches: {
    label: "Diagram: a message history that branches off without losing the original",
    original: "Original history",
    branch: "A new branch",
    caption: { lead: "The piece it starts from", turn: "stays where it was." },
    eyebrow: "Built to last",
    headline: { lead: "Change course.", turn: "Not your story." },
    principles: [
      ["Your conversation, not a provider's.", "The conversation is the centre. Models and tools can change without taking what you've built with them."],
      ["Explore without erasing the path.", "Branches let you take an idea in another direction and keep the thread you started from. Changing your mind is part of the process."],
      ["A space you can make your own.", "An open, self-hosted project. The server keeps your story; the interfaces are different ways into it."],
    ],
  },
  project: {
    eyebrow: "Laying the first pieces",
    headline: { lead: "We're", turn: "building it." },
    progress: [
      ["Keep conversations on your own server", true],
      ["Explore ideas in branches without losing the original", true],
      ["Connect agents and models to your story", false],
    ],
    signature: "Piece by piece.",
  },
  guide: {
    panorama: "Look how they fit!",
    ramas: "A new branch doesn't erase the path.",
    proyecto: "Still laying pieces.",
  },
  footer: {
    tagline: "Different pieces. One story.",
    top: "Back to top",
    home: "Zellige, back to top",
  },
} satisfies Messages;

export const locales = { es, en } as const;
export type Locale = keyof typeof locales;
export const defaultLocale: Locale = "es";
/** Each locale's page. The root "/" picks one from the browser's languages (public/locale.js). */
export const localePath: Record<Locale, string> = { es: "/es/", en: "/en/" };
