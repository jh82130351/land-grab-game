// lastdrop-10 산지 — 나(사람) 시험: 강 본류 헤엄 횡단 · 수영 중 사격/치료 불가 · 머리만 맞음 · 다리 4개 걷기/지프 · 40° 미끄러짐 (사람·봇·차)
// python3 run.py 9461 $U mtplay.js '{"map":"mountain"}'
(async()=>{ window.requestAnimationFrame = () => 0; boot(__A.map);
  if (MAP_ID !== 'mountain') return '맵 키가 틀렸다: ' + __A.map + ' → ' + MAP_ID;
  const p = me(), dt = 1/60, r1 = (v) => Math.round(v * 10) / 10, out = {};
  p.drop = 'ground'; p.alive = true; p.hp = 1e9; playing = true;
  for (const b of ents) if (b.bot){ b.alive = false; b.drop = 'plane'; }
  const face = (tx, tz) => { yawO.rotation.y = Math.atan2(-(tx - p.x), -(tz - p.z)); };
  const put = (x, z) => { p.x = x; p.z = z; p.y = Math.max(heightAt(x, z), floorAt(x, z, heightAt(x, z) + 0.3)); p.vy = 0; p.onGround = true; p.swim = false; p.st = 0; };
  // ── 1) 헤엄 — 다리에서 가장 먼 본류 마디에서 수직으로 120m 씩
  const P = RIVERS[0].pts; let bi = 0, bd = -1;
  P.forEach((q, i) => { if (i + 1 >= P.length || Math.max(Math.abs(q[0]), Math.abs(q[1])) > HALF * 0.75) return; const d = Math.min(...BRIDGES.map(br => Math.hypot(br.cx - q[0], br.cz - q[1]))); if (d > bd){ bd = d; bi = i; } });
  { const [ax, az] = P[bi], [bx, bz] = P[bi + 1], L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L, nz = (bx - ax) / L;
    put(ax + nx * 120, az + nz * 120); const tx = ax - nx * 120, tz = az - nz * 120;
    let t = 0, swimT = 0, minEye = 1e9, shoot = null, healOK = null, scopeOK = null, runSp = 0;
    keys.KeyW = true;
    for (; t < 200 && Math.hypot(tx - p.x, tz - p.z) > 3; t += dt){
      face(tx, tz);
      const x0 = p.x, z0 = p.z;
      keys.ShiftLeft = p.swim;                       // 수영 중 달리기를 눌러 본다
      movePlayer(dt);
      if (p.swim){ swimT += dt; minEye = Math.min(minEye, p.y + eyeH(p) - MAP.water); runSp = Math.max(runSp, Math.hypot(p.x - x0, p.z - z0) / dt);
        if (shoot === null){ equipTest(); shoot = { 이유:cantShoot(), 쏨:myShoot() }; heal('band'); healOK = p.healT > 0; setScope(true); scopeOK = scoped; setScope(false); } }
    }
    keys.KeyW = false; keys.ShiftLeft = false;
    out.헤엄 = { 다리까지m:Math.round(bd), 건넘:Math.hypot(tx - p.x, tz - p.z) <= 3, 전체초:r1(t), 수영초:r1(swimT), 수영속도최대:r1(runSp), '눈-수면m':r1(minEye), 사격:shoot, 치료됨:healOK, 조준됨:scopeOK };
  }
  function equipTest(){ p.hot = [{ t:'gun', g:{ gi:GI.rifle, ld:30 } }, null, null, null, null]; p.sel = 0; p.bag['5.56'] = 60; p.inv.band = 3; p.cd = 0; }
  // ── 2) 머리만 — 헤엄치는 봇을 20m 앞에 두고 몸통·머리를 겨눈다
  { const [ax, az] = P[bi]; const b = ents[1]; b.alive = true; b.drop = 'ground'; b.x = ax; b.z = az; b.y = MAP.water - SWIM_Y; b.swim = true; b.st = 0;
    const ox = ax + 20, oy = MAP.water + 1.5, oz = az;
    const aim = (yy) => { const dx = b.x - ox, dy = b.y + yy - oy, dz = b.z - oz, L = Math.hypot(dx, dy, dz); const h = rayEnts(ox, oy, oz, dx/L, dy/L, dz/L, 100, p); return h ? (h.p.m >= 2 ? '머리' : '몸') : '빗나감'; };
    out.머리만 = { 몸통겨눔:aim(1.15), 다리겨눔:aim(0.5), 머리겨눔:aim(1.68) };
    b.swim = false; out.머리만.물밖이면몸통 = aim(1.15); b.alive = false; }
  // ── 3) 다리 — 사람 걷기 · 지프
  out.다리 = BRIDGES.map((br, i) => {
    const [e0, e1] = br.ends, res = { 다리:i, 본류:br.main, 상판:r1(br.y), 길이:Math.round(br.len), 경사로:[Math.round(e0.len), Math.round(e1.len)] };
    put(e0.x, e0.z); let t = 0, wet = false, minOn = 1e9;
    keys.KeyW = true;
    for (; t < 150 && Math.hypot(e1.x - p.x, e1.z - p.z) > 2; t += dt){ face(e1.x, e1.z); movePlayer(dt); if (p.swim) wet = true; if (deckAt(p.x, p.z) !== null) minOn = Math.min(minOn, p.y - br.y); }
    keys.KeyW = false;
    res.사람 = { 건넘:Math.hypot(e1.x - p.x, e1.z - p.z) <= 2, 초:r1(t), 물에빠짐:wet, '상판위최저(상판기준)':r1(minOn) };
    const c = cars[0]; c.dead = false; c.parked = false; c.x = e0.x; c.z = e0.z; c.y = heightAt(c.x, c.z); c.spd = 0; c.flood = 0;
    c.yaw = Math.atan2(-(e1.x - e0.x), -(e1.z - e0.z)); riding = c;
    t = 0; let cwet = false, cmin = 1e9;
    keys.KeyW = true;
    for (; t < 60 && Math.hypot(e1.x - c.x, e1.z - c.z) > 3 && !c.dead; t += dt){ updateCars(dt); if (c.y < MAP.water - 0.8) cwet = true; if (deckAt(c.x, c.z) !== null) cmin = Math.min(cmin, c.y - br.y); }
    keys.KeyW = false; riding = null;
    res.지프 = { 건넘:Math.hypot(e1.x - c.x, e1.z - c.z) <= 3, 초:r1(t), 파괴:c.dead, 물:cwet, '상판위최저':r1(cmin) };
    return res;
  });
  // 지프 — 강둑에서 물로 몰면 멈춘다
  { const [ax, az] = P[bi], [bx, bz] = P[bi + 1], L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L, nz = (bx - ax) / L;
    const c = cars[1]; c.dead = false; c.parked = false; c.x = ax + nx * 90; c.z = az + nz * 90; c.y = heightAt(c.x, c.z); c.spd = 0; c.yaw = Math.atan2(nx, nz); riding = c;
    keys.KeyW = true; for (let t = 0; t < 20; t += dt) updateCars(dt); keys.KeyW = false; riding = null;
    out.지프물가 = { 멈춘곳땅높이:r1(heightAt(c.x, c.z)), '물까지(수면-땅)':r1(MAP.water - heightAt(c.x, c.z)), 강중심까지m:Math.round(riverDist(c.x, c.z, RIVERS[0])), 파괴:c.dead };
    // 억지로 깊은 물 한가운데 — 1.5초 뒤 침수·파괴
    const c2 = cars[2]; c2.dead = false; c2.parked = false; c2.x = ax; c2.z = az; c2.y = heightAt(ax, az); c2.spd = 0; c2.flood = 0;
    for (let t = 0; t < 3; t += dt) updateCars(dt);
    out.지프깊은물 = { 파괴:c2.dead, 침수:!!c2.flooded };
  }
  // ── 4) 미끄러짐 — 지형 경사 > 43° 인 곳 (콜라이더·물 없는 곳)
  let sp = null;
  for (let i = 0; i < 200000 && !sp; i++){
    const x = (rh(i, 5, 31) * 2 - 1) * HALF * 0.8, z = (rh(i, 6, 31) * 2 - 1) * HALF * 0.8;
    if (heightAt(x, z) < MAP.water + 3 || slopeAt(x, z) < 0.95 || eachColNear(x, z, 3, () => true)) continue;
    const gx = heightAt(x + 1.5, z) - heightAt(x - 1.5, z), gz = heightAt(x, z + 1.5) - heightAt(x, z - 1.5), L = Math.hypot(gx, gz);
    if (slopeAt(x - gx / L * 3, z - gz / L * 3) < 0.9) continue;   // 3m 아래도 가파른 곳 (터 가장자리 같은 짧은 절개면은 빼고)
    sp = { x, z };
  }
  if (sp){
    const gx = heightAt(sp.x + 1.5, sp.z) - heightAt(sp.x - 1.5, sp.z), gz = heightAt(sp.x, sp.z + 1.5) - heightAt(sp.x, sp.z - 1.5), L = Math.hypot(gx, gz);
    put(sp.x, sp.z); const h0 = p.y;
    for (let t = 0; t < 1; t += dt) movePlayer(dt);
    const slide = { 경사:r1(Math.atan(slopeAt(sp.x, sp.z)) * 57.3), '1초뒤내려감m':r1(h0 - p.y), '1초뒤밀림m':r1(Math.hypot(p.x - sp.x, p.z - sp.z)) };
    // 오르막으로 3초 W
    put(sp.x, sp.z); const h1 = p.y; yawO.rotation.y = Math.atan2(-(gx / L), -(gz / L)); keys.KeyW = true;
    let top = h1; for (let t = 0; t < 3; t += dt){ movePlayer(dt); top = Math.max(top, p.y); }
    keys.KeyW = false; slide['오르막3초W_최고오름m'] = r1(top - h1); slide['3초뒤높이차m'] = r1(p.y - h1);
    const b = ents[2]; b.alive = true; b.drop = 'ground'; b.x = sp.x; b.z = sp.z; b.y = heightAt(sp.x, sp.z); b.swim = false;
    for (let t = 0; t < 1; t += dt) slideStep(b, dt);
    slide.봇 = { '1초뒤내려감m':r1(heightAt(sp.x, sp.z) - b.y), 밀림m:r1(Math.hypot(b.x - sp.x, b.z - sp.z)) };
    b.alive = false;
    const c = cars[3]; c.dead = false; c.parked = false; c.x = sp.x; c.z = sp.z; c.y = heightAt(sp.x, sp.z); c.spd = 0; c.slid = 0;
    const cy0 = c.y; for (let t = 0; t < 1; t += dt){ c.parked = false; updateCars(dt); }
    slide.지프 = { '1초뒤내려감m':r1(cy0 - c.y), 밀림m:r1(c.slid) };
    out.미끄러짐 = slide;
  } else out.미끄러짐 = '43° 넘는 빈 땅을 못 찾았다';
  return out; })()
