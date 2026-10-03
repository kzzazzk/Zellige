import assert from 'node:assert/strict';
import test from 'node:test';
import { A, S, Q, PERIOD, STAR, RECURSION_SCALE, area, cellPieces, renderPattern, shifted } from '../docs/design/proposals/rosette.mjs';

const EPS=1e-9;
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function clip(subject,polygon) {
  let output=subject;
  const orientation=Math.sign(polygon.reduce((sum,p,i)=>{
    const next=polygon[(i+1)%polygon.length];return sum+p[0]*next[1]-p[1]*next[0];
  },0));
  for(let i=0;i<polygon.length;i++) {
    const a=polygon[i],b=polygon[(i+1)%polygon.length],input=output;output=[];
    if(!input.length)break;
    for(let j=0;j<input.length;j++) {
      const p=input[j],q=input[(j+1)%input.length];
      const dp=orientation*cross(a,b,p),dq=orientation*cross(a,b,q);
      if(dp>=-EPS)output.push(p);
      if((dp>=-EPS)!==(dq>=-EPS)) {
        const t=dp/(dp-dq);output.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);
      }
    }
  }
  return output;
}
function partition(scale=1) {
  const bound=A*scale,box=[[-bound,-bound],[bound,-bound],[bound,bound],[-bound,bound]],triangles=[];
  for(let row=-1;row<=1;row++)for(let col=-1;col<=1;col++) {
    for(const {kind,points} of cellPieces()) {
      // The star is star-shaped around the origin. All other pieces are convex.
      const center=kind==='star'?[0,0]:points[0];
      for(let i=kind==='star'?0:1;i<(kind==='star'?points.length:points.length-1);i++) {
        const triangle=[center,points[i],points[(i+1)%points.length]];
        const clipped=clip(shifted(triangle,col*PERIOD*scale,row*PERIOD*scale,scale),box);
        if(area(clipped)>EPS)triangles.push(clipped);
      }
    }
  }
  return triangles;
}

test('the original eight-point star and connector diamond proportions are preserved',()=>{
  const pieces=cellPieces();
  assert.equal(pieces.length,12);
  assert.deepEqual(pieces.find(p=>p.kind==='star').points,STAR);
  assert.equal(pieces.filter(p=>p.kind==='ivory').length,8);
  assert.ok(Math.abs(area(STAR)-8*(2-Q))<EPS);
  assert.ok(Math.abs(area(pieces.find(p=>p.kind==='teal').points)-2)<EPS);
  assert.ok(Math.abs(area(pieces.find(p=>p.kind==='corner').points)-2)<EPS);
});

for(const scale of [1,RECURSION_SCALE,RECURSION_SCALE**2]) {
  test(`periodic pieces cover the whole cell without positive-area overlap at scale ${scale}`,()=>{
    const triangles=partition(scale);
    assert.ok(Math.abs(triangles.reduce((sum,p)=>sum+area(p),0)-(PERIOD*scale)**2)<EPS);
    for(let i=0;i<triangles.length;i++)for(let j=i+1;j<triangles.length;j++) {
      assert.ok(area(clip(triangles[i],triangles[j]))<EPS,`overlap between triangles ${i}, ${j}`);
    }
  });
}

test('opposite cell boundaries have the same vertices and subdivision intervals',()=>{
  const points=partition().flat();
  const boundary=(axis,sign)=>[...new Set(points.filter(p=>Math.abs(p[axis]-sign*A)<EPS).map(p=>p[1-axis].toFixed(8)))].sort();
  assert.deepEqual(boundary(0,-1),boundary(0,1));
  assert.deepEqual(boundary(1,-1),boundary(1,1));
});

test('recursive child cells fit exactly inside the unchanged corner boundary',()=>{
  assert.ok(RECURSION_SCALE>0&&RECURSION_SCALE<1);
  assert.ok(Math.abs(A*RECURSION_SCALE-S)<EPS);
  assert.ok(Math.abs(PERIOD**2*RECURSION_SCALE**2-4*S*S)<EPS);
});

test('finite depth and shared definitions bound exported SVG size independently of repeat count',()=>{
  for(const depth of [0,1,2]) {
    const svg=renderPattern({depth,count:8});
    assert.ok(Buffer.byteLength(svg)<25000);
    assert.equal([...svg.matchAll(/<pattern id="[^\"]*cell-/g)].length,depth+1);
  }
  assert.throws(()=>renderPattern({depth:3}),RangeError);
  assert.throws(()=>renderPattern({depth:-1}),RangeError);
  assert.throws(()=>renderPattern({count:99}),RangeError);
});

test('comparison variants do not share SVG resource identifiers',()=>{
  const ids=depth=>[...renderPattern({depth}).matchAll(/\bid="([^\"]+)"/g)].map(m=>m[1]);
  assert.ok(ids(0).every(id=>!ids(1).includes(id)));
});
