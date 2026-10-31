(async()=>{
  window.__err = []; addEventListener('error', e => __err.push(String(e.message)));
  window.requestAnimationFrame = () => 0; MANSION_SKIP = __A.skip || 0; boot(__A.map); renderer.render = () => {};
  start(); playing = true; matchState = 'live';
  const P = me(), bots = ents.filter(e => e.bot);
  for (const e of bots){ e.drop='ground'; e.x = 470; e.z = 470; e.y = -500; e.alive = false; }
  P.drop = 'ground'; P.alive = true; P.hp = 1e9;
  const rel = (h, e) => [+(e.x - h.x).toFixed(2), +(e.y - h.g).toFixed(2), +(e.z - h.z).toFixed(2)];
  const topNode = (h) => h.nodes[h.rooms[h.rooms.length - 1][0].n];
  // 나 — W(+Shift) 만 누르고 방향은 경로 쪽으로. off = 계단 노드를 줄 가운데에서 비껴 겨냥 (사람 손 흉내)
  const walkMe = (h, tx, ty, tz, run, off, lim) => {
    const pts = pathTo(P, tx, ty, tz).map(q => q.tight ? { ...q, z:q.z + off, x:q.x + (Math.abs(q.y - h.g - 0.15) % FLOOR_H > 1 ? off : 0) } : q);
    keys.KeyW = true; keys.ShiftLeft = run; P.st = 0; P.healT = 0;
    let f = 0, stall = 0, lx = P.x, lz = P.z;
    for (; f < lim; f++){
      while (pts.length > 1 && Math.hypot(pts[0].x - P.x, pts[0].z - P.z) < (pts[0].tight ? 0.25 : 0.5) && (pts[0].y === undefined || Math.abs(pts[0].y - P.y) < 1.5)) pts.shift();
      const q = pts[0]; yawO.rotation.y = Math.atan2(-(q.x - P.x), -(q.z - P.z));
      movePlayer(0.05);
      if (Math.hypot(P.x - lx, P.z - lz) < 0.01) stall++; else stall = 0; lx = P.x; lz = P.z;
      if (stall > 40) break;                                 // 2초 동안 못 움직임
      if (pts.length === 1 && Math.hypot(q.x - P.x, q.z - P.z) < 0.5 && Math.abs(ty - P.y) < 0.6) break;
    }
    keys.KeyW = false; keys.ShiftLeft = false;
    const ok = Math.hypot(tx - P.x, tz - P.z) < 0.6 && Math.abs(ty - P.y) < 0.6;
    return ok ? null : { at:rel(h, P), left:pts.length };
  };
  const walkBot = (b, h, tx, ty, tz, lim) => {
    b.path = null; let f = 0;
    for (; f < lim; f++){
      botDt = 0.05; const mv = nav(b, 'path', tx, tz, ty);
      const sp = (mv.run ? 7.4 : 4.3) * 0.05; moveEnt(b, mv.mx*sp, mv.mz*sp); b.y = floorAt(b.x, b.z, b.y);
      if (Math.hypot(tx - b.x, tz - b.z) < 0.6 && Math.abs(ty - b.y) < 0.6) return null;
    }
    return { at:rel(h, b), left:b.path ? b.path.pts.length : -1 };
  };
  const res = { 건물:0, 계단건물:0, 나걷기:0, 나뛰기:0, 나비껴서:0, 봇:0, 실패:[] };
  for (const h of houses){
    res.건물++;
    if (!h.flights && !(h.rooms.length > 1)) continue;
    res.계단건물++;
    const t = topNode(h), o = h.nodes[h.out], ox = o.x, oz = o.z + 2, oy = heightAt(ox, oz);
    const tag = (h.mansion ? '저택' : h.nf + '층집') + '@' + Math.round(h.x) + ',' + Math.round(h.z);
    const runs = [['나걷기', false, 0], ['나뛰기', true, 0], ['나비껴서', true, __A.off], ['나비껴서', true, -__A.off], ['나비껴서', false, __A.off], ['나비껴서', false, -__A.off]];
    let mineOK = { 나걷기:true, 나뛰기:true, 나비껴서:true };
    for (const [k, run, off] of runs){
      P.x = ox; P.z = oz; P.y = oy; P.vy = 0; P.onGround = true;
      const up = walkMe(h, t.x, t.y, t.z, run, off, 1200);
      const dn = up ? null : walkMe(h, ox, oy, oz, run, off, 1200);
      if (up || dn){ mineOK[k] = false; if (res.실패.length < 30) res.실패.push({ 건물:tag, 누가:k + (off ? (off > 0 ? '+' : '-') : ''), 방향:up ? '오름' : '내림', ...(up || dn) }); }
    }
    for (const k in mineOK) if (mineOK[k]) res[k]++;
    const b = bots[0]; b.alive = true; b.x = ox; b.z = oz; b.y = oy;
    const bu = walkBot(b, h, t.x, t.y, t.z, 800), bd = bu ? null : walkBot(b, h, ox, oy, oz, 800);
    if (bu || bd){ if (res.실패.length < 30) res.실패.push({ 건물:tag, 누가:'봇', 방향:bu ? '오름' : '내림', ...(bu || bd) }); } else res.봇++;
    b.alive = false; b.x = 470; b.z = 470;
  }
  res.저택 = houses.filter(h => h.mansion).length; res.err = __err;
  return res;
})()
