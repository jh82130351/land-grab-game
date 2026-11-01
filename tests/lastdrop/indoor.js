// lastdrop-07c 건물 안 끼임 시험 — 계단 있는 건물마다 안에서 무작위 이동·점프 30초 × 6명 (나 3 · 봇 3)
// python3 run.py 9461 $U indoor.js '{"map":"meadow","seed":1,"sec":30}'
//   완전 갇힘(5초 동안 0.5m 도 못 움직였고, 16방향 어느 쪽으로도 1.5m 를 못 걸어 나감) · 벽 속 0.3초 이상 · 아래에서 올라와 상자를 뚫고 위로 나옴(점프 관통) 을 센다
(async()=>{ window.requestAnimationFrame = () => 0; boot(__A.map);
  if (MAP_ID !== __A.map) return '맵 키가 틀렸다: ' + __A.map + ' → ' + MAP_ID;
  const FPS = 60, dt = 1 / FPS, SEC = __A.sec || 30, p = me();
  let s = (__A.seed || 1) * 7919;
  const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  // 벽 속 = 발에서 0.6m(걸어 오르는 높이) 넘게 솟은 상자가 몸(발~머리)에 닿아 있다. 시험이 직접 잰다 (옛 코드에도 같은 잣대)
  // 단 걸침 = 그보다 낮은 단 모서리에 몸 가장자리가 걸친 것 (계단을 오르내리는 보통 상태 — 참고로만 센다)
  const hit = (e, lo) => { const r = bodyR(e.x, e.z), x = e.x, z = e.z, y = e.y;
    return !!eachColNear(x, z, r, (c) => c.y1 > y + lo && c.y0 < y + 1.7 && x > c.x - c.hw - r && x < c.x + c.hw + r && z > c.z - c.hd - r && z < c.z + c.hd + r); };
  const bodyAt = (e) => hit(e, 0.6), edgeAt = (e) => hit(e, 0.05);
  // 관통 — 지난 프레임에 몸이 상자 높이 안(발은 윗면 밑, 머리는 아랫면 위)에 있었는데 이번에 그 윗면 위로 올라섰다 (지난·이번 자리 모두 상자 위)
  const inFp = (c, x, z) => x > c.x - c.hw && x < c.x + c.hw && z > c.z - c.hd && z < c.z + c.hd;
  const pierced = (x, z, ox, oz, y0, y1) => !!eachColNear(x, z, 0, (c) => inFp(c, x, z) && inFp(c, ox, oz)
                                                   && y0 < c.y1 - 0.05 && y0 + 1.7 > c.y0 + 0.05 && y1 >= c.y1 - 0.05);
  // 갇혔을 때 — 8방향 0.12m 걸음이 되나, 몸에 닿는 상자(계단 기준 좌표)
  const diag = (e, h) => {
    const r = [], R0 = bodyR(e.x, e.z), sx = h.stair.x0, sz = h.stair.z0, f2 = (v) => +v.toFixed(2);
    for (let i = 0; i < 8; i++){ const a = i * Math.PI / 4, t = { x:e.x, y:e.y, z:e.z }; r.push(canStep(t, e.x + Math.sin(a) * 0.12, e.z + Math.cos(a) * 0.12) ? 1 : 0); }
    const cs = []; eachColNear(e.x, e.z, 0.8, (c) => { if (e.x > c.x - c.hw - 0.8 && e.x < c.x + c.hw + 0.8 && e.z > c.z - c.hd - 0.8 && e.z < c.z + c.hd + 0.8 && c.y1 > e.y - 0.7 && c.y0 < e.y + 2.3)
      cs.push([f2(c.x - c.hw - sx), f2(c.x + c.hw - sx), f2(c.y0 - h.F(0)), f2(c.y1 - h.F(0)), f2(c.z - c.hd - sz), f2(c.z + c.hd - sz)].join(',')); return false; });
    return 'R' + R0 + ' 방향' + r.join('') + ' fl' + f2(floorAt(e.x, e.z, e.y) - h.F(0)) + ' 상자[' + cs.join(' | ') + ']';
  };
  // 5초 동안 못 움직였을 때 — 16방향으로 1초씩 걸어 보고 하나라도 1.5m 넘게 나가면 갇힌 게 아니다
  const canEscape = (e) => { for (let i = 0; i < 16; i++){ const a = i * Math.PI / 8, t = { x:e.x, y:e.y, z:e.z };
    for (let k = 0; k < 60; k++){ moveEnt(t, Math.sin(a) * 0.07, Math.cos(a) * 0.07); const f = floorAt(t.x, t.z, t.y); if (f <= t.y) t.y = f; }
    if (Math.hypot(t.x - e.x, t.z - e.z) > 1.5) return true; } return false; };
  const out = { 맵:MAP_ID, 건물:0, 명:0, 프레임:0, 완전갇힘:0, 구석멈춤:0, 벽속:0, 관통:0, 단걸침프레임:0, 예:[] };
  const note = (k, h, e, extra) => { if (out.예.length < 12) out.예.push([k, Math.round(h.x), Math.round(h.z), +(e.x - h.stair.x0).toFixed(2), +(e.y - h.F(0)).toFixed(2), +(e.z - h.stair.z0).toFixed(2), extra]); };
  p.drop = 'ground'; p.hp = 1e9;
  for (const h of houses){
    if (!h.stair) continue;
    out.건물++;
    for (let who = 0; who < 6; who++){
      const bot = who >= 3, e = bot ? ents[1] : p;
      // 시작 자리 — 계단 둘레 6m 안, 아무 층, 몸이 안 걸리는 곳
      let ok = false;
      for (let t = 0; t < 200 && !ok; t++){
        const k = (R() * (h.flights + 1)) | 0;
        e.x = h.stair.x0 - 1 + R() * (h.stair.x1 - h.stair.x0 + 6); e.z = h.stair.z0 - 1 + R() * (h.stair.z1 - h.stair.z0 + 6);
        e.y = floorAt(e.x, e.z, h.F(k) + 0.3);
        ok = e.x > h.ix0 + 0.5 && e.x < h.ix1 - 0.5 && e.z > h.iz0 + 0.5 && e.z < h.iz1 - 0.5 && !bodyAt(e);
      }
      if (!ok) continue;
      out.명++;
      e.vy = 0; e.onGround = true; e.st = 0; e.drop = 'ground'; e.alive = true;
      let dir = 0, jumpT = 0, chT = 0, inT = 0, inMax = 0, hist = [], stuck = false, mx = 0, mz = 0;
      for (let f = 0; f < SEC * FPS; f++){
        if ((chT -= dt) <= 0){ chT = 0.4 + R() * 1.2; dir = R() * 6.283; mx = Math.sin(dir); mz = Math.cos(dir);
          for (const k of ['KeyW','KeyA','KeyS','KeyD']) keys[k] = false; keys[['KeyW','KeyA','KeyS','KeyD'][(R() * 4) | 0]] = true; if (R() < 0.3) keys.KeyD = true; }
        const ox = e.x, oy = e.y, oz = e.z;
        if (!bot){
          yawO.rotation.y = dir; keys.Space = R() < 0.03;      // 초당 2번쯤 점프
          movePlayer(dt);
        } else {
          moveEnt(e, mx * 4.3 * dt, mz * 4.3 * dt);
          if (typeof botFloor === 'function') botFloor(e, ox, oy, oz); else e.y = floorAt(e.x, e.z, e.y);
        }
        out.프레임++;
        if (pierced(e.x, e.z, ox, oz, oy, e.y)){ out.관통++; note('관통', h, e, +(e.y - oy).toFixed(2)); }
        if (edgeAt(e)) out.단걸침프레임++;
        if (bodyAt(e)){ inT += dt; if (inT >= 0.3 && inMax < 0.3){ out.벽속++; note('벽속', h, e); } inMax = Math.max(inMax, inT); } else { inT = 0; inMax = 0; }
        hist.push([e.x, e.y, e.z]);
        if (hist.length > 5 * FPS){
          hist.shift();
          if (!stuck){ let far = 0; const a = hist[0]; for (const q of hist) far = Math.max(far, Math.hypot(q[0] - a[0], q[1] - a[1], q[2] - a[2]));
            if (far < 0.5){ stuck = true;
              if (canEscape(e)) out.구석멈춤++;          // 무작위 방향이 계속 벽 쪽이었을 뿐 — 걸어 나갈 길은 있다
              else { out.완전갇힘++; note('갇힘', h, e, (bot ? '봇' : '나') + ' ' + diag(e, h)); } } }
        }
      }
      keys.Space = false;
    }
  }
  for (const k of ['KeyW','KeyA','KeyS','KeyD']) keys[k] = false;
  return out; })()
