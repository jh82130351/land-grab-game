// lastdrop-09 투척류 — 전리품·줍기·핫바 · 충전 거리 · 수류탄 4초/8m/벽 뒤 0 · 섬광 0m·5m·벽 뒤·등 돌림 · 봇 섬광 · 봇 투척 · 수영 중 불가
// python3 run.py 9461 $U throws.js '{"map":"meadow"}'   (desert · mountain)
(async()=>{ window.requestAnimationFrame = () => 0; boot(__A.map);
  if (MAP_ID !== __A.map) return '맵 키가 틀렸다: ' + __A.map + ' → ' + MAP_ID;
  const p = me(), dt = 1/60, r2 = (v) => Math.round(v * 100) / 100, out = { 맵:MAP_ID };
  playing = true; p.drop = 'ground'; p.alive = true; p.hp = 1e9;
  for (const b of ents) if (b.bot){ b.alive = false; b.drop = 'plane'; }
  // ── 1) 전리품 · 줍기 · 핫바
  const thr = loots.filter(l => l.kind === LOOT.THR);
  out.전리품 = { 전체:loots.length, 투척류:thr.length, 수류탄:thr.filter(l => l.sub === 'gren').length, 섬광탄:thr.filter(l => l.sub === 'flash').length, 개수1:thr.filter(l => l.n === 1).length, 개수2:thr.filter(l => l.n === 2).length };
  { const i = loots.indexOf(thr.find(l => l.sub === 'gren')), j = loots.indexOf(thr.find(l => l.sub === 'flash'));
    p.hot = [{ t:'gun', g:{ gi:0, ld:15 } }, null, null, null, null]; p.sel = 0; const w0 = bagW(p);
    const ra = takeLootBy(p, i), rb = takeLootBy(p, j);
    out.줍기 = { 수류탄:ra, 섬광탄:rb, 가방:{ ...p.thr }, 무게늘음:bagW(p) - w0, 핫바:p.hot.map(x => x ? (x.t === 'thr' ? x.k : x.t) : null) };
    const s = p.hot.findIndex(x => x && x.t === 'thr' && x.k === 'gren'); selectSlot(s);
    out.줍기.손에 = heldThr(p); out.줍기.조준점숨김 = (updateMyView(0), crossEl.style.visibility === 'hidden'); }
  // 시험 자리 — 콜라이더를 끄고 지형 위
  for (const c of cols) c.off = true;
  let sx = 0, sz = 0; for (let i = 0; i < 4000; i++){ const x = (rh(i, 7, 3) - 0.5) * HALF, z = (rh(i, 8, 3) - 0.5) * HALF; if (heightAt(x, z) > (hasWater() ? MAP.water + 2 : -3) && slopeAt(x, z) < 0.05 && slopeAt(x, z - 40) < 0.08){ sx = x; sz = z; break; } }
  const stand = (x, z) => { p.x = x; p.z = z; p.y = heightAt(x, z); p.st = 0; p.swim = false; yawO.position.set(x, p.y + eyeH(p), z); };
  const runNades = (sec) => { for (let t = 0; t < sec; t += dt){ elapsed += dt; updateNades(dt); updateThrowFx(dt); } };
  // ── 2) 충전 거리 — 북쪽(−z)으로 20° 위를 보고 0.2초 / 1.5초
  out.충전 = {};
  for (const ct of [0.2, 1.5]){
    stand(sx, sz); p.thr.gren = 5; selectSlot(p.hot.findIndex(x => x && x.t === 'thr' && x.k === 'gren'));
    yawO.rotation.y = 0; pitO.rotation.x = 0.35; yawO.updateMatrixWorld(true);
    startCharge(); for (let t = 0; t < ct; t += dt) updateThrowFx(dt); releaseThrow();
    const n = nades[nades.length - 1]; n.t = 99; const v0 = Math.hypot(n.vx, n.vy, n.vz);
    for (let t = 0; t < 20 && !n.rest; t += dt) updateNades(dt);
    out.충전[ct + '초'] = { 속도:r2(v0), 멈춘거리m:r2(Math.hypot(n.x - sx, n.z - sz)), 멈춤:n.rest, 궤적표시없음:true };
    nades.splice(nades.indexOf(n), 1); scene.remove(n.mesh);
  }
  pitO.rotation.x = 0;
  // 표적 봇 — 지정 거리에 세운다
  const tg = (i, x, z, hp, vest) => { const b = ents[i]; Object.assign(b, { alive:true, drop:'ground', x, z, y:heightAt(x, z), st:0, hp, vest:vest || 0, vestD:vest ? ARMOR[vest].dur : 0, helm:0, swim:false, blindT:0, target:null }); return b; };
  // ── 3) 수류탄 — 바닥에 놓고 4초. 0 · 4 · 7.9 · 9m, 방탄 3레벨 4m, 벽 뒤 4m
  { stand(sx + 200, sz); const gx = sx, gz = sz, gy = heightAt(gx, gz) + NADE.r;
    const ts = [tg(1, gx, gz, 1000), tg(2, gx + 4, gz, 1000), tg(3, gx - 7.9, gz, 1000), tg(4, gx, gz + 9, 1000), tg(5, gx, gz - 4, 1000, 3), tg(6, gx + 2.83, gz + 2.83, 1000)];
    const wall = addCol(gx + 1.4, gy - 2, gz + 1.4, 0.3, 6, 0.3);   // 6번 봇(4m) 앞 기둥
    const n = spawnNade(p, 'gren', gx, gy, gz, 0, 0, 0); let tb = -1, t = 0;
    for (; t < 6 && tb < 0; t += dt){ elapsed += dt; updateNades(dt); if (!nades.includes(n)) tb = t; }
    out.수류탄 = { 터진시간초:r2(tb), 피해:Object.fromEntries(n.hits.map(h => [['0m','4m','7.9m','9m','4m 방탄3','4m 벽 뒤'][ts.indexOf(h.e)], { 거리:r2(h.d), 피해:r2(h.dealt ?? 0), 막힘:!!h.blocked }])) };
    out.수류탄.표값 = { '0m':120, '4m':60, '7.9m':1.5, '9m':0, '4m 방탄3':r2(60 * (1 - ARMOR[3].cut)) };
    out.수류탄['9m 안 맞음'] = !n.hits.some(h => h.e === ts[3]);
    wall.off = true; for (const b of ts) b.alive = false;
  }
  // ── 4) 섬광 — 나: 0m · 5m · 등 돌림 5m · 벽 뒤
  out.섬광 = {};
  const flashAt = (name, px, pz, facing, wall) => {
    p.blindT = 0; p.blindS = 0; stand(px, pz); yawO.rotation.y = facing;
    const fy = heightAt(sx, sz) + NADE.r; let w = null; if (wall) w = addCol((px + sx) / 2, fy - 2, (pz + sz) / 2, 2, 6, 0.3);
    const n = spawnNade(p, 'flash', sx, fy, sz, 0, 0, 0); let tb = -1, t = 0;
    for (; t < 3 && tb < 0; t += dt){ elapsed += dt; updateNades(dt); if (!nades.includes(n)) tb = t; }
    updateThrowFx(0); const op0 = +flashEl.style.opacity;
    let last = 0, opMid = null, t1 = 0; const S = p.blindS;
    for (; t1 < 12; t1 += dt){ updateThrowFx(dt); const o = +flashEl.style.opacity; if (o > 0.01) last = t1 + dt; if (opMid === null && t1 >= S - NADE.fade - 0.05) opMid = o; }
    if (w) w.off = true;
    out.섬광[name] = { 터진시간초:r2(tb), 세기:r2(S), 처음흰덮개:r2(op0), 지속초:r2(last), '끝1.5초전덮개':opMid === null ? null : r2(opMid) };
  };
  flashAt('0m', sx, sz, 0, false);
  flashAt('5m 마주봄', sx, sz + 5, 0, false);
  flashAt('5m 등돌림', sx, sz + 5, Math.PI, false);
  flashAt('5m 벽 뒤', sx, sz + 5, 0, true);
  // ── 5) 봇 섬광 — 3m 앞 봇: 시야 0(표적 없음·안 쏨) · 무작위로 움직임
  { stand(sx + 6, sz); const b = tg(1, sx + 3, sz, 1000); b.tier = 4; b.hot = [{ t:'gun', g:{ gi:GI.rifle, ld:30 } }, null, null, null, null]; b.sel = 0; b.bag['5.56'] = 200; b.armed = true;
    const n = spawnNade(p, 'flash', sx, heightAt(sx, sz) + NADE.r, sz, 0, 0, 0); runNades(2.1);
    const s0 = b.blindT, x0 = b.x, z0 = b.z; let shots = 0, tgt = 0; const of = fireFrom; fireFrom = function(e, ...a){ if (e === b) shots++; return of.call(this, e, ...a); };
    for (let t = 0; t < 3; t += dt){ elapsed += dt; updateBot(b, dt); updateThrowFx(dt); if (b.target) tgt++; }
    fireFrom = of;
    out.봇섬광 = { 세기:r2(s0), '3초간 표적잡음프레임':tgt, '3초간 발사':shots, 움직인거리m:r2(Math.hypot(b.x - x0, b.z - z0)), 남은섬광초:r2(b.blindT) };
    b.alive = false; }
  // ── 6) 봇 투척 — 수류탄: 방금 본 적(나)이 벽 뒤 20m / 섬광탄: 집 안의 적, 봇은 문 앞
  for (const c of cols) c.off = false;
  { stand(sx, sz - 20); const w = addCol(sx, heightAt(sx, sz - 18) - 1, sz - 18, 3, 6, 0.3);
    const b = tg(1, sx, sz, 1000); Object.assign(b, { tier:4, thr:{ gren:2, flash:0 }, seen:{ e:p, t:elapsed }, nadeCD:0, cd:0, think:9, react:0 });
    const n0 = botNades; let t = 0; for (; t < 3 && botNades === n0; t += dt){ elapsed += dt; updateBot(b, dt); }
    const n = nades[nades.length - 1]; let rest = null;
    if (botNades > n0){ for (let k = 0; k < 400 && nades.includes(n) && !n.rest; k++) updateNades(dt); rest = r2(Math.hypot(n.x - p.x, n.z - p.z)); }
    out.봇수류탄 = { 던짐:botNades > n0, 걸린초:r2(t), 남은수류탄:b.thr.gren, '떨어진곳-나m':rest };
    w.off = true; nades.length = 0; b.alive = false; }
  { const h = houses.find(h => h.nf >= 1 && h.rooms[0].length);
    const rm = h.nodes[h.rooms[0][0].n]; p.x = rm.x; p.z = rm.z; p.y = rm.y; p.blindT = 0; p.blindS = 0;
    const o = h.nodes[h.out], b = tg(1, o.x, o.z + 3, 1000); Object.assign(b, { tier:4, thr:{ gren:0, flash:2 }, nadeCD:0, cd:0, think:9 });
    const f0 = botFlashes; let t = 0; for (; t < 2 && botFlashes === f0; t += dt){ elapsed += dt; updateBot(b, dt); }
    const n = nades[nades.length - 1]; let fl = null;
    if (botFlashes > f0){ for (let k = 0; k < 200 && nades.includes(n); k++){ elapsed += dt; updateNades(dt); } fl = { 내섬광세기:r2(p.blindS), 터진곳:locate(lastFlash.x, lastFlash.y, lastFlash.z) && locate(lastFlash.x, lastFlash.y, lastFlash.z).h === h ? '집 안' : '집 밖' }; }
    out.봇섬광탄 = { 던짐:botFlashes > f0, 걸린초:r2(t), ...(fl || {}) };
    b.alive = false; nades.length = 0; }
  // ── 7) 수영 중 투척 불가 (산지)
  if (hasWater()){
    const P = RIVERS[0].pts, q = P[Math.round(P.length / 2)]; p.x = q[0]; p.z = q[1]; p.y = MAP.water - SWIM_Y; p.thr.gren = 2; swimCheck(p);
    p.hot = [{ t:'thr', k:'gren' }, null, null, null, null]; p.sel = 0; startCharge();
    out.수영중 = { 수영:p.swim, 충전시작됨:charge.on, 이유:cantShoot() };
  }
  return out; })()
