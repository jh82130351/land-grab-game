(async()=>{ window.requestAnimationFrame = () => 0; MANSION_SKIP = __A.skip || 0; boot('meadow');
  return { m:houses.filter(h => h.mansion).length, n3:houses.filter(h => h.nf === 3).length, all:houses.length, log:PLACE_LOG, stage:MANSION_STAGE, seed:SEED }; })()
