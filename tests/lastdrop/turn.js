(async()=>{
  window.requestAnimationFrame = () => 0; boot(__A.map); renderer.render = () => {};
  start(); playing = true; matchState = 'live';
  const P = me(); P.drop = 'ground'; P.alive = true; P.hp = 1e9;
  const out = [];
  for (const h of houses.filter(h => h.stair).slice(0, 3)){
    const sx = h.stair.x0, sz = h.stair.z0, L = STAIR.lane, land = STAIR.land, F = h.F(0) + 1.7, ok = [];
    // 참 위 x 를 0.05m 씩 옮기며: 줄 A 쪽(z = zA)에서 줄 B 쪽(z = zB)으로 -z 로 걸어 2초 안에 건너가나
    for (let x = sx + 0.05; x <= sx + land + 0.9; x += 0.05){
      P.x = x; P.y = F; P.z = sz + L * 1.5; P.vy = 0; P.onGround = true;
      if (typeof bodyR === 'function' ? blocked(P.x, P.y, P.z, bodyR(P.x, P.z)) : blocked(P.x, P.y, P.z, BODY_R)) continue;   // 시작 자리부터 막힘
      yawO.rotation.y = 0; keys.KeyW = true;                 // yaw 0 → W 는 -z
      for (let f = 0; f < 40; f++) movePlayer(0.05);
      keys.KeyW = false;
      if (P.z <= sz + L * 0.5 + 0.05 && Math.abs(P.y - F) < 0.7) ok.push(+(x - sx).toFixed(2));
    }
    out.push({ land, lane:L, 통과x:ok.length ? [ok[0], ok[ok.length - 1]] : null, 통과폭m:+(ok.length * 0.05).toFixed(2) });
  }
  return out;
})()
