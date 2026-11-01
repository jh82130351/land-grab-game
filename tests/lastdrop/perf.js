// lastdrop-10 성능 — 섬 만드는 시간 + 자리마다 그리기 시간(60번 평균)·삼각형·드로콜. 헤드리스 크롬은 SwiftShader(소프트웨어) 라 실제 GPU 보다 느리다 — 맵끼리 비교용
// python3 run.py 9461 $U perf.js '{"map":"mountain"}'   (비교: "meadow")
(async()=>{ window.requestAnimationFrame = () => 0;
  const t0 = performance.now(); boot(__A.map); const gen = Math.round(performance.now() - t0);
  if (MAP_ID !== __A.map) return '맵 키가 틀렸다: ' + __A.map + ' → ' + MAP_ID;
  veil.hidden = true;
  const W = 1280, H = 720; renderer.setSize(W, H, false); cam.aspect = W / H; cam.updateProjectionMatrix();
  const views = [];
  const v = (name, x, z, dy, tx, tz, pit) => views.push({ name, x, z, y:Math.max(heightAt(x, z), floorAt(x, z, heightAt(x, z) + 0.5)) + dy, yaw:Math.atan2(-(tx - x), -(tz - z)), pit:pit ?? -0.05 });
  const h0 = houses.find(h => h.mansion) || houses[0];
  v('마을/저택 앞', h0.x + 30, h0.z + 40, 1.68, h0.x, h0.z);
  v('섬 가운데', 0, 0, 1.68, 100, 100);
  if (MAP_ID === 'mountain'){
    const m = MTN.slice().sort((a, b) => b.h - a.h)[0];
    v('가장 높은 산 꼭대기 → 섬 가운데', m.x, m.z, 1.68, 0, 0, -0.12);
    const b = BRIDGES[0]; v('다리 위', b.cx, b.cz, 1.68, b.ends[1].x, b.ends[1].z);
    v('비행기 높이', 0, 0, 300, 400, 400, -0.6);
  } else v('비행기 높이', 0, 0, 300, 200, 200, -0.6);
  const out = { 맵:MAP_ID, 만드는시간ms:gen, 단계:BOOT_TIMES, 자리:[] };
  for (const w of views){
    me().x = w.x; me().z = w.z; me().y = w.y - 1.68;
    yawO.position.set(w.x, w.y, w.z); yawO.rotation.y = w.yaw; pitO.rotation.x = w.pit;
    skyMesh.position.set(w.x, 0, w.z);
    if (propChunks.length) for (const m of propChunks){ const bs = m.geometry.boundingSphere; m.visible = Math.hypot(bs.center.x - w.x, bs.center.z - w.z) - bs.radius < MAP.propFar; }
    renderer.render(scene, cam); renderer.render(scene, cam);     // 첫 그리기(셰이더 컴파일) 빼고
    const t = performance.now(); for (let i = 0; i < 60; i++) renderer.render(scene, cam);
    renderer.getContext().finish();
    out.자리.push({ 자리:w.name, 그리기ms:Math.round((performance.now() - t) / 60 * 10) / 10, 삼각형:renderer.info.render.triangles, 드로콜:renderer.info.render.calls });
  }
  return out; })()
