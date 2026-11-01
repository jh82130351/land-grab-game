// lastdrop-08 봇전 한 판 — 나는 바다 쪽 구석에 숨겨(봇이 못 보고 못 맞힌다) 봇 15기끼리 끝까지. 자기장 시간 ×0.6
// python3 run.py 9461 $U botmatch.js '{"map":"meadow"}'
//   산지(lastdrop-10): '{"map":"mountain","speed":1,"norender":1}' — 자기장 시간 그대로(한 판 12~15분), 그리기는 끄고 프레임 로직 시간만 잰다
(async()=>{ window.requestAnimationFrame = () => 0;
  boot(__A.map || 'meadow'); playing = true;
  if (__A.map && MAP_ID !== __A.map) return '맵 키가 틀렸다: ' + __A.map + ' → ' + MAP_ID;
  const SPD = __A.speed ?? 0.6;
  if (SPD !== 1){ PHASES = PHASES.map(ph => [ph[0] * SPD, ph[1] * SPD, ph[2]]); zone.t = PHASES[0][0]; }
  if (__A.norender) renderer.render = () => {};
  if (__A.tier !== undefined) for (const b of ents) if (b.bot) b.tier = __A.tier;   // 시험용 — 봇 난이도를 하나로
  const p = me(), FPS = 30;
  p.drop = 'ground'; p.x = HALF * 0.97; p.z = HALF * 0.97; p.y = heightAt(p.x, p.z);
  const cs = canSee; canSee = (a, b) => b === p ? false : cs(a, b);
  const oh = hurt; hurt = function(e, ...a){ return e === p ? false : oh.call(this, e, ...a); };
  const pick = {}, fire = {}, kill = {}, held = {};
  const ot = takeItem; takeItem = function(e, it, ...a){ const n0 = it.kind === LOOT.THR ? (it.n || 1) : 0; const r = ot.call(this, e, it, ...a); if (e.bot && it.kind === LOOT.THR) e.thrPick = (e.thrPick || 0) + n0 - (it.n || 0); if (e.bot && r === null && it.kind === LOOT.GUN) pick[GUNS[it.gun].k] = (pick[GUNS[it.gun].k] || 0) + 1; return r; };
  const of = fireFrom; fireFrom = function(e, ...a){ const g = heldDef(e); if (e.bot && g) fire[g.k] = (fire[g.k] || 0) + 1; return of.call(this, e, ...a); };
  const oh2 = hurt; hurt = function(e, d, by, part, gn){ const was = e.alive, r = oh2.call(this, e, d, by, part, gn); if (was && !e.alive && by) { const k = heldDef(by) ? heldDef(by).k : '주먹'; kill[k] = (kill[k] || 0) + 1; } return r; };
  let T = performance.now(), simT = 0, errs = 0, swimF = 0, lt = 0, lmax = 0, nf = 0, slid = 0;
  const bots = ents.filter(e => e.bot), CAP = __A.cap || 500;
  while (simT < CAP && bots.filter(b => b.alive).length > 1){
    T += 1000/FPS; simT += 1/FPS;
    const t0 = performance.now();
    try { frame(T); } catch (e) { if (errs++ < 3) console.error(String(e.stack || e).slice(0, 300)); }
    const ft = performance.now() - t0; lt += ft; nf++; if (ft > lmax) lmax = ft;
    for (const b of bots) if (b.alive && b.swim) swimF++;
    if (((simT * FPS) | 0) % (FPS * 5) === 0) for (const b of bots) if (b.alive && heldDef(b)) held[heldDef(b).k] = (held[heldDef(b).k] || 0) + 1;
  }
  const w = bots.find(b => b.alive);
  for (const b of bots) slid += b.slid || 0;
  return { 맵:MAP_ID, 경기:Math.round(simT) + '초', '경기(분)':Math.round(simT / 6) / 10, 자기장단계:zone.phase,
    프레임로직ms:{ 평균:Math.round(lt / nf * 100) / 100, 최대:Math.round(lmax * 10) / 10 },
    수영봇초:Math.round(swimF / FPS), 다리길:typeof bridgeRoutes !== 'undefined' ? bridgeRoutes : null, 헤엄길:typeof swimRoutes !== 'undefined' ? swimRoutes : null,
    강건너기계획:typeof crossPlans !== 'undefined' ? crossPlans : null, 봇미끄럼m:Math.round(slid),
    봇투척류줍기:ents.filter(b => b.bot).reduce((a, b) => a + (b.thrPick || 0), 0),
    투척:typeof nadeThrows !== 'undefined' ? { 던짐:nadeThrows, 봇수류탄:botNades, 봇섬광탄:botFlashes, 폭발:nadeBooms, 섬광:flashBangs, 섬광시도:botFlashTries } : null, 남은봇:bots.filter(b => b.alive).length, 오류:errs,
    우승:w ? TIERS[w.tier].n + ' · ' + (heldDef(w) ? heldDef(w).k : '맨손') : null,
    봇줍기:pick, 봇발사:fire, 처치:kill, '든총(5초표본)':held }; })()
