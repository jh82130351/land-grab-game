// lastdrop-10 산지 생성 — 단계별 시간 · 배치 수 · 산 높이 · 강 폭/깊이 · 다리 · 도로 연결 · 경사 분포
// python3 run.py 9461 $U mtgen.js '{"map":"mountain"}'
(async()=>{
  window.__err = []; addEventListener('error', e => __err.push(String(e.message)));
  window.requestAnimationFrame = () => 0;
  const t0 = performance.now(); boot(__A.map); const total = Math.round(performance.now() - t0);
  if (MAP_ID !== 'mountain') return '맵 키가 틀렸다: ' + __A.map + ' → ' + MAP_ID;
  const r1 = (v) => Math.round(v * 10) / 10;
  // 산 — 봉우리(반경 0.3 안 최고점) · 둘레 땅(반경 1.05 의 평균) 대비 높이
  const mtn = MTN.map(m => {
    let pk = -1e9; for (let i = 0; i < 400; i++){ const a = i * 2.4, q = Math.sqrt(i / 400) * m.r * 0.35, h = heightAt(m.x + Math.cos(a)*q, m.z + Math.sin(a)*q); if (h > pk) pk = h; }
    let ring = 0; for (let i = 0; i < 24; i++){ const a = i / 24 * 6.283; ring += heightAt(m.x + Math.cos(a)*m.r*1.05, m.z + Math.sin(a)*m.r*1.05); } ring /= 24;
    return { 종류:m.mid ? '중간' : '작은', 반경:Math.round(m.r), 봉우리:r1(pk), 둘레땅:r1(ring), 솟은높이:r1(pk - ring) };
  });
  // 강 — 본류 단면 (가운데 근처 마디에서 수직으로)
  const sect = (rv, f) => { const i = Math.round(rv.pts.length * f), [ax, az] = rv.pts[i], [bx, bz] = rv.pts[i+1], L = Math.hypot(bx - ax, bz - az), nx = -(bz - az)/L, nz = (bx - ax)/L;
    let wet = 0, swim = 0, deep = 0; for (let t = -120; t <= 120; t += 0.5){ const h = heightAt(ax + nx*t, az + nz*t); if (h < WATER_Y) wet += 0.5; if (WATER_Y - h > SWIM_DEPTH) swim += 0.5; deep = Math.max(deep, WATER_Y - h); }
    return { 수면폭:wet, 헤엄폭:swim, 깊이:r1(deep) }; };
  const rivers = RIVERS.map(rv => ({ 본류:rv.main, 마디:rv.pts.length, 단면:[0.35, 0.5, 0.65].map(f => sect(rv, f)) }));
  const bridges = BRIDGES.map(b => ({ 본류:b.main, 축:b.ax ? 'x' : 'z', 길이:Math.round(b.len), 상판높이:r1(b.y), 경사로끝:b.ends.map(e => [Math.round(e.x), Math.round(e.z), r1(heightAt(e.x, e.z))]) }));
  // 도로 연결 — 끝점끼리 6m 안이면 이어진 것으로, 마을·다리가 한 덩어리인가
  const nodes = [], id = (x, z) => { let i = nodes.findIndex(n => Math.hypot(n[0] - x, n[1] - z) < 6); if (i < 0){ nodes.push([x, z]); i = nodes.length - 1; } return i; };
  const par = []; const f = (i) => par[i] === i ? i : (par[i] = f(par[i]));
  const edges = ROADS.map(r => [id(r.ax, r.az), id(r.bx, r.bz)]); nodes.forEach((_, i) => par[i] = i);
  // 골목·산길은 가운데·중간에서 이어지니 선분 위 점도 본다
  for (const [a, b] of edges) par[f(a)] = f(b);
  nodes.forEach((n, i) => ROADS.forEach((r, k) => { if (segDist(n[0], n[1], r).d < 6) par[f(i)] = f(edges[k][0]); }));
  const comps = new Set(nodes.map((_, i) => f(i)));
  const bridgeComp = new Set(BRIDGES.map(b => f(id(b.x0, b.z0))));
  // 경사 — 섬 땅(수면 위) 표본 2만 개 중 40° 넘는 비율
  let land = 0, steep = 0, maxS = 0;
  for (let i = 0; i < 20000; i++){ const x = (rh(i, 1, 9) * 2 - 1) * HALF * 0.85, z = (rh(i, 2, 9) * 2 - 1) * HALF * 0.85; if (heightAt(x, z) < WATER_Y + 0.5) continue; land++; const sl = slopeAt(x, z); if (sl > SLIDE) steep++; if (sl > maxS) maxS = sl; }
  const kinds = {}; for (const h of houses) kinds[h.nf + '층' + (h.mansion ? '저택' : '')] = (kinds[h.nf + '층' + (h.mansion ? '저택' : '')] || 0) + 1;
  return { 맵:MAP_ID, 만드는시간ms:total, 단계:BOOT_TIMES, 배치:MT_STAT, 건물수:houses.length, 층별:kinds, 계단건물:houses.filter(h => h.flights).length,
    콜라이더:cols.length, 전리품:loots.length, 지프:cars.length, 도로:ROADS.length, 도로덩어리:comps.size, 다리가든덩어리:bridgeComp.size,
    산:mtn, 강:rivers, 다리:bridges, '경사40넘는땅%':r1(steep / land * 100), 최대경사도:r1(Math.atan(maxS) * 180 / Math.PI),
    지형구역:terrainTiles.length, 소품구역:propChunks.length, 놓기거부:PLACE_LOG, err:__err };
})()
