// lastdrop-08 봇 총 시험 — 봇(어려움) 하나에 총을 쥐여 나(무적)와 싸우게 하고, 발사 묶음·싸우는 거리를 잰다
// python3 run.py 9461 $U botguns.js '{"map":"desert","guns":["burst","dbl","lmg","dmr","mpist","revolver","akr"]}'
(async()=>{ window.requestAnimationFrame = () => 0; boot(__A.map || 'desert');
  playing = true; fireQ = -1e9;
  const p = me(), FPS = 60, r2 = (v) => Math.round(v * 100) / 100;
  for (const b of ents) if (b.bot) b.dropT = 2;
  for (const c of cols) c.off = true;                     // 건물·바위는 끈다 — 지형만 남긴다
  // 낮고 평평한 자리 — 둘레 70m 높이 차 1.5m 이하
  let spot = null;
  for (let i = 0; i < 20000 && !spot; i++){
    const x = (rh(i, 1, 91) - 0.5) * HALF * 1.2, z = (rh(i, 2, 91) - 0.5) * HALF * 1.2, y = heightAt(x, z);
    if (y < 1) continue;
    let ok = true; for (let a = 0; a < 6.28 && ok; a += 0.5) for (let r = 10; r <= 70 && ok; r += 10) if (Math.abs(heightAt(x + Math.cos(a)*r, z + Math.sin(a)*r) - y) > 1.5) ok = false;
    if (ok) spot = { x, z };
  }
  if (!spot) return '자리를 못 찾았다';
  const oh = hurt; hurt = function(e, ...a){ return e === p ? false : oh.call(this, e, ...a); };   // 나는 무적
  const shots = []; const of = fireFrom; let simT = 0;
  fireFrom = function(e, ...a){ if (e.bot) shots.push([simT, e.id]); return of.call(this, e, ...a); };
  let T = performance.now();
  const step = (n) => { for (let i = 0; i < n; i++){ T += 1000/FPS; simT += 1/FPS; frame(T); } };
  const out = {};
  for (const k of __A.guns || ['burst','dbl','lmg','dmr']){
    const gi = GI[k], g = GUNS[gi], b = ents[1];
    p.x = spot.x; p.z = spot.z; p.y = heightAt(p.x, p.z); p.drop = 'ground'; p.alive = true; p.hp = 100;
    Object.assign(b, { alive:true, hp:1e6, drop:'ground', tier:4, st:0, x:spot.x + 45, z:spot.z, target:null, think:0, react:0, cd:0, reload:0, bn:0, burst:0,
      hot:[{ t:'gun', g:{ gi, ld:g.mag } }, null, null, null, null], sel:0, gb:[], armed:false, hg:null, hgHold:null, coverT:0, fleeCD:0, detourT:0 });
    for (const a of AMMO_ORDER) b.bag[a] = 0; b.bag[g.am] = 400; b.y = heightAt(b.x, b.z); b.mesh.visible = true;
    shots.length = 0; const ds = [], t0 = simT;
    for (let i = 0; i < FPS * 16; i++){ step(1); if (simT - t0 > 8) ds.push(Math.hypot(b.x - p.x, b.z - p.z)); }
    const ts = shots.filter(s => s[1] === b.id).map(s => s[0]);
    // 묶음 — 0.2초 넘게 쉬면 새 묶음 (점사 안 간격 0.07 · 쌍발 0.25 는 따로 본다)
    const cut = g.dbl ? 0.4 : 0.2, grp = []; let n = 0;
    ts.forEach((t, i) => { if (i && t - ts[i-1] > cut){ grp.push(n); n = 0; } n++; }); if (n) grp.push(n);
    const iv = ts.slice(1).map((t, i) => t - ts[i]);
    const inn = iv.filter(v => v <= cut);
    out[k] = { 발:ts.length, 묶음크기:grp.slice(0, 12).join(','), 묶음안간격:inn.length ? r2(inn.reduce((a, c) => a + c, 0) / inn.length * 1000) / 1000 : null,
      싸운거리:ds.length ? r2(ds.reduce((a, c) => a + c, 0) / ds.length) : null, 든총:heldDef(b) ? heldDef(b).k : null, 손모델:!!(b.gunM && b.gunM.visible && b.hgi === gi) };
    b.alive = false; b.mesh.visible = false; b.drop = 'plane';
  }
  return out; })()
