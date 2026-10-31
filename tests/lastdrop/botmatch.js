// lastdrop-08 봇전 한 판 — 나는 바다 쪽 구석에 숨겨(봇이 못 보고 못 맞힌다) 봇 15기끼리 끝까지. 자기장 시간 ×0.6
// python3 run.py 9461 $U botmatch.js '{"map":"meadow"}'
(async()=>{ window.requestAnimationFrame = () => 0;
  for (const ph of PHASES){ ph[0] *= 0.6; ph[1] *= 0.6; }
  boot(__A.map || 'meadow'); playing = true;
  const p = me(), FPS = 30;
  p.drop = 'ground'; p.x = HALF * 0.97; p.z = HALF * 0.97; p.y = heightAt(p.x, p.z);
  const cs = canSee; canSee = (a, b) => b === p ? false : cs(a, b);
  const oh = hurt; hurt = function(e, ...a){ return e === p ? false : oh.call(this, e, ...a); };
  const pick = {}, fire = {}, kill = {}, held = {};
  const ot = takeItem; takeItem = function(e, it, ...a){ const r = ot.call(this, e, it, ...a); if (e.bot && r === null && it.kind === LOOT.GUN) pick[GUNS[it.gun].k] = (pick[GUNS[it.gun].k] || 0) + 1; return r; };
  const of = fireFrom; fireFrom = function(e, ...a){ const g = heldDef(e); if (e.bot && g) fire[g.k] = (fire[g.k] || 0) + 1; return of.call(this, e, ...a); };
  const oh2 = hurt; hurt = function(e, d, by, part, gn){ const was = e.alive, r = oh2.call(this, e, d, by, part, gn); if (was && !e.alive && by) { const k = heldDef(by) ? heldDef(by).k : '주먹'; kill[k] = (kill[k] || 0) + 1; } return r; };
  let T = performance.now(), simT = 0, errs = 0;
  const bots = ents.filter(e => e.bot);
  while (simT < 500 && bots.filter(b => b.alive).length > 1){
    T += 1000/FPS; simT += 1/FPS;
    try { frame(T); } catch (e) { if (errs++ < 3) console.error(String(e.stack || e).slice(0, 300)); }
    if (((simT * FPS) | 0) % (FPS * 5) === 0) for (const b of bots) if (b.alive && heldDef(b)) held[heldDef(b).k] = (held[heldDef(b).k] || 0) + 1;
  }
  const w = bots.find(b => b.alive);
  return { 맵:MAP_ID, 경기:Math.round(simT) + '초', 남은봇:bots.filter(b => b.alive).length, 오류:errs,
    우승:w ? TIERS[w.tier].n + ' · ' + (heldDef(w) ? heldDef(w).k : '맨손') : null,
    봇줍기:pick, 봇발사:fire, 처치:kill, '든총(5초표본)':held }; })()
