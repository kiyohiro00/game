// 燃焼モデルと物理の机上テスト： node tools/simtest.mjs
import * as THREE from '../lib/three.module.js';
import { Hearth, PIT_R } from '../src/wood.js';
let seed = 12345; const rng = () => (seed = (seed*1664525 + 1013904223) >>> 0) / 4294967296;
const h = new Hearth(rng);
for (let i = 0; i < 12; i++) { const a = i/12*Math.PI*2; h.stones.push({ x: Math.cos(a)*(PIT_R+0.08), y: 0.07, z: Math.sin(a)*(PIT_R+0.08), R: 0.12 }); }
const V = (x,y,z) => new THREE.Vector3(x,y,z);
h.addPiece('tinder', V(0,0.06,0), V(1,0,0));
const run = (sec, cb) => { const dt = 1/60; for (let t = 0; t < sec; t += dt) { h.update(dt); cb && cb(); } };
run(0.5);
for (let i = 0; i < 9; i++) {
  const a = i/9*Math.PI*2 + 0.2, tilt = 0.9;
  const dir = V(-Math.cos(a)*Math.cos(tilt), Math.sin(tilt), -Math.sin(a)*Math.cos(tilt));
  h.addPiece('kindling', V(Math.cos(a)*0.07, 0.16, Math.sin(a)*0.07), dir);
  run(0.4);
}
run(2);
const report = (label) => {
  const lit = h.pieces.filter(p => p.burning).length;
  const tin = h.pieces.find(p => p.kind === 'tinder');
  const maxY = Math.max(...h.pieces.map(p => Math.max(p.p0.y, p.p1.y)));
  const logs = h.pieces.filter(p => p.kind === 'log').map(p => `${p.maxT.toFixed(0)}/${(p.vol.reduce((a,b)=>a+b)/5).toFixed(2)}/${(p.c.reduce((a,b)=>a+b)/5).toFixed(2)}`).join(' ');
  console.log(`${label.padEnd(8)} t=${h.time.toFixed(0).padStart(4)} n=${String(h.pieces.length).padStart(2)} lit=${String(lit).padStart(2)} I=${h.intensity.toFixed(2)} glow=${h.glowPower.toFixed(2)} bed(c=${h.bed.coal.toFixed(2)} T=${h.bed.T.toFixed(0)} E=${h.bed.E.toFixed(2)}) top=${maxY.toFixed(2)} tinder=${tin ? tin.maxT.toFixed(0)+'/'+tin.vol[2].toFixed(2) : '-'} logs[${logs}]`);
};
report('settled');
for (const p of h.pieces) console.log('  ', p.kind, p.p0.toArray().map(v=>v.toFixed(2)).join(','), p.p1.toArray().map(v=>v.toFixed(2)).join(','));
// マッチ
h.match.lit = true; h.match.pos.set(0.03, 0.05, 0.02);
run(3); report('match3s');
h.match.lit = false;
let ev = 0;
for (let k = 0; k < 8; k++) { run(5, () => ev += h.events.filter(e => e.type === 'crackle').length); report('burn'); }
console.log('crackles in 40s', ev);
// 薪を3本
for (let i = 0; i < 3; i++) {
  const a = i/3*Math.PI*2, tilt = 0.5;
  const dir = V(-Math.cos(a)*Math.cos(tilt), Math.sin(tilt), -Math.sin(a)*Math.cos(tilt));
  h.addPiece('log', V(Math.cos(a)*0.12, 0.22, Math.sin(a)*0.12), dir, { w0: 0.12 });
  run(1);
}
report('logs+');
for (let k = 0; k < 26; k++) { run(40); report("fire"); if (k === 14) { h.addPiece("log", V(0.02,0.25,0), V(1,0,0), {w0:0.12}); console.log("  +1 log on embers"); } }
