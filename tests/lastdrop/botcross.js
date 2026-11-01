// lastdrop-10 봇 강 건너기 — 다리마다: 다리 앞 150m 에서 건너편 150m 까지 nav 로. 다리가 먼 곳에선 헤엄으로.
// python3 run.py 9461 $U botcross.js '{"map":"mountain"}'
(async()=>{ window.requestAnimationFrame = () => 0; boot(__A.map);
  if (MAP_ID !== 'mountain') return '맵 키가 틀렸다: ' + __A.map + ' → ' + MAP_ID;
  const b = ents[1], dt = 1/30, out = [];
  b.drop = 'ground'; b.alive = true; b.tier = 2;
  const run = (sx, sz, tx, tz, lim) => {
    b.x = sx; b.z = sz; b.y = heightAt(sx, sz); b.out = null; b.swim = false; let swimT = 0, f = 0, lx = sx, lz = sz, still = 0;
    const tr = [];
    for (; f < lim / dt; f++){
      botDt = dt; const ox = b.x, oy = b.y, oz = b.z;
      const mv = nav(b, 'out', tx, tz);
      const sp = b.swim ? SWIM_SPD * dt : 4.3 * dt;
      let mx = mv.mx, mz = mv.mz;                    // updateBot 과 같은 끼임 우회 (botDetour)
      if (b.detourT > 0){ b.detourT -= dt; mx = Math.sin(b.detourA); mz = Math.cos(b.detourA); }
      moveEnt(b, mx * sp, mz * sp);
      const got = Math.hypot(b.x - ox, b.z - oz);
      b.stuckT = got < sp * 0.3 ? (b.stuckT || 0) + dt : 0;
      if (b.stuckT > 0.4){ b.stuckT = 0; botDetour(b, Math.atan2(mx, mz)); }
      botFloor(b, ox, oy, oz); if (!swimCheck(b)) slideStep(b, dt);
      if (b.swim) swimT += dt;
      if (f % 60 === 0) tr.push([Math.round(b.x), Math.round(b.y * 10) / 10, Math.round(b.z), b.out.pts.length]);
      if (Math.hypot(tx - b.x, tz - b.z) < 3) return { 도착:true, 초:Math.round(f * dt), 수영초:Math.round(swimT) };
    }
    return { 도착:false, 남은m:Math.round(Math.hypot(tx - b.x, tz - b.z)), 수영초:Math.round(swimT), 위치:[Math.round(b.x), Math.round(b.y * 10) / 10, Math.round(b.z)], 길:b.out.pts.slice(0, 6).map(q => [Math.round(q.x), Math.round(q.z)]), 자취:tr.slice(-8) };
  };
  BRIDGES.forEach((br, i) => {
    const [e0, e1] = br.ends, ux = (e1.x - e0.x), uz = (e1.z - e0.z), L = Math.hypot(ux, uz);
    const r = run(e0.x - ux / L * 150 + uz / L * 30, e0.z - uz / L * 150 - ux / L * 30, e1.x + ux / L * 150, e1.z + uz / L * 150, 180);
    out.push({ 다리:i, 본류:br.main, 다리길:bridgeRoutes, 헤엄길:swimRoutes, ...r });
  });
  // 헤엄 — 본류에서 다리와 가장 먼 마디, 강 양쪽 120m
  const P = RIVERS[0].pts; let bi = 0, bd = -1;
  P.forEach((p, i) => { if (i + 1 >= P.length || Math.max(Math.abs(p[0]), Math.abs(p[1])) > HALF * 0.75) return; const d = Math.min(...BRIDGES.map(br => Math.hypot(br.cx - p[0], br.cz - p[1]))); if (d > bd){ bd = d; bi = i; } });
  const [ax, az] = P[bi], [bx, bz] = P[bi + 1], L2 = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L2, nz = (bx - ax) / L2;
  const sw0 = swimRoutes;
  out.push({ 헤엄: true, 다리까지m:Math.round(bd), ...run(ax + nx * 120, az + nz * 120, ax - nx * 120, az - nz * 120, 180), 헤엄길늘음:swimRoutes - sw0 });
  return out; })()
