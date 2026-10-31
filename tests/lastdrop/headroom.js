(async()=>{ window.requestAnimationFrame = () => 0; boot(__A.map);
  let n = 0, bad = [];
  for (const h of houses) if (h.stair) for (let k = 0; k < h.flights; k++){
    const sx = h.stair.x0, sz = h.stair.z0, L = STAIR.lane, fb = h.F(k);
    const pts = [];
    for (let i = 0; i < 6; i++){ pts.push([sx + STAIR.land + STAIR.run - STEP_RUN*(i+0.5), fb + RISE*(i+1), sz + L*1.5]); pts.push([sx + STAIR.land + STEP_RUN*(i+0.5), fb + 1.7 + RISE*(i+1), sz + L*0.5]); }
    for (let x = sx + 0.4; x < sx + STAIR.land; x += 0.4) for (const z of [sz + L*0.5, sz + L, sz + L*1.5]) pts.push([x, fb + 1.7, z]);
    for (const [x, y, z] of pts){ n++; const R = STAIR_R; if (eachColNear(x, z, R, c => x > c.x - c.hw - R && x < c.x + c.hw + R && z > c.z - c.hd - R && z < c.z + c.hd + R && c.y0 > y + STEP_UP && c.y0 < y + 1.75)) bad.push([Math.round(h.x), k, +(x-sx).toFixed(2), +(y-fb).toFixed(2), +(z-sz).toFixed(2)]); }
  }
  return { 검사점:n, 머리막힘:bad.length, 예:bad.slice(0,5) }; })()
