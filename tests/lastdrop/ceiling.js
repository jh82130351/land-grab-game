// lastdrop-07c 머리 충돌 시험 — 빈 들판에 머리 위 0.3m 판(두께 0.32)을 놓고 그 밑에서 점프. 머리가 판에 안 들어가고 판 위에 안 올라서야 한다.
// 판 높이를 0.1~1.0m 로 바꿔 가며, 판 위로 올라가는 계단 한 단(0.5m) 옆에서도 본다.
// python3 run.py 9461 $U ceiling.js '{"map":"meadow"}'
(async()=>{ window.requestAnimationFrame = () => 0; boot(__A.map);
  if (MAP_ID !== __A.map) return '맵 키가 틀렸다: ' + __A.map + ' → ' + MAP_ID;
  const p = me(), dt = 1 / 60;
  p.drop = 'ground'; p.hp = 1e9;
  let x0 = 0, z0 = 0;                                     // 콜라이더 없는 평평한 땅
  for (let i = 0; i < 5000; i++){ const x = (rh(i, 3, 5) - 0.5) * 600, z = (rh(i, 4, 5) - 0.5) * 600;
    if (heightAt(x, z) > 1 && !eachColNear(x, z, 4, () => true) && Math.abs(heightAt(x + 2, z) - heightAt(x - 2, z)) < 0.1){ x0 = x; z0 = z; break; } }
  const g = heightAt(x0, z0), out = [];
  for (const gap of [0.1, 0.3, 0.6, 1.0]){
    const c = addCol(x0, g + 1.7 + gap, z0, 1.5, 0.32, 1.5);
    p.x = x0; p.z = z0; p.y = g; p.vy = 0; p.onGround = true; p.st = 0;
    let maxHead = 0, over = 0, inside = 0;
    keys.Space = true; movePlayer(dt); keys.Space = false;
    for (let f = 0; f < 120; f++){ movePlayer(dt); maxHead = Math.max(maxHead, p.y + 1.7 - g);
      if (p.y + 1.7 > c.y0 + 0.01 && p.y < c.y1) inside++; if (p.y >= c.y1 - 0.05) over++; }
    out.push({ 판아래면:+(1.7 + gap).toFixed(2), 최고머리:+maxHead.toFixed(3), 판속프레임:inside, 판위프레임:over, 끝발높이:+(p.y - g).toFixed(3) });
    c.off = true;
  }
  return out; })()
