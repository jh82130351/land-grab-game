// lastdrop-08 총기 시험 — 총별 연사·탄창·재장전·점사·쌍발·피해·감속·줌·보급·스폰
// python3 run.py 9461 $U guns.js '{"map":"meadow"}'
(async()=>{ window.requestAnimationFrame = () => 0; boot(__A.map || 'meadow');
  playing = true; locked = true; fireQ = -1e9;
  const p = me(), FPS = 120;
  for (const b of ents) if (b.bot) b.dropT = 2;          // 봇은 비행기에 둔다 (끝까지 안 뛴다)
  // 시험 자리 — 북쪽 310m 줄. 지형 언덕이 막지 않게 사격·피해 시험은 그 줄의 가장 높은 땅 + 2m 에 띄운다. 둘레 콜라이더는 끈다 (c.off)
  const spot = { x:0, z:0 }; let Y = -1e9;
  for (let d = -30; d <= 340; d += 2) Y = Math.max(Y, heightAt(spot.x, spot.z - d));
  Y += 2;
  for (const c of cols) if (Math.abs(c.x - spot.x) < 30 && c.z < spot.z + 30 && c.z > spot.z - 340) c.off = true;
  const place = (e, x, z, gnd) => { e.x = x; e.z = z; e.y = gnd ? heightAt(x, z) : Y; e.drop = 'ground'; e.onGround = true; e.vy = 0; e.st = 0; };
  place(p, spot.x, spot.z); yawO.position.set(p.x, p.y + eyeH(p), p.z); yawO.rotation.y = 0; pitO.rotation.x = 0;
  let T = performance.now(), simT = 0;
  const step = (n) => { for (let i = 0; i < n; i++){ T += 1000/FPS; simT += 1/FPS; frame(T); } };
  const log = []; const of = fireFrom;
  fireFrom = function(e, ...a){ if (e === p) log.push(+simT.toFixed(4)); return of.call(this, e, ...a); };
  const equip = (gi) => { p.hot = [null,null,null,null,null]; p.gb = []; p.sel = 0; p.cd = 0; p.reload = 0; p.bn = 0;
    for (const k of AMMO_ORDER) p.bag[k] = 0; p.bag[GUNS[gi].am] = 999; addGun(p, { gi, ld:GUNS[gi].mag }, 0); };
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const out = { 총:{}, 오류:[] };
  // ── 1) 연사 · 탄창 · 재장전 (방아쇠를 계속 누르고)
  for (let gi = 0; gi < GUNS.length; gi++){
    const g = GUNS[gi]; equip(gi); log.length = 0; firing = true;
    let relAt = -1, full = -1, t0 = simT;
    for (let i = 0; i < FPS * 30 && full < 0; i++){
      step(1);
      if (relAt < 0 && p.reload > 0) relAt = simT;
      if (relAt >= 0 && p.reload <= 0) full = simT;   // 재장전 끝 (같은 프레임에 바로 다음 발을 쏠 수 있어 ld 로는 못 잰다)
    }
    firing = false; step(FPS);
    const sh = log.filter(t => relAt < 0 || t <= relAt + 1e-3), iv = sh.slice(1).map((t, i) => t - sh[i]);
    const row = { 탄창:sh.length, 재장전:relAt >= 0 && full >= 0 ? r3(full - relAt) : null };
    if (g.burst){                                        // 점사 — 안 간격 / 점사 사이
      const inn = iv.filter(v => v < (g.rate + g.bgap) / 2), gap = iv.filter(v => v >= (g.rate + g.bgap) / 2);
      row.점사안 = r3(inn.reduce((a, b) => a + b, 0) / inn.length); row.점사사이 = r3(gap.reduce((a, b) => a + b, 0) / gap.length);
    } else row.연사 = r3(iv.reduce((a, b) => a + b, 0) / iv.length);
    if (g.dbl) row.쌍발_다쏘고자동재장전 = relAt >= 0 && relAt - sh[sh.length - 1] < 2 / FPS;
    out.총[g.k] = row;
  }
  // ── 2) 점사 — 톡 한 번 클릭
  { equip(GI.burst); log.length = 0; firing = true; step(1); firing = false; step(FPS);
    out.점사_클릭1번 = { 발수:log.length, 간격:log.slice(1).map((t, i) => r3(t - log[i])) }; }
  // ── 3) 쌍발 — 클릭 두 번 뒤 재장전 중인가
  { equip(GI.dbl); log.length = 0; firing = true; step(FPS * 0.6); firing = false;
    out.쌍발 = { 발수:log.length, 재장전중:p.reload > 0, 남은탄:heldGun(p).ld }; step(FPS * 3); }
  // ── 4) 피해 — 퍼짐 0 (Math.random 0), 봇 하나를 앞에 세운다
  const tg = ents[1], mr = Math.random;
  const shootAt = (gi, d, yy, hp, helm, vest) => {
    equip(gi); place(tg, p.x, p.z - d); tg.alive = true; tg.hp = hp; tg.helm = helm; tg.helmD = helm ? ARMOR[helm].dur : 0; tg.vest = vest; tg.vestD = vest ? ARMOR[vest].dur : 0;
    place(p, spot.x, spot.z);
    const ex = p.x, ey = p.y + eyeH(p), ez = p.z;
    yawO.position.set(ex, ey, ez); const dy = tg.y + yy - ey, dz = tg.z - ez;
    yawO.rotation.y = 0; pitO.rotation.x = Math.atan2(dy, -dz); kickP = kickY = 0; bloom = 0;
    yawO.updateMatrixWorld(true);
    Math.random = () => 0; const hp0 = tg.hp; myShoot(); Math.random = mr;
    return { 피해:r3(hp0 - tg.hp), 죽음:!tg.alive };
  };
  out.피해 = {};
  for (let gi = 0; gi < GUNS.length; gi++){
    const g = GUNS[gi], d = g.fall ? 5 : 20;
    const r = shootAt(gi, d, 1.15, 1e4, 0, 0), want = g.dmg * g.pel * rangeMul(g, d - 0.31 + 0.0);
    out.피해[g.k] = { 거리:d, 몸통:r.피해, 표값:r3(g.dmg * g.pel * rangeMul(g, d)) };
  }
  // 대물저격 — 헬멧·방탄 3레벨, 머리, 100m · 300m / 비교: 저격
  out.헬멧3_머리 = {};
  for (const [gi, d] of [[GI.amr, 100], [GI.amr, 300], [GI.sniper, 100]]) out.헬멧3_머리[GUNS[gi].k + ' ' + d + 'm'] = shootAt(gi, d, 1.66, 100, 3, 3);
  for (const e of ents) if (e.bot){ e.alive = true; e.drop = 'plane'; e.hp = 100; }
  place(p, spot.x, spot.z);
  // ── 5) 이동 속도 — W 1초 (경기관총 vs 소총)
  const run1 = (gi) => { equip(gi); place(p, spot.x, spot.z, 1); yawO.rotation.y = 0; keys.KeyW = true; const z0 = p.z; step(FPS); keys.KeyW = false; return r3(Math.abs(p.z - z0)); };
  { const a = run1(GI.rifle), b = run1(GI.lmg); out.이동 = { 소총:a, 경기관총:b, 비율:r3(b / a) }; }
  // ── 6) 줌
  out.줌 = {};
  for (const k of ['rifle', 'dmr', 'sniper', 'amr']){ equip(GI[k]); setScope(true); out.줌[k] = { 시야:cam.fov, 조준경:scopeEl.style.display === 'block' }; setScope(false); }
  // ── 7) 보급 상자 — 대물저격총 + .50
  { equip(GI.pistol); for (const k of AMMO_ORDER) p.bag[k] = 0; const m = new THREE.Object3D(); scene.add(m);
    cares.push({ x:p.x + 1, y:p.y, z:p.z, mesh:m, chute:null, fall:false, taken:false }); nearLoot = -1; pickUp();
    out.보급 = { 대물저격총:allGuns(p).some(h => GUNS[h.gi].k === 'amr'), '.50':p.bag['.50'] }; }
  // ── 8) 바닥 스폰 — 총 종류별 개수 · 탄 종류별
  const gn = {}, an = {};
  for (const l of loots){ if (l.kind === LOOT.GUN) gn[GUNS[l.gun].k] = (gn[GUNS[l.gun].k] || 0) + 1; if (l.kind === LOOT.AMMO) an[l.am] = (an[l.am] || 0) + 1; }
  out.스폰 = { 총:gn, 탄:an, 바닥대물저격:gn.amr || 0, '바닥.50':an['.50'] || 0 };
  // ── 9) 모양 — 총마다 부품 수와 크기(길이·높이) 가 다른가
  out.모양 = GUNS.map(g => { const P = gunParts(g); let z0 = 1e9, z1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const [x, y, z, w, h, d] of P){ z0 = Math.min(z0, z - d/2); z1 = Math.max(z1, z + d/2); y0 = Math.min(y0, y - h/2); y1 = Math.max(y1, y + h/2); }
    return g.k + ' ' + P.length + '조각 ' + r3(z1 - z0) + '×' + r3(y1 - y0); });
  out.소리 = GUNS.map(g => g.snd.join('/'));
  out.소리_겹침 = GUNS.length - new Set(GUNS.map(g => g.snd.join())).size;
  return out; })()
