/** Native geometry, not an image-model reconstruction. See fractal-study.md. */
export const Q = Math.SQRT2;
export const A = 1 + Q;
export const S = 1 / Q;
export const PERIOD = 2 * A;
export const RECURSION_SCALE = S / A;
export const STAR = [
  [0,-Q],[Q-1,-1],[1,-1],[1,1-Q],[Q,0],[1,Q-1],[1,1],[Q-1,1],
  [0,Q],[1-Q,1],[-1,1],[-1,Q-1],[-Q,0],[-1,1-Q],[-1,-1],[1-Q,-1],
];
export const turn = ([x,y], n) => {
  switch ((n % 4 + 4) % 4) {
    case 0: return [x,y];
    case 1: return [-y,x];
    case 2: return [-x,-y];
    default: return [y,-x];
  }
};
export function area(points) {
  return Math.abs(points.reduce((sum,[x,y],i)=>{
    const [u,v]=points[(i+1)%points.length]; return sum+x*v-u*y;
  },0)/2);
}
export function cellPieces(a=A,s=S) {
  if (!(a>Q && s>0 && s<a-1)) throw new RangeError('Invalid rosette proportions');
  const e=a-s;
  const petal=[[Q,0],[1,Q-1],[1,1],[e,e],[a,e],[a,1]];
  const connector=[[Q,0],[a,1],[2*a-Q,0],[a,-1]];
  const square=[[a-s,a-s],[a+s,a-s],[a+s,a+s],[a-s,a+s]];
  const pieces=[{kind:'star',points:STAR}];
  for(let n=0;n<4;n++) {
    pieces.push({kind:'ivory',points:petal.map(p=>turn(p,n))});
    pieces.push({kind:'ivory',points:petal.map(([x,y])=>turn([y,x],n))});
  }
  pieces.push({kind:'teal',points:connector});
  pieces.push({kind:'blue',points:connector.map(p=>turn(p,1))});
  pieces.push({kind:'corner',points:square});
  return pieces;
}
export const pointsText = points => points.map(p=>p.map(v=>Number(v.toFixed(8))).join(',')).join(' ');
export const shifted = (points,x,y,scale=1) => points.map(([u,v])=>[x+u*scale,y+v*scale]);

/** A finite hierarchy: replace only the corner square's interior, never its boundary. */
export function renderPattern({depth=0,count=3,material=false,textureHref='ceramic-grain.png'}={}) {
  if(!Number.isInteger(depth)||depth<0||depth>2) throw new RangeError('Depth must be 0, 1 or 2');
  if(!Number.isInteger(count)||count<1||count>8) throw new RangeError('Count must be 1..8');
  const size=PERIOD*count, pieces=cellPieces(),defs=[];
  const colors={star:'#0A5057',ivory:'#F4EBD7',teal:'#0E6B6A',blue:'#153F73',corner:'#123B68'};
  const smallColors={star:'#0E5662',ivory:'#204B72',teal:'#155B69',blue:'#10345F',corner:'#123B68'};
  if(material) {
    // A single material pass: filtering a large bitmap separately for every tiny
    // tile is expensive and unnecessary. Geometry stays exactly the same.
    defs.push(`<pattern id="grain" width="${PERIOD*2}" height="${PERIOD*2}" patternUnits="userSpaceOnUse"><image href="${textureHref}" width="${PERIOD*2}" height="${PERIOD*2}" preserveAspectRatio="none"/></pattern>`);
    defs.push('<linearGradient id="brass" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ECD399"/><stop offset=".28" stop-color="#B78C43"/><stop offset=".55" stop-color="#E2C182"/><stop offset="1" stop-color="#92692D"/></linearGradient>');
  }
  function polygon(piece,points,level) {
    const small=level>0, fill=(small?smallColors:colors)[piece.kind];
    const width=small?.012:.029;
    // Keep fine-scale ornament subordinate to the full-size logo vocabulary.
    return `<polygon points="${pointsText(points)}" fill="${fill}" stroke="${material?'url(#brass)':small?'#A58B59':'#BFA16A'}" stroke-width="${width}" stroke-linejoin="round"${small?' stroke-opacity=".7"':''}/>`;
  }
  // Define each scale once. Nested pattern references avoid exponentially large
  // files and allow the browser to cache the repeated cell.
  for(let level=depth;level>=0;level--) {
    const content=[];
    for(let row=-1;row<=1;row++)for(let col=-1;col<=1;col++) {
      const x=col*PERIOD,y=row*PERIOD;
      for(const piece of pieces) {
        const points=shifted(piece.points,x,y);
        const minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0]));
        const minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]));
        if(maxX<-A||minX>A||maxY<-A||minY>A)continue;
        if(piece.kind!=='corner'||level===depth) {content.push(polygon(piece,points,level));continue;}
        const cx=x+A,cy=y+A;
        content.push(`<svg x="${cx-S}" y="${cy-S}" width="${2*S}" height="${2*S}" viewBox="0 0 ${PERIOD} ${PERIOD}" overflow="hidden"><rect width="${PERIOD}" height="${PERIOD}" fill="url(#cell-${level+1})"/></svg>`);
        content.push(`<polygon points="${pointsText(points)}" fill="none" stroke="${material?'url(#brass)':'#BFA16A'}" stroke-width="${level===0?.029:.012}"/>`);
      }
    }
    defs.push(`<pattern id="cell-${level}" width="${PERIOD}" height="${PERIOD}" patternUnits="userSpaceOnUse" viewBox="${-A} ${-A} ${PERIOD} ${PERIOD}">${content.join('')}</pattern>`);
  }
  const paths=[`<rect width="${size}" height="${size}" fill="url(#cell-0)"/>`];
  if(material)paths.push(`<rect width="${size}" height="${size}" fill="url(#grain)" style="mix-blend-mode:overlay;opacity:.65;pointer-events:none"/>`);
  const prefix=`zellige-${depth}-${count}-${material?'material':'flat'}-`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="Zellige: estrella y ocho pétalos, autosimilitud finita de ${depth+1} escalas"><defs>${defs.join('')}</defs>${paths.join('')}</svg>`
    .replaceAll('id="',`id="${prefix}`).replaceAll('url(#',`url(#${prefix}`);
}
