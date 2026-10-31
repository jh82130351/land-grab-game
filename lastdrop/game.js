'use strict';
/* 라스트 드롭 — 600m 섬 배틀로얄 한 판.
   텍스처 이미지 없음(형태와 색만). 소리는 전부 WebAudio 합성음. */

// ══ 설정 ══════════════════════════════════════════════════════
const HALF = 500;                 // 맵 반경 → 1000×1000m
const N_ENT = 16;                 // 나 + 봇 15
const EYE = 1.68, BODY_R = 0.45;
const WALK = 5.6, RUN = 9.4, GRAV = 24, JUMP = 7.6;

// 자세 — 서기 / 앉기(C) / 엎드리기(Z). 배그처럼 낮출수록 느리고 잘 맞힌다.
const STANCE = [
  { n:'서기',     h:1.00, spd:1.00, spread:1.00 },
  { n:'앉기',     h:0.70, spd:0.58, spread:0.62 },
  { n:'엎드리기', h:0.34, spd:0.22, spread:0.38 },
];
// 방어구 — 레벨별 피해 감소와 내구도
const ARMOR = [null,
  { lv:1, cut:0.25, dur:55 },
  { lv:2, cut:0.36, dur:95 },
  { lv:3, cut:0.47, dur:150 },
];
// 회복 — 배그의 네 가지
const HEALS = {
  band:  { n:'붕대',       t:2.0, hp:12, cap:75 },
  kit:   { n:'구급상자',   t:4.0, hp:45, cap:90 },
  med:   { n:'구급킷',     t:6.0, hp:100, cap:100 },
  drink: { n:'에너지드링크', t:3.0, boost:28 },
};
const HEAL_ORDER = ['band','kit','med','drink'];
// 탄 — 예비탄은 가방에 종류별로 쌓인다. 같은 탄을 쓰는 총(권총·SMG)은 가방 9mm 를 같이 꺼내 쓴다 (lastdrop-04)
//   w 한 발 무게 · pick 전리품 한 개에 든 양
const AMMO = {
  '9mm':  { n:'9mm',      w:0.5,  pick:30 },
  '5.56': { n:'5.56mm',   w:0.5,  pick:30 },
  '12g':  { n:'12게이지', w:1.25, pick:10 },
  '7.62': { n:'7.62mm',   w:0.5,  pick:15 },
};
const AMMO_ORDER = ['9mm','5.56','12g','7.62'];
const HEAL_W = { band:2, kit:10, med:20, drink:4 };   // 회복템 한 개 무게
const BAG_CAP = [150, 200, 250, 300];                 // 가방 없음 · Lv1 · Lv2 · Lv3
// 봇 난이도 — 봇마다 따로 추첨한다. 플레이 중엔 숨기고 킬피드·순위표에만 보인다 (lastdrop-01 문서)
//   react 표적을 잡고 첫 발까지(초) · sp 퍼짐 배수 · sight 시야(m) · rest 연사 뒤 쉼(초)
//   aim 거리 1m 당 조준 오차(m) · move 움직임 단계 · head 머리를 노리는 비율
const TIERS = [
  { n:'아주 쉬움',   p:0.015, react:[2.0,3.0],  sp:8.0, sight:35, rest:[2.5,4.0], aim:0.060, move:0, head:0 },
  { n:'쉬움',        p:0.100, react:[1.4,2.4],  sp:6.0, sight:45, rest:[1.8,3.0], aim:0.045, move:1, head:0 },
  { n:'보통',        p:0.700, react:[1.0,1.9],  sp:4.5, sight:55, rest:[1.3,2.5], aim:0.032, move:2, head:0 },
  { n:'약간 어려움', p:0.120, react:[0.7,1.4],  sp:3.4, sight:65, rest:[1.0,2.0], aim:0.022, move:3, head:0 },
  { n:'어려움',      p:0.060, react:[0.45,0.9], sp:2.4, sight:80, rest:[0.6,1.4], aim:0.014, move:4, head:0 },
  { n:'하드코어',    p:0.005, react:[0.25,0.5], sp:1.6, sight:95, rest:[0.3,0.8], aim:0.008, move:5, head:0.3 },
];
function pickTier(u){
  let a = 0;
  for (let i=0;i<TIERS.length;i++){ a += TIERS[i].p; if (u < a) return i; }
  return 2;
}
const rnd = (r) => r[0] + Math.random()*(r[1]-r[0]);
const tag = (e) => e.bot ? e.name + ' (' + TIERS[e.tier].n + ')' : e.name;
const SEED = (Math.random() * 1e6) | 0;

// 무기 — 수치는 여기 한 곳에만 둔다
const GUNS = [
  { k:'pistol', n:'권총',  dmg:22, rate:0.26, mag:15, reload:1.5, kick:0.9, range:55,  spread:0.011, pel:1, auto:0, len:0.26, col:0x6b7078, eff:80, fly:600, lo:0.5, am:'9mm' },
  { k:'smg',    n:'SMG',   dmg:15, rate:0.075,mag:30, reload:1.9, kick:1.2, range:45,  spread:0.024, pel:1, auto:1, len:0.40, col:0x55606a, eff:70, fly:600, lo:0.5, am:'9mm' },
  { k:'rifle',  n:'소총',  dmg:29, rate:0.12, mag:30, reload:2.3, kick:1.6, range:130, spread:0.012, pel:1, auto:1, len:0.62, col:0x4a5a4a, eff:250, fly:600, lo:0.65, am:'5.56' },
  { k:'shot',   n:'샷건',  dmg:13, rate:0.85, mag:5,  reload:2.7, kick:3.0, range:18,  spread:0.060, pel:8, auto:0, len:0.58, col:0x6a523a, fall:1, eff:25, fly:40, lo:0, am:'12g' },
  { k:'sniper', n:'저격',  dmg:92, rate:1.45, mag:5,  reload:3.0, kick:4.0, range:320, spread:0.002, pel:1, auto:0, len:0.84, col:0x3f4a3f, scope:1, eff:600, fly:600, lo:0.8, am:'7.62' },
];
const PARTS = [                   // 맞은 자리 배율
  { y0:1.52, y1:1.80, r:0.17, m:2.0,  t:'헤드샷' },
  { y0:0.88, y1:1.52, r:0.31, m:1.0,  t:'' },
  { y0:0.00, y1:0.88, r:0.29, m:0.75, t:'' },
];
// 자기장 — [대기(초), 수축(초), 다음 반경]
// 맵이 1km 로 커졌으니 단계를 늘린다. 합 288초.
const PHASES = [[34,26,310],[28,22,200],[24,20,125],[20,16,70],[16,12,30],[14,22,6]];
const ZONE_DPS = [1.0, 1.8, 3.2, 5.5, 9, 14];
// 레드존 — 1분쯤마다 어딘가를 15초 폭격한다
const RED_EVERY = 62, RED_LEN = 15, RED_R = 85;
// 보급 상자 — 경기 중 두 번 투하
const CARE_AT = [95, 205];

// ══ 난수·노이즈 ═══════════════════════════════════════════════
function rh(x, y, s){
  let n = Math.imul(x|0, 374761393) ^ Math.imul(y|0, 668265263) ^ Math.imul(s|0, 1013904223);
  n = Math.imul(n ^ (n>>>15), 2246822519);
  n = Math.imul(n ^ (n>>>13), 3266489917);
  return ((n ^ (n>>>16)) >>> 0) / 4294967296;
}
const sm = t => t*t*(3-2*t);
function n2(x, z, s){
  const xi = Math.floor(x), zi = Math.floor(z), u = sm(x-xi), v = sm(z-zi);
  const a = rh(xi,zi,s), b = rh(xi+1,zi,s), c = rh(xi,zi+1,s), d = rh(xi+1,zi+1,s);
  return (a+(b-a)*u)*(1-v) + (c+(d-c)*u)*v;
}
function fbm(x, z, s, o){
  let f=1, a=1, t=0, nn=0;
  for (let i=0;i<o;i++){ t += n2(x*f, z*f, s+i*131)*a; nn+=a; f*=2; a*=0.5; }
  return t/nn;
}
// 지형 높이 — 넓은 기복 + 둔덕 + 잔굴곡. 시야를 끊는 산은 안 만든다.
function heightAt(x, z){
  const e = Math.max(Math.abs(x), Math.abs(z)) / HALF;
  const edge = e > 0.86 ? (e - 0.86) / 0.14 : 0;          // 가장자리는 바다로 떨어진다
  let h = fbm(x/230, z/230, SEED+11, 3) * 22
        + fbm(x/70,  z/70,  SEED+37, 3) * 7
        + fbm(x/22,  z/22,  SEED+73, 2) * 1.6 - 14;
  return h - edge * edge * 34;
}

// ══ 장면 ══════════════════════════════════════════════════════
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
const scene = new THREE.Scene();
const SKY_LO = new THREE.Color(0xc98b4a), SKY_HI = new THREE.Color(0x1d2b42);
scene.fog = new THREE.Fog(0xa8794a, 90, 470);
scene.background = SKY_HI.clone();

const cam = new THREE.PerspectiveCamera(74, 1, 0.1, 1400);
const yawO = new THREE.Object3D(), pitO = new THREE.Object3D();
yawO.add(pitO); pitO.add(cam); scene.add(yawO);

scene.add(new THREE.HemisphereLight(0xcfd8e8, 0x3a3326, 0.75));
const sun = new THREE.DirectionalLight(0xffd0a0, 1.25);
sun.position.set(-180, 150, 120);
scene.add(sun);
scene.add(sun.target);   // 타깃도 씬에 넣어야 방향이 먹는다

// 해질녘 하늘 — 큰 구 안쪽에 그라데이션
{
  const g = new THREE.SphereGeometry(1100, 24, 16);
  const col = [];
  const p = g.attributes.position, c = new THREE.Color();
  for (let i=0;i<p.count;i++){
    const t = Math.max(0, Math.min(1, (p.getY(i)/1100) * 1.6 + 0.3));
    c.copy(SKY_LO).lerp(SKY_HI, t);
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors:true, side:THREE.BackSide, fog:false })));
}

// ══ 지형 ══════════════════════════════════════════════════════
const GN = 150;
let terrain = null;
function buildTerrain(){
  const g = new THREE.PlaneGeometry(HALF*2, HALF*2, GN, GN);
  g.rotateX(-Math.PI/2);
  const p = g.attributes.position, col = [];
  const GR=[0.30,0.42,0.22], DRY=[0.46,0.44,0.26], RK=[0.40,0.40,0.38], SD=[0.62,0.56,0.38];
  for (let i=0;i<p.count;i++){
    const x = p.getX(i), z = p.getZ(i);
    const h = heightAt(x, z);
    p.setY(i, h);
    const d = Math.max(Math.abs(x), Math.abs(z));
    let c = h < -6 ? SD : (h > 9 ? RK : (rh((x*3)|0,(z*3)|0,SEED+5) > 0.62 ? DRY : GR));
    if (d > HALF*0.9) c = SD;
    const j = (rh((x*2)|0,(z*2)|0,SEED+9) - 0.5) * 0.07;
    col.push(c[0]+j, c[1]+j, c[2]+j);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  terrain = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors:true, roughness:1, flatShading:true }));
  scene.add(terrain);
  // 바다
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400),
    new THREE.MeshStandardMaterial({ color:0x2b4a5e, roughness:0.35, transparent:true, opacity:0.92 }));
  sea.rotation.x = -Math.PI/2; sea.position.y = -9;
  scene.add(sea);
}

// ══ 콜라이더 (축 정렬 상자) ═══════════════════════════════════
const cols = [];
const addCol = (x, y0, z, hw, h, hd) => cols.push({ x, z, hw, hd, y0, y1:y0+h });
function blocked(x, y, z, r){
  for (const c of cols){
    if (y + 1.7 < c.y0 || y >= c.y1 - 0.05) continue;   // 윗면에 선 사람은 막지 않는다 (지붕 위)
    if (x > c.x - c.hw - r && x < c.x + c.hw + r && z > c.z - c.hd - r && z < c.z + c.hd + r) return c;
  }
  return null;
}

// ══ 건물 · 나무 · 바위 ════════════════════════════════════════
const BOX = new THREE.BoxGeometry(1,1,1);
const CYL = new THREE.CylinderGeometry(1,1,1,7);
const CONE = new THREE.ConeGeometry(1,1,7);
function merge(list){
  let vc=0, ic=0;
  for (const o of list){ vc += o.g.attributes.position.count; ic += o.g.index.count; }
  const pos=new Float32Array(vc*3), nor=new Float32Array(vc*3), col=new Float32Array(vc*3);
  const idx=new Uint32Array(ic);
  let vo=0, io=0;
  const nm=new THREE.Matrix3(), v=new THREE.Vector3(), nv=new THREE.Vector3(), c=new THREE.Color();
  for (const o of list){
    const pa=o.g.attributes.position, na=o.g.attributes.normal, gi=o.g.index;
    nm.getNormalMatrix(o.m); c.set(o.c);
    for (let i=0;i<pa.count;i++){
      v.fromBufferAttribute(pa,i).applyMatrix4(o.m);
      pos[(vo+i)*3]=v.x; pos[(vo+i)*3+1]=v.y; pos[(vo+i)*3+2]=v.z;
      nv.fromBufferAttribute(na,i).applyMatrix3(nm).normalize();
      nor[(vo+i)*3]=nv.x; nor[(vo+i)*3+1]=nv.y; nor[(vo+i)*3+2]=nv.z;
      col[(vo+i)*3]=c.r; col[(vo+i)*3+1]=c.g; col[(vo+i)*3+2]=c.b;
    }
    for (let i=0;i<gi.count;i++) idx[io+i]=gi.getX(i)+vo;
    vo+=pa.count; io+=gi.count;
  }
  const out=new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos,3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor,3));
  out.setAttribute('color', new THREE.BufferAttribute(col,3));
  out.setIndex(new THREE.BufferAttribute(idx,1));
  out.computeBoundingSphere();
  return out;
}
const SOLID = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.95, flatShading:true });
const houses = [];
function buildProps(){
  const ps = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3();
  const put = (g, x,y,z, sx,sy,sz, c) => {
    m.compose(new THREE.Vector3(x,y,z), q, s3.set(sx,sy,sz));
    ps.push({ g, m: m.clone(), c });
  };
  // ── 건물 22채 (좌표 해시로 고정) ──
  let k = 0;
  const rings = [{r:0,n:1},{r:95,n:5},{r:195,n:8},{r:300,n:10},{r:410,n:10}];
  for (const ring of rings){
    for (let i=0;i<ring.n;i++){
      const a = (i/ring.n)*Math.PI*2 + rh(k,1,SEED)*0.7;
      const rr = ring.r * (0.82 + rh(k,2,SEED)*0.36);
      const x = Math.round(Math.cos(a)*rr), z = Math.round(Math.sin(a)*rr);
      k++;
      if (heightAt(x,z) < -5) continue;
      const w = 9 + Math.round(rh(k,3,SEED)*13), d = 8 + Math.round(rh(k,4,SEED)*10);
      const fl = rh(k,5,SEED) < 0.3 ? 2 : 1;
      const H = 3.4 * fl, base = heightAt(x,z) - 0.3;
      const wall = [0xcac3b2, 0xb9b7ad, 0xc3b49a, 0xaeb5b4][k % 4];
      const roof = [0x7d4f3c, 0x4f5c68, 0x5f6a48, 0x6b4f4f][k % 4];
      put(BOX, x, base + H/2, z - d/2, w, H, 0.4, wall);     // 벽 네 장 (앞은 문을 뚫는다)
      addCol(x, base, z - d/2, w/2, H, 0.2);
      put(BOX, x - w/2, base + H/2, z, 0.4, H, d, wall);
      addCol(x - w/2, base, z, 0.2, H, d/2);
      put(BOX, x + w/2, base + H/2, z, 0.4, H, d, wall);
      addCol(x + w/2, base, z, 0.2, H, d/2);
      const dw = 2.4, side = (w - dw) / 2;
      put(BOX, x - (dw/2 + side/2), base + H/2, z + d/2, side, H, 0.4, wall);
      addCol(x - (dw/2 + side/2), base, z + d/2, side/2, H, 0.2);
      put(BOX, x + (dw/2 + side/2), base + H/2, z + d/2, side, H, 0.4, wall);
      addCol(x + (dw/2 + side/2), base, z + d/2, side/2, H, 0.2);
      put(BOX, x, base + H + 0.22, z, w + 1.2, 0.45, d + 1.2, roof);      // 지붕
      addCol(x, base + H, z, (w+1.2)/2, 0.45, (d+1.2)/2);
      put(BOX, x, base + 0.1, z, w, 0.22, d, 0x9a9484);                   // 바닥
      if (fl === 2) put(BOX, x, base + 3.5, z, w, 0.22, d, 0x9a9484);
      houses.push({ x, z, w, d, base, H });
    }
  }
  // ── 나무 90그루 · 바위 60개 ──
  for (let i=0;i<380;i++){
    const a = rh(i,11,SEED)*Math.PI*2, rr = Math.sqrt(rh(i,12,SEED)) * HALF * 0.93;
    const x = Math.cos(a)*rr, z = Math.sin(a)*rr;
    const y = heightAt(x,z);
    if (y < -4) continue;
    let near = false;
    for (const h of houses) if (Math.abs(x-h.x) < h.w/2+3 && Math.abs(z-h.z) < h.d/2+3) { near = true; break; }
    if (near) continue;
    if (i % 5 < 3){                                   // 나무
      const th = 4.5 + rh(i,13,SEED)*4;
      put(CYL, x, y + th/2, z, 0.26, th, 0.26, 0x4a3726);
      put(CONE, x, y + th + 1.7, z, 2.1 + rh(i,14,SEED), 4.4, 2.1 + rh(i,14,SEED), 0x2f4a2a);
      addCol(x, y, z, 0.34, th, 0.34);
    } else {                                          // 바위
      const rr2 = 0.9 + rh(i,15,SEED)*1.9;
      put(BOX, x, y + rr2*0.42, z, rr2*2, rr2*0.9, rr2*1.7, 0x5b5b55);
      addCol(x, y, z, rr2, rr2*0.9, rr2*0.85);
    }
  }
  scene.add(new THREE.Mesh(merge(ps), SOLID));
}

// ══ 전리품 ════════════════════════════════════════════════════
const LOOT = { GUN:0, AMMO:1, HEAL:2, HELM:3, VEST:4, BAG:5, BOX:6 };
const LOOT_COL = [0xffb03a, 0x9fb4c8, 0x6adf8a, 0xc8a2ff, 0x7fd4ff, 0xd8c27a, 0x8a5a2e];
const LOOT_SPARE = 400;                    // 버린 물건·봇 상자가 들어갈 여유 칸
const loots = [];
let lootMesh = null;
const _m4 = new THREE.Matrix4(), _q0 = new THREE.Quaternion(), _s0 = new THREE.Vector3(1,1,1);
function buildLoot(){
  // 건물 안과 그 둘레에 깐다
  const spots = [];
  for (const h of houses){
    const n = 2 + ((rh(h.x, h.z, SEED+21) * 3) | 0);
    for (let i=0;i<n;i++){
      const x = h.x + (rh(h.x+i, h.z, SEED+22) - 0.5) * (h.w - 2);
      const z = h.z + (rh(h.x, h.z+i, SEED+23) - 0.5) * (h.d - 2);
      spots.push([x, h.base + 0.35, z]);
    }
  }
  for (let i=0;i<70;i++){
    const a = rh(i,31,SEED)*Math.PI*2, rr = Math.sqrt(rh(i,32,SEED))*HALF*0.85;
    const x = Math.cos(a)*rr, z = Math.sin(a)*rr;
    if (heightAt(x,z) < -3) continue;
    spots.push([x, heightAt(x,z) + 0.35, z]);
  }
  spots.forEach((p, i) => {
    const r = rh(i, 41, SEED);
    let it;
    if (r < 0.34){ const gi = (rh(i,42,SEED) * GUNS.length) | 0; it = { kind:LOOT.GUN, gun:gi, ld:GUNS[gi].mag }; }   // 탄창 1개분 장전된 채로
    else if (r < 0.56){                          // 탄은 한 종류만 — 총 스폰 비율대로 (9mm 2/5)
      const am = GUNS[(rh(i,46,SEED) * GUNS.length) | 0].am;
      it = { kind:LOOT.AMMO, am, n:AMMO[am].pick };
    }
    else if (r < 0.78) it = { kind:LOOT.HEAL, sub:(rh(i,43,SEED) * 4) | 0, n:1 };
    else if (r < 0.86) it = { kind:LOOT.HELM, sub:1 + ((rh(i,44,SEED) * 3) | 0) };
    else if (r < 0.94) it = { kind:LOOT.VEST, sub:1 + ((rh(i,45,SEED) * 3) | 0) };
    else it = { kind:LOOT.BAG, sub:1 + ((rh(i,47,SEED) * 3) | 0) };
    loots.push(Object.assign(it, { x:p[0], y:p[1], z:p[2], taken:false }));
  });
  const geo = new THREE.BoxGeometry(0.44, 0.3, 0.7);
  const mat = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.6, emissiveIntensity:0 });
  const cap = loots.length + LOOT_SPARE;
  lootMesh = new THREE.InstancedMesh(geo, mat, cap);
  lootMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap*3), 3);
  for (let i = 0; i < cap; i++){
    if (i < loots.length) showLoot(i); else { _m4.compose(new THREE.Vector3(0, -9999, 0), _q0, _s0); lootMesh.setMatrixAt(i, _m4); }
  }
  lootMesh.instanceMatrix.needsUpdate = true;
  scene.add(lootMesh);
}
const _lc = new THREE.Color();
function showLoot(i){
  const l = loots[i];
  _m4.compose(new THREE.Vector3(l.x, l.y, l.z), _q0, l.kind === LOOT.BOX ? new THREE.Vector3(1.6, 1.6, 1.2) : _s0);
  lootMesh.setMatrixAt(i, _m4);
  lootMesh.setColorAt(i, _lc.set(LOOT_COL[l.kind]));
  lootMesh.instanceMatrix.needsUpdate = true;
  if (lootMesh.instanceColor) lootMesh.instanceColor.needsUpdate = true;
}
// 새 전리품 (버린 물건·봇 상자). 빈 칸이 없으면 이미 주운 칸을 다시 쓴다
function addLoot(it, x, y, z){
  let i = loots.length;
  if (i >= lootMesh.count){ i = loots.findIndex(l => l.taken); if (i < 0) return null; }
  loots[i] = Object.assign(it, { x, y, z, taken:false });
  showLoot(i);
  return loots[i];
}
function hideLoot(i){
  _m4.compose(new THREE.Vector3(0, -9999, 0), _q0, _s0);
  lootMesh.setMatrixAt(i, _m4);
  lootMesh.instanceMatrix.needsUpdate = true;
}

// ══ 엔티티 ════════════════════════════════════════════════════
const ents = [];
const BOT_MAT = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.9, flatShading:true });
let botGeo = null;
function makeBotGeo(){
  const ps = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const put = (y,w,h,d,c) => { m.compose(new THREE.Vector3(0,y+h/2,0), q, s.set(w,h,d)); ps.push({ g:BOX, m:m.clone(), c }); };
  put(0.00, 0.24, 0.88, 0.24, 0x2f3a46);
  put(0.90, 0.60, 0.62, 0.34, 0xb4552f);
  put(1.54, 0.30, 0.26, 0.30, 0xe3c49c);
  put(1.56, 0.34, 0.12, 0.34, 0x2f3a46);
  botGeo = merge(ps);
}
function spawnPoint(i){
  for (let t=0;t<80;t++){
    const a = (i/N_ENT)*Math.PI*2 + rh(i,t,SEED+51)*1.1;
    const rr = 132 + rh(i,t+9,SEED+52) * 148;
    const x = Math.cos(a)*rr, z = Math.sin(a)*rr;
    if (heightAt(x,z) > -2 && !blocked(x, heightAt(x,z), z, 1.2)) return { x, z };
  }
  return { x: 0, z: 140 };
}
function makeEnts(){
  makeBotGeo();
  for (let i=0;i<N_ENT;i++){
    const sp = spawnPoint(i);
    const e = {
      id:i, bot:i>0, name:i?'봇 '+i:'나', hp:100, alive:true,
      x:sp.x, z:sp.z, y:heightAt(sp.x, sp.z), vy:0, onGround:true,
      yaw:rh(i,1,SEED)*6.28, fall:0,
      guns:[null,null,null], slot:0, ammo:[0,0,0],   // 0·1 주무기, 2 권총 — 장전 탄은 총마다 따로
      bag:{ '9mm':0, '5.56':0, '12g':0, '7.62':0 }, bagLv:0,   // 예비탄은 가방에 종류별로
      inv:{ band:2, kit:0, med:0, drink:0 }, healT:0, healKind:null, boost:0,
      helm:0, helmD:0, vest:0, vestD:0, st:0,
      cd:0, reload:0, burst:0, react:0, think:0, tx:0, tz:0, target:null,
      mesh:null, chute:null, kills:0,
      drop:'plane', dropT:0, lx:0, lz:0,
    };
    if (e.bot){                                   // 봇은 총 하나와 적당한 장비를 들고 내린다
      const gi = (rh(i,7,SEED+61) * GUNS.length) | 0;
      e.guns[0] = gi; e.ammo[0] = GUNS[gi].mag;     // 봇은 아직 탄 무한 — 재장전하면 다시 찬다
      const al = rh(i,8,SEED+62);
      if (al > 0.45){ e.helm = al > 0.85 ? 2 : 1; e.helmD = ARMOR[e.helm].dur; }
      if (al > 0.3){ e.vest = al > 0.8 ? 2 : 1; e.vestD = ARMOR[e.vest].dur; }
      e.inv.kit = 1;
      e.tier = pickTier(rh(i,9,SEED+63));
      e.mesh = new THREE.Mesh(botGeo, BOT_MAT);
      scene.add(e.mesh);
    }
    ents.push(e);
  }
}
const me = () => ents[0];

// ══ 비행기와 낙하 ════════════════════════════════════════════
// 배그의 시작. 항로를 가로지르는 수송기에서 Space 로 이탈하고,
// 자유낙하 → 일정 고도에서 산개 → 조종해 내려선다.
const PLANE_Y = 360, PLANE_T = 30, CHUTE_Y = 70;
// 낙하 물리 — 나와 봇이 똑같이 쓴다 (lastdrop-03). 비행기에서 뛰면 약 10초에 땅.
//   자유낙하: 가속 g, 최고 v, 수평 h · W 다이브(더 빨리 떨어지고 앞으로 조금) · S 활강(천천히, 앞으로 멀리)
//   낙하산: 고도 CHUTE_Y 에서 자동, 하강 chuteV, 수평 chuteH
const FALL = { g:42, v:65, h:26, diveV:80, diveH:14, glideV:45, glideH:34, chuteV:14, chuteH:15, slow:30 };
const SEA_Y = -2;                          // 이보다 낮은 땅은 물가 — 착지점으로 안 쓴다
const plane = { ax:0, az:0, bx:0, bz:0, t:0, mesh:null, done:false };
let matchState = 'drop';                 // drop → live → over
function buildPlane(){
  const a = Math.random()*Math.PI*2, d = HALF*0.95;
  plane.ax = Math.cos(a)*d;  plane.az = Math.sin(a)*d;
  plane.bx = -plane.ax;      plane.bz = -plane.az;
  const ps = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  const put = (x,y,z,w,h,dd,c) => { m.compose(new THREE.Vector3(x,y,z), q, sc.set(w,h,dd)); ps.push({ g:BOX, m:m.clone(), c }); };
  put(0,0,0, 4.4, 4.0, 26, 0x9aa3ac);
  put(0,0.4,-2, 26, 0.7, 4.6, 0x8b949d);
  put(0,2.4,10, 0.7, 4.2, 4.0, 0x8b949d);
  put(-5.2,-1.4,-2, 2.2,2.2,4.4, 0x6e767e);
  put( 5.2,-1.4,-2, 2.2,2.2,4.4, 0x6e767e);
  plane.mesh = new THREE.Mesh(merge(ps), SOLID);
  scene.add(plane.mesh);
}
const planePos = (t) => ({
  x: plane.ax + (plane.bx - plane.ax) * t,
  z: plane.az + (plane.bz - plane.az) * t,
});
// 착지점으로 쓸 수 있나 — 육지이고, 벽·지붕·바위 발자국 밖
function landOK(x, z){
  if (Math.abs(x) > HALF-8 || Math.abs(z) > HALF-8 || heightAt(x, z) < SEA_Y) return false;
  for (const c of cols)
    if (x > c.x-c.hw-1 && x < c.x+c.hw+1 && z > c.z-c.hd-1 && z < c.z+c.hd+1 && c.y1 > heightAt(x, z) + 0.3) return false;
  return true;
}
// 집 h 둘레의 빈 땅 (k 로 시도마다 다른 자리)
function spotNear(h, i, k){
  for (let n = 0; n < 24; n++){
    const a = rh(i, 80+n, SEED+k) * 6.283, r = Math.max(h.w, h.d)/2 + 3 + rh(i, 120+n, SEED+k) * 16;
    const x = h.x + Math.cos(a)*r, z = h.z + Math.sin(a)*r;
    if (landOK(x, z)) return { x, z };
  }
  return null;
}
// 봇은 건물 쪽에 내린다 — 거기 전리품이 많다
function pickLanding(i){
  for (let k = 0; k < 6; k++){
    const h = houses[(rh(i, 77+k, SEED+91) * houses.length) | 0];
    const s = h && spotNear(h, i, k*7);
    if (s) return s;
  }
  for (let k = 0; k < 200; k++){
    const x = (rh(i,78+k,SEED)*2-1)*HALF*0.6, z = (rh(i,79+k,SEED)*2-1)*HALF*0.6;
    if (landOK(x, z)) return { x, z };
  }
  return { x:0, z:0 };
}
// 기본 자세(키 안 누름)로 뛰었을 때 수평으로 갈 수 있는 거리
function dropReach(gy){
  let y = PLANE_Y - 3, vy = -6, d = 0;
  const dt = 0.05;
  while (y > gy){
    const chute = y < CHUTE_Y;
    vy = chute ? -FALL.chuteV : Math.max(-FALL.v, vy - FALL.g*dt);
    y += vy*dt; d += (chute ? FALL.chuteH : FALL.h) * dt;
  }
  return d;
}
// 봇마다 착지점과 뛰는 시점을 정한다. 착지점이 멀면 일찍 뛰고, 항로에서 못 닿으면 닿는 건물로 바꾼다
function planDrops(){
  const pathD = (l) => {                        // 항로에서 l 까지 가장 가까운 거리와 그 t
    let bd = 1e9, bt = 0;
    for (let t = 0.02; t <= 0.9; t += 0.005){ const p = planePos(t), d = Math.hypot(p.x-l.x, p.z-l.z); if (d < bd){ bd = d; bt = t; } }
    return { d:bd, t:bt };
  };
  for (const e of ents){
    if (!e.bot) continue;
    const fits = (q) => { const r = dropReach(heightAt(q.x, q.z)) * 0.8, cc = pathD(q); return cc.d <= r ? { l:q, reach:r, c:cc } : null; };
    let f = fits(pickLanding(e.id));
    // 못 닿는다 — 항로에서 가까운 집 둘레에서 닿는 자리를 찾는다 (집 중심이 아니라 고른 자리로 판정)
    if (!f){
      const near = houses.map(h => ({ h, d: pathD(h).d })).sort((a,b) => a.d - b.d).slice(0, 12);
      for (let k = 0; k < near.length * 2 && !f; k++){
        const h = near[(rh(e.id, 99+k, SEED+5) * near.length) | 0].h;
        const q = spotNear(h, e.id, 333 + k);
        if (q) f = fits(q);
      }
    }
    // 그래도 없으면 항로 바로 아래 육지
    for (let k = 0; k < 200 && !f; k++){
      const p = planePos(0.12 + rh(e.id, 200+k, SEED+6) * 0.74), a = rh(e.id, 400+k, SEED+6) * 6.283, r = rh(e.id, 600+k, SEED+6) * 80;
      const q = { x: p.x + Math.cos(a)*r, z: p.z + Math.sin(a)*r };
      if (landOK(q.x, q.z)) f = fits(q);
    }
    if (!f){ const q = planePos(0.5); f = { l:q, reach:dropReach(heightAt(q.x, q.z)) * 0.8, c:pathD(q) }; }
    let l = f.l, reach = f.reach, c = f.c;
    let t0 = c.t;                                // 들어오는 쪽에서 처음 닿는 시점
    while (t0 > 0.02){ const p = planePos(t0 - 0.005); if (Math.hypot(p.x-l.x, p.z-l.z) > reach) break; t0 -= 0.005; }
    e.lx = l.x; e.lz = l.z;
    e.dropT = t0 + (c.t - t0) * rh(e.id, 71, SEED+88);   // 처음 닿는 때 ~ 가장 가까울 때 사이 아무 때나
  }
}
// 한 프레임 낙하. 수평 의도(ix,iz: 이번 프레임 원하는 속도 m/s)와 다이브·활강 상태를 받는다
function fallStep(e, dt, ix, iz, mode){
  const chute = e.drop === 'chute';
  if (chute) e.vy = -FALL.chuteV;
  else {
    const vmax = mode === 'dive' ? FALL.diveV : mode === 'glide' ? FALL.glideV : FALL.v;
    e.vy = e.vy > -vmax ? Math.max(-vmax, e.vy - FALL.g*dt) : Math.min(-vmax, e.vy + FALL.slow*dt);
  }
  e.y += e.vy * dt;
  e.x = Math.max(-HALF+6, Math.min(HALF-6, e.x + ix*dt));
  e.z = Math.max(-HALF+6, Math.min(HALF-6, e.z + iz*dt));
  if (!chute && e.y < CHUTE_Y){ e.drop = 'chute'; return 'open'; }
  const g = landFloor(e.x, e.z, e.y - e.vy*dt);
  if (e.y <= g + 0.1){
    e.y = g; e.vy = 0; e.drop = 'ground'; unstick(e);
    e.landAt = elapsed;
    return 'land';
  }
  return null;
}
// 지금 상태에서 기본 자세로 착지까지 남은 초 (HUD)
function etaLand(e){
  const g = heightAt(e.x, e.z);
  if (e.drop === 'chute') return Math.max(0, (e.y - g) / FALL.chuteV);
  const v0 = -e.vy, a = FALL.g, v = FALL.v, dist = Math.max(0, e.y - Math.max(CHUTE_Y, g));
  let t;
  if (v0 >= v) t = dist / v0;
  else {
    const t1 = (v - v0) / a, d1 = v0*t1 + a*t1*t1/2;
    t = d1 >= dist ? (-v0 + Math.sqrt(v0*v0 + 2*a*dist)) / a : t1 + (dist - d1) / v;
  }
  return t + Math.max(0, Math.min(CHUTE_Y, e.y) - g) / FALL.chuteV;
}
const CHUTE_MAT = new THREE.MeshStandardMaterial({ color:0xdfe4e8, roughness:0.8, flatShading:true });
function chuteMesh(){
  const g = new THREE.ConeGeometry(2.6, 1.9, 8, 1, true);
  const m = new THREE.Mesh(g, CHUTE_MAT);
  m.rotation.x = Math.PI;
  return m;
}
function updateDrop(dt){
  plane.t += dt / PLANE_T;
  if (plane.t >= 1){ plane.t = 1; plane.done = true; }
  const pp = planePos(plane.t);
  if (plane.mesh){
    plane.mesh.position.set(pp.x, PLANE_Y, pp.z);
    plane.mesh.lookAt(plane.bx, PLANE_Y, plane.bz);
    plane.mesh.visible = !plane.done;
  }
  for (const e of ents){
    if (e.drop === 'ground') continue;
    if (e === me()){
      if (e.drop === 'plane'){
        e.x = pp.x; e.z = pp.z; e.y = PLANE_Y - 3;
        if (keys.Space || plane.t > 0.92){ e.drop = 'free'; e.vy = -6; e.jumpAt = elapsed; feed('<i>이탈 — 낙하 중</i>'); }
      } else {
        const chute = e.drop === 'chute';
        const y = yawO.rotation.y;
        const fx = -Math.sin(y), fz = -Math.cos(y), rx = Math.cos(y), rz = -Math.sin(y);
        let ix = 0, iz = 0, mode = null;
        if (chute){                                // 낙하산 — WASD 로 15m/s
          let mx = 0, mz = 0;
          if (keys.KeyW){ mx += fx; mz += fz; }
          if (keys.KeyS){ mx -= fx; mz -= fz; }
          if (keys.KeyD){ mx += rx; mz += rz; }
          if (keys.KeyA){ mx -= rx; mz -= rz; }
          const L = Math.hypot(mx, mz);
          if (L > 0){ ix = mx/L*FALL.chuteH; iz = mz/L*FALL.chuteH; }
        } else {                                   // 자유낙하 — W 다이브, S 활강, A/D 옆으로
          const f = keys.KeyW ? FALL.diveH : keys.KeyS ? FALL.glideH : 0;
          mode = keys.KeyW ? 'dive' : keys.KeyS ? 'glide' : null;
          const side = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
          ix = fx*f + rx*side*FALL.h; iz = fz*f + rz*side*FALL.h;
          const L = Math.hypot(ix, iz), cap = Math.max(FALL.h, f);
          if (L > cap){ ix *= cap/L; iz *= cap/L; }
        }
        const r = fallStep(e, dt, ix, iz, mode);
        if (r === 'open'){ sChute(); feed('<i>낙하산 산개</i>'); }
        if (r === 'land') onLanded();
      }
      yawO.position.set(e.x, e.y + eyeH(e), e.z);
      continue;
    }
    // 봇 — 정해 둔 시점에 뛰어, 나와 같은 물리로 자기 착지점까지 날아간다
    if (e.drop === 'plane'){
      if (plane.t >= e.dropT){
        e.drop = 'free'; e.vy = -6; e.x = pp.x; e.z = pp.z; e.y = PLANE_Y - 3; e.jumpAt = elapsed;
        if (e.mesh) e.mesh.visible = true;
      } else { e.y = PLANE_Y; e.x = pp.x; e.z = pp.z; if (e.mesh) e.mesh.visible = false; continue; }
    }
    const h = e.drop === 'chute' ? FALL.chuteH : FALL.h;
    const dx = e.lx - e.x, dz = e.lz - e.z, d = Math.hypot(dx, dz);
    const sp = Math.min(h, d / Math.max(dt, 1e-3));   // 착지점 위에 오면 멈춘다
    const r = fallStep(e, dt, d > 0.01 ? dx/d*sp : 0, d > 0.01 ? dz/d*sp : 0, null);
    if (r === 'open'){ e.chute = chuteMesh(); scene.add(e.chute); }
    if (e.mesh){ e.mesh.position.set(e.x, e.y, e.z); }
    if (e.chute) e.chute.position.set(e.x, e.y + 4.4, e.z);
    if (r === 'land' && e.chute){ scene.remove(e.chute); e.chute = null; }
  }
  if (ents.every(e => e.drop === 'ground')) goLive();
}
function landFloor(x, z, fromY){               // 지붕 위로 내려오면 지붕에 선다
  let f = heightAt(x, z);
  for (const c of cols){
    if (x > c.x-c.hw && x < c.x+c.hw && z > c.z-c.hd && z < c.z+c.hd && c.y1 <= fromY + 0.6 && c.y1 > f) f = c.y1;
  }
  return f;
}
function unstick(e){                             // 벽·바위 속에 내렸으면 가까운 빈 자리로 빼 준다
  if (!blocked(e.x, e.y, e.z, BODY_R)) return;
  for (let r = 0.5; r <= 4; r += 0.5)
    for (let i = 0; i < 8; i++){
      const t = i * Math.PI/4, x = e.x + Math.sin(t)*r, z = e.z + Math.cos(t)*r, y = heightAt(x, z);
      if (!blocked(x, y, z, BODY_R)){ e.x = x; e.z = z; e.y = y; return; }
    }
}
function onLanded(){
  feed('<i>착지 — 총을 찾아라</i>');
  sLand();
  if (plane.mesh){ /* 비행기는 끝까지 날아간다 */ }
}
function goLive(){
  if (matchState !== 'drop') return;
  matchState = 'live';
  if (plane.mesh){ scene.remove(plane.mesh); plane.mesh = null; }
  feed('<i>전원 착지 — 자기장이 곧 움직인다</i>');
}

// ══ 자세 ══════════════════════════════════════════════════════
const eyeH = (e) => EYE * STANCE[e.st].h;
function setStance(st){
  const p = me();
  if (p.drop !== 'ground') return;
  p.st = (p.st === st) ? 0 : st;
  if (p.healT > 0){ p.healT = 0; p.healKind = null; }
  hudGun();
}

// ══ 차량 — 지프 ═══════════════════════════════════════════════
const cars = [];
let riding = null;
function buildCars(){
  const ps = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  const put = (x,y,z,w,h,d,c) => { m.compose(new THREE.Vector3(x,y,z), q, sc.set(w,h,d)); ps.push({ g:BOX, m:m.clone(), c }); };
  put(0, 0.75, 0, 2.0, 0.8, 4.3, 0x6b7a52);
  put(0, 1.35, 0.5, 1.7, 0.6, 1.9, 0x5d6a48);
  put(0, 1.55, -0.6, 1.5, 0.12, 1.2, 0x3a4230);
  put(-1.02, 0.45, 1.4, 0.3, 0.9, 0.9, 0x1e2124);
  put( 1.02, 0.45, 1.4, 0.3, 0.9, 0.9, 0x1e2124);
  put(-1.02, 0.45, -1.4, 0.3, 0.9, 0.9, 0x1e2124);
  put( 1.02, 0.45, -1.4, 0.3, 0.9, 0.9, 0x1e2124);
  const geo = merge(ps);
  for (let i=0;i<3;i++){
    let x=0, z=0;
    for (let t=0;t<60;t++){
      const a = rh(i,91,SEED)*6.283 + t*0.3, r = 90 + rh(i,92,SEED)*300;
      x = Math.cos(a)*r; z = Math.sin(a)*r;
      if (heightAt(x,z) > -2 && !blocked(x, heightAt(x,z), z, 2.6)) break;
    }
    const mesh = new THREE.Mesh(geo, SOLID);
    scene.add(mesh);
    cars.push({ x, z, y:heightAt(x,z), yaw:rh(i,93,SEED)*6.283, spd:0, mesh });
  }
}
function nearCar(){
  const p = me();
  let best = null, bd = 4.2;
  for (const c of cars){
    const d = Math.hypot(c.x-p.x, c.z-p.z);
    if (d < bd){ bd = d; best = c; }
  }
  return best;
}
function updateCars(dt){
  for (const c of cars){
    if (c === riding){
      let th = 0, stw = 0;
      if (keys.KeyW) th += 1;
      if (keys.KeyS) th -= 1;
      if (keys.KeyD) stw += 1;
      if (keys.KeyA) stw -= 1;
      const boost = (keys.ShiftLeft || keys.ShiftRight) ? 1.35 : 1;
      c.spd += th * 15 * boost * dt;
      c.spd -= c.spd * (th === 0 ? 1.4 : 0.35) * dt;
      c.spd = Math.max(-7, Math.min(23 * boost, c.spd));
      if (stw) c.yaw -= stw * 1.9 * dt * Math.min(1, Math.abs(c.spd)/6) * (c.spd < -0.2 ? -1 : 1);
    } else c.spd -= c.spd * 2.2 * dt;
    if (Math.abs(c.spd) < 0.05) c.spd = 0;
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
    const nx = c.x + fx*c.spd*dt, nz = c.z + fz*c.spd*dt;
    if (Math.abs(nx) < HALF-6 && Math.abs(nz) < HALF-6 && !blocked(nx, c.y, nz, 1.6)){
      c.x = nx; c.z = nz;
    } else if (c === riding && Math.abs(c.spd) > 9){
      hurt(me(), Math.abs(c.spd) * 1.4, null, null);   // 박으면 다친다
      c.spd = 0; sHurt();
    } else c.spd *= 0.2;
    c.y = heightAt(c.x, c.z);
    c.mesh.position.set(c.x, c.y, c.z);
    c.mesh.rotation.y = c.yaw;
    if (c === riding){
      const p = me();
      p.x = c.x; p.z = c.z; p.y = c.y;
      yawO.position.set(c.x, c.y + 1.9, c.z);
    }
  }
}
function toggleRide(){
  const p = me();
  if (riding){
    const rx = Math.cos(riding.yaw), rz = -Math.sin(riding.yaw);
    p.x = riding.x + rx*2.6; p.z = riding.z + rz*2.6;
    p.y = heightAt(p.x, p.z);
    riding = null; feed('<i>하차</i>'); sTake();
    return;
  }
  const c = nearCar();
  if (!c) return;
  riding = c; p.st = 0; setScope(false);
  feed('<i>탑승 — W/S 가속 · A/D 조향 · Shift 부스트 · E 하차</i>'); sTake();
}

// ══ 레드존 · 보급 상자 ════════════════════════════════════════
const red = { on:false, t:RED_EVERY, x:0, z:0, left:0, ring:null };
function buildRed(){
  const g = new THREE.CylinderGeometry(1,1,120,40,1,true);
  red.ring = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
    color:0xff4d3a, transparent:true, opacity:0.14, side:THREE.DoubleSide, depthWrite:false, fog:false }));
  red.ring.visible = false; red.ring.position.y = 30;
  scene.add(red.ring);
}
function updateRed(dt){
  if (!red.on){
    red.t -= dt;
    if (red.t <= 0){
      const a = Math.random()*6.283, r = Math.random()*zone.r*0.8;
      red.x = zone.cx + Math.cos(a)*r; red.z = zone.cz + Math.sin(a)*r;
      red.on = true; red.left = RED_LEN; red.t = RED_EVERY;
      red.ring.visible = true;
      red.ring.position.set(red.x, 30, red.z);
      red.ring.scale.set(RED_R, 1, RED_R);
      feed('<i style="color:#ff6a55">레드존 — 폭격이 들어온다</i>');
      sWarn();
    }
    return;
  }
  red.left -= dt;
  if (red.left <= 0){ red.on = false; red.ring.visible = false; return; }
  if (Math.random() < dt * 7){                      // 포탄이 떨어진다
    const a = Math.random()*6.283, r = Math.sqrt(Math.random())*RED_R;
    const bx = red.x + Math.cos(a)*r, bz = red.z + Math.sin(a)*r;
    const by = heightAt(bx, bz);
    fx(bx, by+1.6, bz, 7, 0.4, false);
    const dp = Math.hypot(bx-me().x, bz-me().z);
    sBoom(dp);
    for (const e of ents){
      if (!e.alive || e.drop !== 'ground') continue;
      const d = Math.hypot(e.x-bx, e.z-bz);
      if (d < 11) hurt(e, (1 - d/11) * 92, null, null);
    }
  }
}
const cares = [];
let careIdx = 0;
function dropCare(){
  const a = Math.random()*6.283, r = Math.random()*zone.r*0.7;
  const x = zone.cx + Math.cos(a)*r, z = zone.cz + Math.sin(a)*r;
  const y = heightAt(x, z);
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 1.6),
    new THREE.MeshStandardMaterial({ color:0xd94f2a, roughness:0.7 }));
  m.position.set(x, y + 160, z);
  scene.add(m);
  const chute = chuteMesh(); chute.scale.set(1.6,1.6,1.6);
  chute.position.set(x, y + 166, z); scene.add(chute);
  cares.push({ x, y, z, mesh:m, chute, fall:true, taken:false });
  feed('<i style="color:#ffb03a">보급 상자 투하</i>');
}
function updateCares(dt){
  for (const c of cares){
    if (c.fall){
      c.mesh.position.y -= 11 * dt;
      c.chute.position.y = c.mesh.position.y + 6;
      if (c.mesh.position.y <= c.y + 0.55){
        c.mesh.position.y = c.y + 0.55; c.fall = false;
        scene.remove(c.chute); c.chute = null;
      }
    }
  }
}
function nearCare(){
  const p = me();
  for (const c of cares){
    if (c.taken || c.fall) continue;
    if (Math.hypot(c.x-p.x, c.z-p.z) < 3) return c;
  }
  return null;
}

// ══ 자기장 ════════════════════════════════════════════════════
const zone = { cx:0, cz:0, r:HALF*0.95, nx:0, nz:0, nr:HALF*0.95, phase:0, t:0, moving:false };
let zoneRing = null;
function buildZone(){
  const g = new THREE.CylinderGeometry(1, 1, 160, 72, 1, true);
  zoneRing = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
    color:0x5ab4ff, transparent:true, opacity:0.2, side:THREE.DoubleSide, depthWrite:false, fog:false }));
  zoneRing.position.y = 40;
  scene.add(zoneRing);
}
function nextPhase(){
  if (zone.phase >= PHASES.length) return;
  const [, , nr] = PHASES[zone.phase];
  const shift = Math.max(0, zone.r - nr);
  const a = Math.random() * Math.PI * 2, d = Math.random() * shift * 0.72;
  zone.nx = zone.cx + Math.cos(a)*d;
  zone.nz = zone.cz + Math.sin(a)*d;
  zone.nr = nr;
  zone.t = PHASES[zone.phase][0];
  zone.moving = false;
}
function updateZone(dt){
  if (zone.phase >= PHASES.length) return;
  zone.t -= dt;
  if (!zone.moving){
    if (zone.t <= 0){ zone.moving = true; zone.t = PHASES[zone.phase][1]; feed('<i>자기장이 좁혀진다</i>'); sWarn(); }
  } else {
    const k = 1 - Math.max(0, zone.t) / PHASES[zone.phase][1];
    const p0 = zone.p0 || (zone.p0 = { x:zone.cx, z:zone.cz, r:zone.r });
    zone.cx = p0.x + (zone.nx - p0.x) * k;
    zone.cz = p0.z + (zone.nz - p0.z) * k;
    zone.r  = p0.r + (zone.nr - p0.r) * k;
    if (zone.t <= 0){ zone.phase++; zone.p0 = null; nextPhase(); }
  }
  zoneRing.position.set(zone.cx, 40, zone.cz);
  zoneRing.scale.set(zone.r, 1, zone.r);
}
const outOfZone = (e) => Math.hypot(e.x - zone.cx, e.z - zone.cz) > zone.r;

// ══ 사운드 ════════════════════════════════════════════════════
const AU = { ctx:null };
function audio(){
  if (AU.ctx) { if (AU.ctx.state === 'suspended') AU.ctx.resume(); return; }
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return;
  try { AU.ctx = new C(); } catch(e){ return; }
  AU.g = AU.ctx.createGain(); AU.g.gain.value = 0.55; AU.g.connect(AU.ctx.destination);
  const n = AU.ctx.sampleRate * 0.5;
  AU.noise = AU.ctx.createBuffer(1, n, AU.ctx.sampleRate);
  const d = AU.noise.getChannelData(0);
  for (let i=0;i<n;i++) d[i] = Math.random()*2-1;
}
function env(g, t, pk, dur, atk){
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(pk,0.0002), t + (atk||0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function nz(freq, q, pk, dur, type, rate){
  if (!AU.ctx) return;
  const c = AU.ctx, t = c.currentTime;
  const s = c.createBufferSource(); s.buffer = AU.noise; s.playbackRate.value = rate || 1;
  const f = c.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain(); env(g, t, pk, dur);
  s.connect(f); f.connect(g); g.connect(AU.g); s.start(t); s.stop(t+dur+0.05);
}
function tone(f0, f1, pk, dur, type){
  if (!AU.ctx) return;
  const c = AU.ctx, t = c.currentTime;
  const o = c.createOscillator(); o.type = type || 'triangle';
  o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20,f1), t+dur);
  const g = c.createGain(); env(g, t, pk, dur, 0.008);
  o.connect(g); g.connect(AU.g); o.start(t); o.stop(t+dur+0.05);
}
function sShot(g, far){
  const v = far ? 0.22 : 1;
  nz(g.k==='sniper'?1700:g.k==='shot'?900:1300, 0.8, 0.5*v, g.k==='sniper'?0.42:0.2, 'bandpass', 0.8);
  tone(g.k==='sniper'?150:190, 48, 0.4*v, 0.22, 'square');
  if (!far) nz(220, 0.6, 0.2, 0.5, 'lowpass', 0.4);
}
const sHit   = () => { nz(2400, 1.4, 0.3, 0.09, 'bandpass'); tone(880, 520, 0.12, 0.07, 'square'); };
const sTake  = () => tone(620, 880, 0.12, 0.1, 'triangle');
const sRel   = () => { nz(700, 0.8, 0.2, 0.1, 'lowpass', 0.7); setTimeout(()=>nz(500,0.8,0.22,0.12,'lowpass',0.6), 160); };
const sHurt  = () => { nz(500, 0.7, 0.4, 0.22, 'lowpass', 0.5); tone(220, 120, 0.2, 0.2, 'sine'); };
const sKill  = () => { tone(520, 1040, 0.22, 0.16, 'triangle'); setTimeout(()=>tone(780,1560,0.2,0.2,'triangle'), 110); };
const sWarn  = () => { tone(440, 330, 0.18, 0.5, 'sine'); setTimeout(()=>tone(390,290,0.18,0.6,'sine'), 420); };
const sMed   = () => tone(400, 760, 0.16, 0.5, 'sine');
const sChute = () => { nz(600, 0.5, 0.3, 0.7, 'lowpass', 0.35); tone(180, 300, 0.12, 0.6, 'sine'); };
const sLand  = () => { nz(260, 0.7, 0.35, 0.22, 'lowpass', 0.5); tone(140, 80, 0.2, 0.2, 'sine'); };
function sBoom(dist){
  const v = Math.max(0.12, 1 - dist/240);
  nz(150, 0.9, 0.6*v, 1.0, 'lowpass', 0.3);
  tone(80, 28, 0.5*v, 0.9, 'sine');
  setTimeout(() => nz(430, 0.5, 0.25*v, 0.7, 'lowpass', 0.4), 80);
}

// ══ 이펙트 ════════════════════════════════════════════════════
const FXN = 48, fxs = [];
const FXG = new THREE.PlaneGeometry(1,1);
const MAT_SPARK = new THREE.MeshBasicMaterial({ color:0xffc46a, transparent:true, depthWrite:false, fog:false });
const MAT_BLOOD = new THREE.MeshBasicMaterial({ color:0xff5a3c, transparent:true, depthWrite:false, fog:false });
const TRC = new THREE.MeshBasicMaterial({ color:0xffd98a, transparent:true, opacity:0.5, depthWrite:false, fog:false });
let fxi = 0;
function initFx(){
  for (let i=0;i<FXN;i++){
    const m = new THREE.Mesh(FXG, MAT_SPARK); m.visible = false; scene.add(m);
    fxs.push({ m, t:0, life:0, tracer:false });
  }
}
function fx(x,y,z,size,life,blood){
  const f = fxs[fxi++ % FXN];
  f.m.material = blood ? MAT_BLOOD : MAT_SPARK;
  f.m.position.set(x,y,z); f.m.scale.set(size,size,size);
  f.m.rotation.set(0,0,Math.random()*3);
  f.m.visible = true; f.t = f.life = life; f.tracer = false;
}
function tracer(ax,ay,az,bx,by,bz){
  const f = fxs[fxi++ % FXN];
  f.m.material = TRC;
  const dx=bx-ax, dy=by-ay, dz=bz-az, L=Math.hypot(dx,dy,dz);
  f.m.position.set((ax+bx)/2,(ay+by)/2,(az+bz)/2);
  f.m.scale.set(0.06, L, 1);
  f.m.lookAt(bx,by,bz); f.m.rotateX(Math.PI/2);
  f.m.visible = true; f.t = f.life = 0.055; f.tracer = true;
}
const _cw = new THREE.Vector3();
function updateFx(dt){
  cam.getWorldPosition(_cw);
  for (const f of fxs){
    if (!f.m.visible) continue;
    f.t -= dt;
    if (f.t <= 0){ f.m.visible = false; continue; }
    if (!f.tracer) f.m.lookAt(_cw);
    f.m.material.opacity = (f.tracer ? 0.5 : 0.95) * (f.t / f.life);
  }
}

// ══ 레이캐스트 ════════════════════════════════════════════════
function rayBox(ox,oy,oz,dx,dy,dz,c,maxT){
  let t0 = 0, t1 = maxT;
  const sl = (p,d,a,b) => {
    if (Math.abs(d) < 1e-9) return p>=a && p<=b;
    let s0=(a-p)/d, s1=(b-p)/d; if (s0>s1){ const t=s0; s0=s1; s1=t; }
    if (s0>t0) t0=s0; if (s1<t1) t1=s1; return t1>=t0;
  };
  if (!sl(ox,dx,c.x-c.hw,c.x+c.hw)) return -1;
  if (!sl(oy,dy,c.y0,c.y1)) return -1;
  if (!sl(oz,dz,c.z-c.hd,c.z+c.hd)) return -1;
  return t0 > 0.05 ? t0 : -1;
}
function rayWorld(ox,oy,oz,dx,dy,dz,maxT){
  let best = maxT;
  for (let i=0;i<cols.length;i++){
    const t = rayBox(ox,oy,oz,dx,dy,dz,cols[i],best);
    if (t > 0 && t < best) best = t;
  }
  let prev = 0;
  for (let t=0.7; t<best; t += (t<50 ? 1.1 : 3.2)){
    if (oy + dy*t - heightAt(ox+dx*t, oz+dz*t) <= 0){
      let a=prev, b=t;
      for (let i=0;i<12;i++){ const m=(a+b)/2;
        if (oy+dy*m - heightAt(ox+dx*m, oz+dz*m) <= 0) b=m; else a=m; }
      if (b < best) best = b;
      break;
    }
    prev = t;
  }
  return best;
}
function rayEnts(ox,oy,oz,dx,dy,dz,maxT,skip){
  let hit = null, best = maxT;
  for (const e of ents){
    if (!e.alive || e === skip || e.drop === 'plane') continue;   // 비행기 안은 못 맞힌다
    if (Math.hypot(e.x-ox, e.z-oz) > best + 3) continue;
    for (const p of PARTS){
      let t0=0, t1=best;
      const sl = (q,d,a,b) => {
        if (Math.abs(d) < 1e-9) return q>=a && q<=b;
        let s0=(a-q)/d, s1=(b-q)/d; if (s0>s1){ const t=s0; s0=s1; s1=t; }
        if (s0>t0) t0=s0; if (s1<t1) t1=s1; return t1>=t0;
      };
      if (!sl(ox,dx,e.x-p.r,e.x+p.r)) continue;
      const sh = STANCE[e.st].h;
      if (!sl(oy,dy,e.y+p.y0*sh,e.y+p.y1*sh)) continue;
      if (!sl(oz,dz,e.z-p.r,e.z+p.r)) continue;
      if (t0 > 0.05 && t0 < best){ best = t0; hit = { e, p, t:t0 }; }
    }
  }
  return hit;
}
function canSee(a, b){
  const ox=a.x, oy=a.y+1.5, oz=a.z;
  const dx=b.x-ox, dy=(b.y+1.2)-oy, dz=b.z-oz;
  const L=Math.hypot(dx,dy,dz);
  if (L < 0.5) return true;
  return rayWorld(ox,oy,oz,dx/L,dy/L,dz/L,L) >= L - 0.6;
}

// ══ 전투 ══════════════════════════════════════════════════════
let kills = 0, placed = 0, shots = 0, hits = 0, bloom = 0, scoped = false;
let kickP = 0, kickY = 0, hitT = 0;
// eff 까지 100%. 그 뒤 eff 만큼 더 가는 동안 lo 까지 완만히 내려가고 거기서 멈춘다.
// 샷건만 예전 방식(유효사거리 안에서 1→0.4, 넘으면 0 으로) — 기준 거리만 eff(25m).
// g.range 는 봇이 어디서 싸울지 정하는 데만 쓴다 (난이도 작업에서 손댄다).
function rangeMul(g, d){
  if (g.fall){
    if (d <= g.eff) return 1 - (d/g.eff)*0.6;
    const o = (d - g.eff) / (g.eff*0.35);
    return o >= 1 ? 0 : 0.4 * (1 - o);
  }
  if (d <= g.eff) return 1;
  return Math.max(g.lo, 1 - (1 - g.lo) * (d - g.eff) / g.eff);
}
let hurtFxAt = 0;
function hurt(e, dmg, by, part, gunName){
  if (!e.alive || e.drop === 'plane') return false;   // 낙하산 중에도 맞는다 (배그식)
  // 방어구 — 머리는 헬멧, 몸은 방탄복이 깎아 주고 그만큼 내구도가 닳는다
  const head = part && part.m >= 2;
  if (head && e.helm && e.helmD > 0){
    const a = ARMOR[e.helm];
    const cut = dmg * a.cut;
    e.helmD -= cut * 0.55; dmg -= cut;
    if (e.helmD <= 0){ e.helm = 0; if (e === me()) feed('<i>헬멧 파괴</i>'); }
  } else if (!head && part && e.vest && e.vestD > 0){
    const a = ARMOR[e.vest];
    const cut = dmg * a.cut;
    e.vestD -= cut * 0.55; dmg -= cut;
    if (e.vestD <= 0){ e.vest = 0; if (e === me()) feed('<i>방탄복 파괴</i>'); }
  }
  e.hp -= dmg;
  if (by && e.healT > 0){ e.healT = 0; e.healKind = null; }   // 자기장·레드존(by 없음)은 치료를 안 끊는다
  if (e === me() && performance.now() - hurtFxAt > 300){      // 붉은 화면·소리는 0.3초에 한 번
    hurtFxAt = performance.now();
    dmgEl.style.opacity = '1';
    setTimeout(()=>{ dmgEl.style.opacity = '0'; }, 110);
    sHurt();
  }
  if (e.hp <= 0){
    e.alive = false; e.fall = 0;
    e.place = aliveN() + 1;                      // 순위표용 — 남은 사람 수 + 1
    if (e.bot) deathBox(e);
    if (by){ by.kills++; if (by === me()){ kills++; sKill(); } }
    feed((by===me()?'<s>처치</s> ':(by?tag(by)+' → ':'')) + tag(e)
       + (gunName ? ' <i>['+gunName+']</i>' : '') + (part && part.t ? ' · '+part.t : ''));
    if (e === me()) finish();
    else checkWin();
  }
  return true;
}

function fireFrom(e, dirX, dirY, dirZ){
  const gi = e.guns[e.slot];
  if (gi === null) return;
  const g = GUNS[gi];
  // 나는 보이는 그대로 — 카메라(yawO = 발 + 눈높이)에서 쏜다. 봇은 자세만큼 낮아진 어깨에서.
  const ox = e === me() ? yawO.position.x : e.x;
  const oy = e === me() ? yawO.position.y : e.y + 1.52 * STANCE[e.st].h;
  const oz = e === me() ? yawO.position.z : e.z;
  e.lastShot = performance.now();
  const far = e !== me() && Math.hypot(e.x-me().x, e.z-me().z) > 45;
  sShot(g, far);
  for (let p=0; p<g.pel; p++){
    let dx=dirX, dy=dirY, dz=dirZ;
    // 봇은 사람보다 훨씬 못 맞힌다. 얼마나 못 맞히는지는 난이도(TIERS)가 정한다.
    const stm = STANCE[e.st].spread;
    const sp = e===me() ? g.spread * (1 + bloom*1.7) * (scoped?0.3:1) * stm
                        : (g.spread * TIERS[e.tier].sp + 0.006) * stm
                          * (e.fresh > 0 && e.tier <= 2 ? 1.5 : 1);   // 보통 이하는 처음 2발이 더 퍼진다
    const a = Math.random()*6.283, r = Math.sqrt(Math.random())*sp;
    const sx = -dz, sz = dx, sl = Math.hypot(sx,sz) || 1;
    dx += (sx/sl)*Math.cos(a)*r; dz += (sz/sl)*Math.cos(a)*r; dy += Math.sin(a)*r;
    const L = Math.hypot(dx,dy,dz); dx/=L; dy/=L; dz/=L;
    const maxT = g.fly;
    const w = rayWorld(ox,oy,oz,dx,dy,dz,maxT);
    const h = rayEnts(ox,oy,oz,dx,dy,dz,w,e);
    const t = h ? h.t : w;
    if (e === me() || far === false) tracer(ox,oy,oz, ox+dx*t, oy+dy*t, oz+dz*t);
    const dm = h ? g.dmg * h.p.m * rangeMul(g, t) : 0;
    if (h && dm > 0 && hurt(h.e, dm, e, h.p, g.n)){   // 피·히트마커·명중 집계는 피해가 들어갔을 때만
      fx(ox+dx*t, oy+dy*t, oz+dz*t, 0.3, 0.16, true);
      if (e === me()){ hits++; hitT = 0.13; }
    } else fx(ox+dx*t, oy+dy*t, oz+dz*t, 0.25, 0.18, false);
  }
  if (e === me()){
    shots++;
    const k = g.kick * 0.011;
    kickP += k; kickY += (Math.random()-0.5)*k*0.6;
    pitO.rotation.x += k; yawO.rotation.y += (Math.random()-0.5)*k*0.6;
    bloom = Math.min(1, bloom + (g.pel>1 ? 0.5 : 0.2));
  }
}
const _fd = new THREE.Vector3();
function myShoot(){
  const p = me();
  const gi = p.guns[p.slot];
  if (gi === null || p.cd > 0 || p.reload > 0 || p.healT > 0) return;
  if (p.drop !== 'ground' || riding) return;
  if (p.ammo[p.slot] <= 0){ startReload(); return; }
  p.ammo[p.slot]--; p.cd = GUNS[gi].rate;
  cam.getWorldDirection(_fd);
  fireFrom(p, _fd.x, _fd.y, _fd.z);
  hudGun();
}
function startReload(){
  const p = me(), gi = p.guns[p.slot];
  if (gi === null || p.reload > 0) return;
  const g = GUNS[gi];
  if (p.ammo[p.slot] >= g.mag || p.bag[g.am] <= 0) return;
  p.reload = g.reload; sRel(); hudGun();
}
function swapGun(s){
  const p = me();
  if (s === p.slot || p.guns[s] === null) return;
  p.slot = s; p.reload = 0; p.cd = Math.max(p.cd, 0.22);
  setScope(false); buildView(); hudGun();
}
function setScope(on){
  const p = me(), gi = p.guns[p.slot];
  const want = !!(on && gi !== null);
  if (want === scoped) return;
  scoped = want;
  const sn = gi !== null && GUNS[gi].scope;
  cam.fov = scoped ? (sn ? 20 : 52) : 74;
  cam.updateProjectionMatrix();
  scopeEl.style.display = (scoped && sn) ? 'block' : 'none';
  crossEl.style.visibility = (scoped && sn) ? 'hidden' : '';   // 저격 배율에선 조준경 십자선만
  if (viewGun) viewGun.visible = !(scoped && sn);
}

// ══ 1인칭 총 ══════════════════════════════════════════════════
let viewGun = null;
const VIEW_MAT = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.55, flatShading:true });
function buildView(){
  if (viewGun){ cam.remove(viewGun); viewGun.geometry.dispose(); viewGun = null; }
  const gi = me().guns[me().slot];
  if (gi === null) return;
  const g = GUNS[gi];
  const ps = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const put = (x,y,z,w,h,d,c) => { m.compose(new THREE.Vector3(x,y,z), q, s.set(w,h,d)); ps.push({ g:BOX, m:m.clone(), c }); };
  put(0, 0, -g.len/2 - 0.08, 0.055, 0.055, g.len, g.col);
  put(0, -0.04, 0.03, 0.085, 0.10, 0.26, 0x23272c);
  put(0, -0.12, 0.10, 0.07, 0.14, 0.075, 0x23272c);
  if (g.scope) put(0, 0.075, -0.10, 0.05, 0.05, 0.22, 0x1c1f23);
  if (g.k === 'shot') put(0, -0.075, -0.17, 0.055, 0.055, 0.3, 0x6a4a30);
  viewGun = new THREE.Mesh(merge(ps), VIEW_MAT);
  viewGun.position.set(0.18, -0.16, -0.33);
  cam.add(viewGun);
}

// ══ 봇 ════════════════════════════════════════════════════════
function botThink(b){
  b.think = 0.35 + Math.random()*0.4;
  const T = TIERS[b.tier];
  let best = null, bd = 1e9;
  for (const o of ents){
    if (o === b || !o.alive || o.drop !== 'ground') continue;   // 아직 공중에 있는 사람은 안 노린다
    const d = Math.hypot(o.x-b.x, o.z-b.z);
    if (d < bd && d < T.sight && canSee(b, o)){ bd = d; best = o; }
  }
  if (best && best !== b.target){                // 보자마자 쏘지는 않는다
    b.react = rnd(T.react);
    b.fresh = 2;                                 // 새 표적의 처음 2발
    rollAim(b);
  }
  b.target = best;
  if (!best){                                  // 적이 안 보이면 자기장 안쪽으로
    const d = Math.hypot(b.x-zone.cx, b.z-zone.cz);
    if (d > zone.r*0.62){
      const a = Math.atan2(zone.cz-b.z, zone.cx-b.x);
      b.tx = b.x + Math.cos(a)*40; b.tz = b.z + Math.sin(a)*40;
    } else {
      const a = Math.random()*6.283, r = 18+Math.random()*30;
      b.tx = b.x + Math.cos(a)*r; b.tz = b.z + Math.sin(a)*r;
    }
  }
}
function rollAim(b){                             // 연사 한 번마다 조준점이 이만큼 빗나가 있다 (-1~1, 거리 곱)
  b.aimX = Math.random()*2 - 1; b.aimY = Math.random()*2 - 1;
  b.aimHead = Math.random() < TIERS[b.tier].head;
}
function findCover(b, t){                        // 표적 눈높이에서 안 보이는 5m 안쪽 자리
  const ty = t.y + 1.5;
  for (let i = 0; i < 12; i++){
    const a = Math.random()*6.283, r = 3 + Math.random()*3;
    const x = b.x + Math.sin(a)*r, z = b.z + Math.cos(a)*r, y = heightAt(x, z) + 1.2;
    if (blocked(x, y-1.2, z, BODY_R)) continue;
    const dx = x-t.x, dy = y-ty, dz = z-t.z, L = Math.hypot(dx,dy,dz);
    if (rayWorld(t.x, ty, t.z, dx/L, dy/L, dz/L, L) < L - 0.6){ b.cx = x; b.cz = z; b.coverT = 2.5; return true; }
  }
  return false;
}
function botHeal(b, dt){                         // 어려움 이상 — 안 보일 때 피를 채운다
  if (b.healT > 0){
    b.healT -= dt;
    if (b.healT <= 0 && b.healKind){
      const H = HEALS[b.healKind];
      b.inv[b.healKind]--; b.hp = Math.max(b.hp, Math.min(H.cap, b.hp + H.hp)); b.healKind = null;
    }
    return true;
  }
  if (b.hp >= 60) return false;
  const safe = !b.target || !b.target.alive || !canSee(b.target, b);
  if (!safe) return false;
  const kind = b.inv.kit > 0 && b.hp < 75 ? 'kit' : (b.inv.band > 0 ? 'band' : null);
  if (!kind) return false;
  b.healKind = kind; b.healT = HEALS[kind].t;
  return true;
}
function updateBot(b, dt){
  if (b.drop !== 'ground') return;
  const T = TIERS[b.tier];
  b.st = (b.target && b.target.alive
          && Math.hypot(b.target.x-b.x, b.target.z-b.z) < 42) ? 1 : 0;
  b.think -= dt;
  if (b.think <= 0) botThink(b);
  const gi = b.guns[b.slot], g = gi !== null ? GUNS[gi] : null;
  let mx = 0, mz = 0, run = false;
  if (b.cd > 0) b.cd -= dt;
  if (b.reload > 0){ b.reload -= dt; if (b.reload <= 0 && g){ b.ammo[b.slot] = g.mag; } }
  if (T.move >= 4 && botHeal(b, dt)){           // 회복 중엔 앉아서 멈춘다
    b.st = 1;
    if (b.mesh) b.y = heightAt(b.x, b.z);
    return;
  }
  if (b.coverT > 0){                             // 하드코어 — 장전·빈사 때 엄폐로 뛴다
    b.coverT -= dt;
    const dx = b.cx-b.x, dz = b.cz-b.z, d = Math.hypot(dx,dz);
    if (d > 0.8){ mx = dx/d; mz = dz/d; run = true; } else b.st = 1;
    if (b.target) b.yaw = Math.atan2(b.target.x-b.x, b.target.z-b.z);
  } else if (b.target && b.target.alive){
    const d = Math.hypot(b.target.x-b.x, b.target.z-b.z);
    b.yaw = Math.atan2(b.target.x-b.x, b.target.z-b.z);
    const want = g ? Math.min(g.range*0.55, 26) : 8;
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    if (b.strafeT === undefined || (b.strafeT -= dt) <= 0){   // 좌우 무빙 방향을 가끔 바꾼다
      b.strafeT = T.move >= 4 ? 0.7 + Math.random()*0.8 : 1e9;
      b.side = T.move >= 4 ? (Math.random() < 0.5 ? 1 : -1) : (b.id%2 ? 1 : -1);
    }
    const sideAmp = [0, 0, 0.5, 0.8, 1, 1][T.move];
    if (T.move === 0){                           // 아주 쉬움 — 거의 제자리
      if (d > want*1.8){ mx = fx*0.5; mz = fz*0.5; }
    } else if (T.move === 1){                    // 쉬움 — 다가가기만 한다
      if (d > want){ mx = fx; mz = fz; run = d > want*1.6; }
    } else {
      if (d > want){ mx = fx; mz = fz; run = d > want*1.6; }
      else if (d < want*0.5){ mx = -fx; mz = -fz; }
      else { mx = fz*b.side*sideAmp; mz = -fx*b.side*sideAmp; }
      if (T.move >= 4 && d <= want) { mx += fz*b.side*0.6; mz += -fx*b.side*0.6; }
    }
    // 사격
    if (b.react > 0) b.react -= dt;
    if (g && b.react <= 0 && b.cd <= 0 && b.reload <= 0 && d < g.range*1.1 && canSee(b, b.target)){
      if (b.ammo[b.slot] <= 0){
        b.reload = g.reload;
        if (T.move >= 5) findCover(b, b.target);
      } else {
        b.ammo[b.slot]--;
        b.cd = g.rate * (g.auto ? 1 : 1.3) + (b.burst-- > 0 ? 0 : rnd(T.rest));
        if (b.burst <= 0){ b.burst = 2 + ((Math.random()*4)|0); rollAim(b); }
        const t = b.target, sh = STANCE[t.st].h;
        // 조준점 — 몸통(하드코어는 가끔 머리) + 거리에 비례한 가로·세로 오차
        const ty = t.y + (b.aimHead ? 1.66 : 1.15)*sh + (Math.random()-0.5)*0.5 + b.aimY*d*T.aim;
        let dx = t.x - b.x, dz = t.z - b.z;
        const hl = Math.hypot(dx, dz) || 1, ox = b.aimX*d*T.aim;
        const px = -dz/hl, pz = dx/hl;          // 표적을 보는 방향의 옆
        dx += px*ox; dz += pz*ox;
        const dy = ty - (b.y + 1.52*STANCE[b.st].h), L = Math.hypot(dx,dy,dz);
        fireFrom(b, dx/L, dy/L, dz/L);
        if (b.fresh > 0) b.fresh--;
      }
    }
    if (T.move >= 5 && b.hp < 40 && !(b.coverT > 0) && Math.random() < dt) findCover(b, b.target);
  } else {
    const dx = b.tx-b.x, dz = b.tz-b.z, d = Math.hypot(dx,dz);
    if (d > 1.5){ mx = dx/d; mz = dz/d; b.yaw = Math.atan2(dx,dz); run = outOfZone(b); }
  }
  const ml = Math.hypot(mx, mz); if (ml > 1){ mx /= ml; mz /= ml; }
  const sp = (run ? 7.4 : 4.3) * dt;
  if (b.detourT > 0){                          // 우회 중 — 정한 방향으로 잠깐 돌아간다
    b.detourT -= dt;
    mx = Math.sin(b.detourA); mz = Math.cos(b.detourA);
    if (!b.target) b.yaw = b.detourA;
  }
  const ox = b.x, oz = b.z;
  moveEnt(b, mx*sp, mz*sp);
  if ((mx || mz) && sp > 0){                   // 직선으로만 가면 벽·모서리에 끼어 그대로 선다
    const got = Math.hypot(b.x-ox, b.z-oz);
    b.stuckT = got < sp*0.3 ? (b.stuckT || 0) + dt : 0;
    if (b.stuckT > 0.4){ b.stuckT = 0; botDetour(b, Math.atan2(mx, mz)); }
  }
  b.y = heightAt(b.x, b.z);
}
function botDetour(b, a){
  if (blocked(b.x, b.y, b.z, BODY_R)){         // 벽 속에 내렸으면 가까운 빈 자리로 빼 준다
    for (let r = 0.5; r <= 3; r += 0.5)
      for (let i = 0; i < 8; i++){
        const t = i * Math.PI/4, x = b.x + Math.sin(t)*r, z = b.z + Math.cos(t)*r;
        if (!blocked(x, b.y, z, BODY_R)){ b.x = x; b.z = z; return; }
      }
  }
  const side = Math.random() < 0.5 ? 1 : -1;
  for (const off of [0.8, -0.8, 1.6, -1.6, 2.4, -2.4, Math.PI]){
    const t = a + off*side, x = b.x + Math.sin(t)*1.5, z = b.z + Math.cos(t)*1.5;
    if (!blocked(x, b.y, z, BODY_R)){ b.detourA = t; b.detourT = 0.7 + Math.random()*0.9; return; }
  }
}

// ══ 이동 ══════════════════════════════════════════════════════
function moveEnt(e, dx, dz){
  const nx = e.x + dx;
  if (Math.abs(nx) < HALF-4 && !blocked(nx, e.y, e.z, BODY_R)) e.x = nx;
  const nz2 = e.z + dz;
  if (Math.abs(nz2) < HALF-4 && !blocked(e.x, e.y, nz2, BODY_R)) e.z = nz2;
}
const keys = {};
let locked = false, playing = false, firing = false;
function movePlayer(dt){
  const p = me();
  const run = (keys.ShiftLeft || keys.ShiftRight) && p.healT <= 0 && p.st === 0;
  const boostSp = p.boost > 0 ? 1.08 : 1;
  const sp = (p.healT > 0 ? 0 : (run ? RUN : WALK))
           * STANCE[p.st].spd * (scoped ? 0.55 : 1) * boostSp;
  const y = yawO.rotation.y;
  let mx=0, mz=0;
  if (keys.KeyW){ mx -= Math.sin(y); mz -= Math.cos(y); }
  if (keys.KeyS){ mx += Math.sin(y); mz += Math.cos(y); }
  if (keys.KeyD){ mx += Math.cos(y); mz -= Math.sin(y); }
  if (keys.KeyA){ mx -= Math.cos(y); mz += Math.sin(y); }
  const L = Math.hypot(mx,mz);
  if (L > 0){ mx/=L; mz/=L; if (p.healT > 0){ p.healT = 0; hudGun(); } }
  moveEnt(p, mx*sp*dt, mz*sp*dt);

  const gy = heightAt(p.x, p.z);
  let floor = gy;
  for (const c of cols){                        // 지붕·바닥 위에 설 수 있게
    if (p.x > c.x-c.hw && p.x < c.x+c.hw && p.z > c.z-c.hd && p.z < c.z+c.hd){
      if (c.y1 <= p.y + 0.6 && c.y1 > floor) floor = c.y1;
    }
  }
  p.vy -= GRAV*dt;
  if (keys.Space && p.onGround && p.st === 0){ p.vy = JUMP; p.onGround = false; }
  p.y += p.vy*dt;
  if (p.y <= floor){ p.y = floor; p.vy = 0; p.onGround = true; } else p.onGround = false;
  yawO.position.set(p.x, p.y + eyeH(p), p.z);
}

// ══ 줍기 ══════════════════════════════════════════════════════
let nearLoot = -1, nearLootD = 1e9;
// E 로 쓸 대상 — 보급 상자·전리품·지프 중 가장 가까운 것 (예전엔 지프 4.2m 안이면 지프만 됐다)
function useTarget(){
  const p = me(), c = nearCare(), car = nearCar();
  const opts = [];
  if (c) opts.push({ k:'care', d:Math.hypot(c.x-p.x, c.z-p.z), o:c });
  if (nearLoot >= 0) opts.push({ k:'loot', d:nearLootD });
  if (car) opts.push({ k:'car', d:Math.hypot(car.x-p.x, car.z-p.z) });
  opts.sort((a,b) => a.d - b.d);
  return opts[0] || null;
}
// ── 가방 무게 · 용량
const bagCap = (p) => BAG_CAP[p.bagLv];
function bagW(p){
  let w = 0;
  for (const k of AMMO_ORDER) w += p.bag[k] * AMMO[k].w;
  for (const k of HEAL_ORDER) w += p.inv[k] * HEAL_W[k];
  return w;
}
function itemName(it){
  switch (it.kind){
    case LOOT.GUN:  return GUNS[it.gun].n + ' (' + it.ld + '발 장전)';
    case LOOT.AMMO: return AMMO[it.am].n + ' ×' + it.n;
    case LOOT.HEAL: return HEALS[HEAL_ORDER[it.sub]].n + (it.n > 1 ? ' ×' + it.n : '');
    case LOOT.HELM: return '헬멧 Lv' + it.sub;
    case LOOT.VEST: return '방탄복 Lv' + it.sub;
    case LOOT.BAG:  return '가방 Lv' + it.sub;
    case LOOT.BOX:  return it.name;
  }
  return '?';
}
// 발밑에 버린다 (조금 흩어서)
function dropItem(it){
  const p = me(), a = Math.random()*6.283, r = 0.5 + Math.random()*0.6;
  return addLoot(it, p.x + Math.cos(a)*r, p.y + 0.35, p.z + Math.sin(a)*r);
}
// 총을 손에 든다. 권총은 3번 칸, 나머지는 1·2번. 칸이 차 있으면 들던 총은 장전 탄째로 발밑에.
function equipGun(gi, ld){
  const p = me(), g = GUNS[gi];
  let sl;
  if (g.k === 'pistol') sl = 2;
  else sl = p.guns[0] === null ? 0 : p.guns[1] === null ? 1 : (p.slot < 2 ? p.slot : 0);
  if (p.guns[sl] !== null) dropItem({ kind:LOOT.GUN, gun:p.guns[sl], ld:p.ammo[sl] });
  p.guns[sl] = gi; p.ammo[sl] = ld;
  p.slot = sl; p.reload = 0; setScope(false); buildView();
}
// 하나 줍기. null = 다 주웠다 · 'part' = 일부만 (가방이 참) · 그 밖의 글자 = 못 줍는 이유
function takeItem(it){
  const p = me(), room = bagCap(p) - bagW(p) + 1e-9;
  switch (it.kind){
    case LOOT.GUN:
      equipGun(it.gun, it.ld); feed('<i>획득</i> ' + GUNS[it.gun].n);
      return null;
    case LOOT.AMMO: {
      const t = Math.min(it.n, Math.floor(room / AMMO[it.am].w));
      if (t <= 0) return '가방이 가득 찼다 (' + Math.round(bagW(p)) + '/' + bagCap(p) + ')';
      p.bag[it.am] += t; it.n -= t; feed('<i>획득</i> ' + AMMO[it.am].n + ' ' + t + '발');
      return it.n > 0 ? 'part' : null;
    }
    case LOOT.HEAL: {
      const k = HEAL_ORDER[it.sub], n = it.n || 1, t = Math.min(n, Math.floor(room / HEAL_W[k]));
      if (t <= 0) return '가방이 가득 찼다 — ' + HEALS[k].n + ' ' + HEAL_W[k] + ' 필요';
      p.inv[k] += t; it.n = n - t; feed('<i>획득</i> ' + HEALS[k].n + (t > 1 ? ' ×' + t : ''));
      return it.n > 0 ? 'part' : null;
    }
    case LOOT.HELM:
      if (it.sub <= p.helm) return '더 좋은 헬멧을 쓰고 있다';
      if (p.helm) dropItem({ kind:LOOT.HELM, sub:p.helm, dur:p.helmD });
      p.helm = it.sub; p.helmD = it.dur ?? ARMOR[it.sub].dur; feed('<i>착용</i> 헬멧 Lv' + it.sub);
      return null;
    case LOOT.VEST:
      if (it.sub <= p.vest) return '더 좋은 방탄복을 입고 있다';
      if (p.vest) dropItem({ kind:LOOT.VEST, sub:p.vest, dur:p.vestD });
      p.vest = it.sub; p.vestD = it.dur ?? ARMOR[it.sub].dur; feed('<i>착용</i> 방탄복 Lv' + it.sub);
      return null;
    case LOOT.BAG:
      if (it.sub <= p.bagLv) return '더 큰 가방을 메고 있다';
      if (p.bagLv) dropItem({ kind:LOOT.BAG, sub:p.bagLv });
      p.bagLv = it.sub; feed('<i>착용</i> 가방 Lv' + it.sub + ' (' + bagCap(p) + ')');
      return null;
  }
  return '못 줍는다';
}
// 바닥 전리품 i 줍기 (상자는 인벤토리로 연다)
function takeLoot(i){
  const l = loots[i];
  if (!l || l.taken) return;
  if (l.kind === LOOT.BOX){ openInv(); return; }
  const r = takeItem(l);
  if (r === null){ l.taken = true; hideLoot(i); if (nearLoot === i) nearLoot = -1; sTake(); }
  else if (r === 'part'){ sTake(); why('가방이 가득 차 일부만 주웠다'); }
  else why(r);
  hudGun(); if (invOpen) renderInv();
}
// 상자 안의 한 칸 줍기
function takeFromBox(i, j){
  const l = loots[i];
  if (!l || l.taken || l.kind !== LOOT.BOX) return;
  const it = l.items[j], r = takeItem(it);
  if (r === null) l.items.splice(j, 1);
  if (r !== null && r !== 'part') why(r); else sTake();
  if (r === 'part') why('가방이 가득 차 일부만 주웠다');
  if (!l.items.length){ l.taken = true; hideLoot(i); }
  hudGun(); if (invOpen) renderInv();
}
// 봇이 죽은 자리에 그 봇의 총·탄·회복템 상자
function deathBox(e){
  const items = [];
  const gi = e.guns[0];
  if (gi !== null && gi !== undefined){
    items.push({ kind:LOOT.GUN, gun:gi, ld:e.ammo[0] });
    items.push({ kind:LOOT.AMMO, am:GUNS[gi].am, n:GUNS[gi].mag * 2 });
  }
  HEAL_ORDER.forEach((k, sub) => { if (e.inv[k] > 0) items.push({ kind:LOOT.HEAL, sub, n:e.inv[k] }); });
  if (!items.length) return;
  addLoot({ kind:LOOT.BOX, name:e.name + ' 상자', items }, e.x, heightAt(e.x, e.z) + 0.45, e.z);
}
function scanLoot(){
  const p = me();
  nearLoot = -1; nearLootD = 1e9;
  let bd = 2.6;
  for (let i=0;i<loots.length;i++){
    const l = loots[i];
    if (l.taken) continue;
    const d = Math.hypot(l.x-p.x, l.z-p.z) + Math.abs(l.y-p.y)*0.6;
    if (d < bd){ bd = d; nearLoot = i; nearLootD = d; }
  }
  const u = useTarget();
  if (u && u.k === 'car'){ promptEl.style.display='block'; promptEl.querySelector('span').textContent='지프 탑승'; return; }
  if (u && u.k === 'care'){ promptEl.style.display='block'; promptEl.querySelector('span').textContent='보급 상자 열기'; return; }
  if (nearLoot < 0){ promptEl.style.display = 'none'; return; }
  const l = loots[nearLoot];
  promptEl.style.display = 'block';
  promptEl.querySelector('span').textContent = l.kind === LOOT.BOX ? l.name + ' 열기'
    : (l.kind === LOOT.HELM || l.kind === LOOT.VEST || l.kind === LOOT.BAG) ? itemName(l) + ' 착용'
    : itemName(l) + ' 줍기';
}
function pickUp(){
  const p = me();
  if (riding){ toggleRide(); return; }
  const u = useTarget();
  if (!u) return;
  if (u.k === 'car'){ toggleRide(); return; }
  const cc = u.k === 'care' ? u.o : null;
  if (cc){                                       // 보급 상자 — 저격 · 7.62 · 3레벨 장비 · 구급킷
    cc.taken = true; scene.remove(cc.mesh);
    equipGun(4, GUNS[4].mag);
    for (const it of [{ kind:LOOT.AMMO, am:'7.62', n:15 }, { kind:LOOT.HEAL, sub:2, n:1 }]){
      const r = takeItem(it);
      if (r !== null) dropItem(it);              // 가방에 안 들어간 만큼은 발밑에
    }
    p.helm = 3; p.helmD = ARMOR[3].dur; p.vest = 3; p.vestD = ARMOR[3].dur;
    feed('<s>보급</s> 저격 · 3레벨 장비'); sTake(); hudGun();
    return;
  }
  if (nearLoot < 0) return;
  takeLoot(nearLoot);
  promptEl.style.display = 'none';
}
// ══ 인벤토리 (Tab) ════════════════════════════════════════════
// 열면 마우스 잠금을 풀고 게임은 계속 간다. 왼쪽 주변(3m) · 가운데 가방 · 오른쪽 장비.
// 클릭 = 줍기/사용/선택, 우클릭 = 버리기 (탄·회복템은 전부/절반). 목록은 DOM 으로 만든다.
let invOpen = false, invT = 0;
const invEl = document.getElementById('inv');
const invNear = document.getElementById('invNear'), invBag = document.getElementById('invBag'), invEq = document.getElementById('invEq');
const invW = document.getElementById('invW'), invMenu = document.getElementById('invMenu');
function openInv(){
  if (invOpen || !playing || over) return;
  invOpen = true; invEl.hidden = false; firing = false; setScope(false);
  pauseEl.hidden = true;                         // 일부러 푼 잠금이다 — '잠금 해제됨' 안내는 안 띄운다
  if (document.pointerLockElement) document.exitPointerLock();
  renderInv();
}
function closeInv(noLock){
  if (!invOpen) return;
  invOpen = false; invEl.hidden = true; invMenu.hidden = true;
  if (!noLock && playing && !over) lockMouse();
}
function el(tag, cls, text){
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  if (text !== undefined) d.textContent = text;
  return d;
}
function row(text, sub, onClick, onRight){
  const r = el('div', 'row' + (onClick ? ' act' : ''));
  r.appendChild(el('span', '', text));
  if (sub) r.appendChild(el('i', '', sub));
  if (onClick) r.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  if (onRight) r.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); onRight(e); });
  return r;
}
function menu(e, opts){                          // 우클릭 — 수량 고르기
  invMenu.replaceChildren(...opts.map(([t, f]) => { const b = el('button', '', t); b.addEventListener('click', (ev) => { ev.stopPropagation(); invMenu.hidden = true; f(); }); return b; }));
  const box = invEl.getBoundingClientRect();
  invMenu.style.left = Math.min(e.clientX - box.left, box.width - 130) + 'px';
  invMenu.style.top = (e.clientY - box.top) + 'px';
  invMenu.hidden = false;
}
function dropAmmo(k, n){
  const p = me(); n = Math.min(n, p.bag[k]); if (n <= 0) return;
  p.bag[k] -= n; dropItem({ kind:LOOT.AMMO, am:k, n }); feed('<i>버림</i> ' + AMMO[k].n + ' ' + n + '발');
  hudGun(); renderInv();
}
function dropHeal(k, n){
  const p = me(); n = Math.min(n, p.inv[k]); if (n <= 0) return;
  if (p.healKind === k && p.inv[k] - n <= 0){ p.healT = 0; p.healKind = null; }
  p.inv[k] -= n; dropItem({ kind:LOOT.HEAL, sub:HEAL_ORDER.indexOf(k), n }); feed('<i>버림</i> ' + HEALS[k].n + (n > 1 ? ' ×' + n : ''));
  hudGun(); renderInv();
}
function dropGun(sl){
  const p = me(); if (p.guns[sl] === null) return;
  dropItem({ kind:LOOT.GUN, gun:p.guns[sl], ld:p.ammo[sl] }); feed('<i>버림</i> ' + GUNS[p.guns[sl]].n);
  p.guns[sl] = null; p.ammo[sl] = 0;
  if (p.slot === sl){ p.reload = 0; const o = [0,1,2].find(i => p.guns[i] !== null); p.slot = o === undefined ? sl : o; setScope(false); buildView(); }
  hudGun(); renderInv();
}
function dropGear(kind){
  const p = me();
  if (kind === LOOT.HELM && p.helm){ dropItem({ kind, sub:p.helm, dur:p.helmD }); p.helm = 0; p.helmD = 0; }
  else if (kind === LOOT.VEST && p.vest){ dropItem({ kind, sub:p.vest, dur:p.vestD }); p.vest = 0; p.vestD = 0; }
  else if (kind === LOOT.BAG && p.bagLv){
    if (bagW(p) > BAG_CAP[0]){ why('가방을 벗으면 ' + BAG_CAP[0] + ' 를 넘는다 — 먼저 덜어 내라'); return; }
    dropItem({ kind, sub:p.bagLv }); p.bagLv = 0;
  }
  hudGun(); renderInv();
}
const half = (n) => Math.max(1, Math.ceil(n / 2));
function renderInv(){
  if (!invOpen) return;
  const p = me();
  invW.textContent = '무게 ' + Math.round(bagW(p)) + ' / ' + bagCap(p);
  // 주변 3m
  const near = [];
  loots.forEach((l, i) => {
    if (l.taken || Math.hypot(l.x-p.x, l.z-p.z) > 3 || Math.abs(l.y-p.y) > 2.5) return;
    if (l.kind === LOOT.BOX){
      near.push(el('div', 'grp', l.name));
      l.items.forEach((it, j) => near.push(row(itemName(it), null, () => takeFromBox(i, j))));
    } else near.push(row(itemName(l), null, () => takeLoot(i)));
  });
  invNear.replaceChildren(...(near.length ? near : [el('div', 'none', '주변에 아무것도 없다')]));
  // 가방
  const bag = [];
  for (const k of AMMO_ORDER) if (p.bag[k] > 0){
    const n = p.bag[k];
    bag.push(row(AMMO[k].n, n + '발 · ' + Math.round(n * AMMO[k].w * 10)/10, null,
      (e) => menu(e, [['전부 버리기 (' + n + ')', () => dropAmmo(k, n)], ['절반 버리기 (' + half(n) + ')', () => dropAmmo(k, half(n))]])));
  }
  for (const k of HEAL_ORDER) if (p.inv[k] > 0){
    const n = p.inv[k];
    bag.push(row(HEALS[k].n + ' ×' + n, '클릭 사용 · ' + n * HEAL_W[k], () => heal(k),
      (e) => menu(e, [['전부 버리기 (' + n + ')', () => dropHeal(k, n)], ['절반 버리기 (' + half(n) + ')', () => dropHeal(k, half(n))]])));
  }
  invBag.replaceChildren(...(bag.length ? bag : [el('div', 'none', '비었다')]));
  // 장비
  const eq = [];
  ['주무기 1', '주무기 2', '권총'].forEach((t, i) => {
    const gi = p.guns[i];
    eq.push(row((i+1) + ' ' + t + ' — ' + (gi === null ? '빈 칸' : GUNS[gi].n), gi === null ? null : p.ammo[i] + '발 · ' + AMMO[GUNS[gi].am].n + (i === p.slot ? ' · 손에' : ''),
      gi === null ? null : () => { swapGun(i); renderInv(); }, gi === null ? null : () => dropGun(i)));
  });
  eq.push(row('헬멧 — ' + (p.helm ? 'Lv' + p.helm : '없음'), p.helm ? '내구 ' + Math.round(p.helmD) : null, null, p.helm ? () => dropGear(LOOT.HELM) : null));
  eq.push(row('방탄복 — ' + (p.vest ? 'Lv' + p.vest : '없음'), p.vest ? '내구 ' + Math.round(p.vestD) : null, null, p.vest ? () => dropGear(LOOT.VEST) : null));
  eq.push(row('가방 — ' + (p.bagLv ? 'Lv' + p.bagLv : '없음'), '용량 ' + bagCap(p), null, p.bagLv ? () => dropGear(LOOT.BAG) : null));
  invEq.replaceChildren(...eq);
}
invEl.addEventListener('click', () => { invMenu.hidden = true; });
invEl.addEventListener('contextmenu', (e) => e.preventDefault());

// 배그처럼 종류별로 올라가는 상한과 시간이 다르다
function heal(kind){
  const p = me();
  if (p.drop !== 'ground' || riding) return;
  if (!kind){                                    // F — 지금 쓸 만한 것을 알아서 고른다
    if (p.hp < 40 && p.inv.med > 0) kind = 'med';
    else if (p.hp < 70 && p.inv.kit > 0) kind = 'kit';
    else if (p.hp < 74 && p.inv.band > 0) kind = 'band';
    else if (p.inv.drink > 0) kind = 'drink';
    else if (p.inv.kit > 0) kind = 'kit';
    else if (p.inv.med > 0) kind = 'med';
  }
  if (!kind || p.inv[kind] <= 0 || p.healT > 0) return;
  if (invOpen) closeInv();                      // 인벤토리에서 눌렀으면 닫고 쓴다
  const H = HEALS[kind];
  if (H.cap && p.hp >= H.cap) { feed('<i>'+H.n+'으로는 더 못 올린다</i>'); return; }
  p.healT = H.t; p.healKind = kind;
  sMed(); hudGun();
}
function finishHeal(){
  const p = me(), kind = p.healKind, H = HEALS[kind];
  p.healKind = null;
  if (!H || p.inv[kind] <= 0) return;
  p.inv[kind]--;
  if (kind === 'drink') p.boost = Math.min(100, p.boost + H.boost);
  else p.hp = Math.max(p.hp, Math.min(H.cap, p.hp + H.hp));   // 부스트로 cap 위에 있으면 깎지 않는다
  hudGun();
}

// ══ HUD ═══════════════════════════════════════════════════════
const hudEl = document.getElementById('hud');
const veil = document.getElementById('veil');
const playBtn = document.getElementById('play');
const dmgEl = document.getElementById('dmg');
const zoneFx = document.getElementById('zonefx');
const scopeEl = document.getElementById('scope');
const promptEl = document.getElementById('prompt');
const feedEl = document.getElementById('feed');
const aliveEl = document.querySelector('#alive b');
const zoneEl = document.getElementById('zone'), zoneB = zoneEl.querySelector('b');
const hpBar = document.getElementById('hpbar'), hpFill = hpBar.querySelector('s');
const vitL = document.querySelector('#vit .l');
const gunN = document.querySelector('#gun .n'), gunA = document.querySelector('#gun .a');
const gunR = document.querySelector('#gun .r'), gunS = document.querySelector('#gun .s');
const hitEl = document.getElementById('hit');
const crossEl = document.getElementById('cross'), crossBars = crossEl.querySelectorAll('i');
const mapC = document.getElementById('map').getContext('2d');
const feeds = [];
function feed(html){
  feeds.push({ html, t:4.5 });
  if (feeds.length > 5) feeds.shift();
  feedEl.innerHTML = feeds.map(f => '<div>'+f.html+'</div>').join('');
}
function hudGun(){
  const p = me(), gi = p.guns[p.slot];
  const g = gi !== null ? GUNS[gi] : null;
  gunN.textContent = g ? g.n : '맨손';
  gunA.innerHTML = g ? (p.ammo[p.slot] + ' <s>/ ' + AMMO[g.am].n + ' ' + p.bag[g.am] + '</s>') : '— <s>/ —</s>';
  gunR.textContent = p.reload > 0 ? '재장전…' : (p.healT > 0 ? '치료 중…' : '');
  const slots = [0,1,2].map(i => {
    const q = p.guns[i];
    return (i===p.slot ? '<b>' : '') + (i+1) + ' ' + (q===null ? '빈 칸' : GUNS[q].n) + (i===p.slot ? '</b>' : '');
  }).join('   ');
  const arm = '헬멧 ' + (p.helm ? '<b>Lv'+p.helm+'</b>' : '—')
            + '  방탄 ' + (p.vest ? '<b>Lv'+p.vest+'</b>' : '—');
  const inv = '붕대 <b>'+p.inv.band+'</b> 상자 <b>'+p.inv.kit+'</b> 킷 <b>'+p.inv.med+'</b> 드링크 <b>'+p.inv.drink+'</b>'
            + '  가방 ' + (p.bagLv ? 'Lv'+p.bagLv : '—') + ' <b>' + Math.round(bagW(p)) + '/' + bagCap(p) + '</b>';
  gunS.innerHTML = slots + '<br>' + arm + '<br>' + inv;
  hpFill.style.width = Math.max(0, p.hp) + '%';
  hpBar.classList.toggle('low', p.hp < 35);
  vitL.textContent = 'HP ' + Math.max(0, Math.round(p.hp))
    + (p.boost > 0 ? '  부스트 ' + Math.round(p.boost) : '')
    + '   ' + (riding ? '지프' : STANCE[p.st].n)
    + '   처치 ' + kills + '   명중 ' + (shots ? Math.round(hits/shots*100) : 0) + '%';
}
function drawMap(){
  const S = 264, k = S / (HALF*2);
  mapC.clearRect(0,0,S,S);
  mapC.fillStyle = '#121a16'; mapC.fillRect(0,0,S,S);
  const X = v => (v + HALF) * k, Z = v => (v + HALF) * k;
  mapC.strokeStyle = '#2b3a33'; mapC.lineWidth = 1;
  for (const h of houses){ mapC.strokeRect(X(h.x-h.w/2), Z(h.z-h.d/2), h.w*k, h.d*k); }
  mapC.strokeStyle = 'rgba(90,180,255,.95)'; mapC.lineWidth = 2;
  mapC.beginPath(); mapC.arc(X(zone.cx), Z(zone.cz), zone.r*k, 0, 6.3); mapC.stroke();
  if (zone.phase < PHASES.length && !zone.moving){
    mapC.strokeStyle = 'rgba(255,255,255,.4)'; mapC.setLineDash([4,4]);
    mapC.beginPath(); mapC.arc(X(zone.nx), Z(zone.nz), zone.nr*k, 0, 6.3); mapC.stroke();
    mapC.setLineDash([]);
  }
  if (red.on){
    mapC.strokeStyle = 'rgba(255,77,58,.9)'; mapC.lineWidth = 2;
    mapC.beginPath(); mapC.arc(X(red.x), Z(red.z), RED_R*k, 0, 6.3); mapC.stroke();
  }
  for (const c of cares){
    if (c.taken) continue;
    mapC.fillStyle = '#ffb03a';
    mapC.fillRect(X(c.x)-3, Z(c.z)-3, 6, 6);
  }
  for (const c of cars){
    mapC.fillStyle = '#8fb46a';
    mapC.fillRect(X(c.x)-2, Z(c.z)-2, 4, 4);
  }
  for (const e of ents){
    if (!e.alive) continue;
    if (e === me()){
      mapC.fillStyle = '#fff';
      mapC.beginPath(); mapC.arc(X(e.x), Z(e.z), 4, 0, 6.3); mapC.fill();
      mapC.strokeStyle = '#ff9d2e'; mapC.lineWidth = 2;
      mapC.beginPath(); mapC.moveTo(X(e.x), Z(e.z));
      mapC.lineTo(X(e.x) - Math.sin(yawO.rotation.y)*12, Z(e.z) - Math.cos(yawO.rotation.y)*12);
      mapC.stroke();
    } else if (performance.now() - (e.lastShot || -1e9) < 3000){   // 총소리를 낸 적만 3초
      mapC.fillStyle = '#ff5a4e';
      mapC.fillRect(X(e.x)-2, Z(e.z)-2, 4, 4);
    }
  }
}

// ══ 경기 흐름 ═════════════════════════════════════════════════
let over = false;
const aliveN = () => ents.filter(e => e.alive).length;
function checkWin(){
  if (over) return;
  if (aliveN() === 1 && me().alive){ placed = 1; finish(true); }
}
function finish(won){
  if (over) return;
  over = true; playing = false;
  if (document.pointerLockElement) document.exitPointerLock();
  placed = won ? 1 : aliveN() + (me().alive ? 0 : 1);
  document.getElementById('lead').hidden = true;
  document.querySelector('.keys').hidden = true;
  const rk = document.getElementById('rank'), st = document.getElementById('stats');
  rk.hidden = false; st.hidden = false;
  rk.innerHTML = won ? '<u>승리</u>최후의 1인' : '<u>#' + placed + '</u>' + N_ENT + '명 중';
  if (won) me().place = 1;
  // 순위표 — 난이도는 여기서 처음 보인다. 내가 먼저 죽으면 남은 봇은 '생존'
  const rows = ents.slice().sort((a,b) => (a.place||0) - (b.place||0));
  const bd = document.getElementById('board');
  bd.hidden = false;
  bd.innerHTML = rows.map(e => '<div' + (e === me() ? ' class="me"' : '') + '><b>'
    + (e.place ? '#' + e.place : '생존') + '</b>' + tag(e) + '<i>' + e.kills + '킬</i></div>').join('');
  st.textContent = '처치 ' + kills + '   ·   명중률 '
    + (shots ? Math.round(hits/shots*100) : 0) + '%   ·   발사 ' + shots + '발';
  playBtn.textContent = '다시 한 판';
  if (invOpen) closeInv(true);
  pauseEl.hidden = true;
  playBtn.disabled = false;
  veil.hidden = false;
  if (won) sKill(); else sHurt();
}

// ══ 입력 ══════════════════════════════════════════════════════
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
  if (playing && !over && e.code === 'Tab' && !e.repeat){ invOpen ? closeInv() : openInv(); return; }
  if (invOpen && e.code === 'Escape'){ closeInv(); return; }
  if (!playing || !(locked || invOpen)) return;   // 인벤토리를 연 동안에도 줍기·회복·무기 교체는 된다
  if (e.code === 'KeyR') startReload();
  if (e.code === 'KeyE') pickUp();
  if (e.code === 'KeyF') heal();
  if (e.code === 'KeyC') setStance(1);
  if (e.code === 'KeyZ') setStance(2);
  if (e.code === 'Digit1') swapGun(0);
  if (e.code === 'Digit2') swapGun(1);
  if (e.code === 'Digit3') swapGun(2);          // 3 = 권총 (예전 3~6 회복 단축키는 없앴다 — F 와 인벤토리 클릭)
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; firing = false; });
// 포인터 락은 브라우저가 거절할 수 있다 (Esc 직후, 헤드리스 등).
// 거절돼도 게임은 그대로 돌아가야 하니 거부를 삼킨다.
function lockMouse(){
  const p = canvas.requestPointerLock();
  if (p && p.catch) p.catch(() => {});
}
const pauseEl = document.getElementById('pause'), whyEl = document.getElementById('why');
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked){ firing = false; for (const k in keys) keys[k] = false; }
  // 잠금이 풀리면 무방비다 — 게임은 안 멈추니 그걸 분명히 알린다
  pauseEl.hidden = locked || !playing || over || invOpen;
});
pauseEl.addEventListener('click', () => { if (playing && !over) lockMouse(); });
document.addEventListener('pointerlockerror', () => { if (playing && !over && !invOpen) pauseEl.hidden = false; });
let whyTimer = 0;
function why(msg){                               // 못 쏘는 이유를 화면 가운데 잠깐
  whyEl.textContent = msg; whyEl.hidden = false;
  clearTimeout(whyTimer); whyTimer = setTimeout(() => { whyEl.hidden = true; }, 900);
}
function cantShoot(){
  const p = me(), gi = p.guns[p.slot];
  if (p.drop !== 'ground') return '착지 전에는 못 쏜다';
  if (riding) return '운전 중 — E 로 내린다';
  if (gi === null) return '총이 없다';
  if (p.healT > 0) return '치료 중';
  if (p.reload > 0) return '재장전 중';
  if (p.ammo[p.slot] <= 0 && p.bag[GUNS[gi].am] <= 0) return '탄약 없음 — ' + AMMO[GUNS[gi].am].n;
  return null;
}
canvas.addEventListener('mousedown', (e) => {
  if (!playing){ return; }
  if (!locked){ lockMouse(); return; }
  if (e.button === 0){ const w = cantShoot(); if (w) why(w); }
  if (e.button === 0) firing = true;
  if (e.button === 2) setScope(true);
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) firing = false;
  if (e.button === 2) setScope(false);
});
addEventListener('contextmenu', (e) => { if (playing) e.preventDefault(); });
addEventListener('mousemove', (e) => {
  if (!locked) return;
  const s = 0.0021 * (scoped ? 0.45 : 1);
  yawO.rotation.y -= e.movementX * s;
  pitO.rotation.x -= e.movementY * s;
  const L = Math.PI/2 - 0.02;
  pitO.rotation.x = Math.max(-L, Math.min(L, pitO.rotation.x));
});
addEventListener('resize', resize);
function resize(){
  const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
  cam.aspect = w/h; cam.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

// ══ 루프 ══════════════════════════════════════════════════════
let last = performance.now(), hudT = 0;
function frame(now){
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last)/1000);
  last = now;
  if (playing && !over && matchState === 'drop'){
    updateDrop(dt);
    elapsed += dt;
  }
  // 내가 먼저 내렸으면 남이 다 내릴 때까지 기다리지 않는다 — 착지하자마자 걷고 줍고 쏜다
  const landed = matchState === 'drop' && me().drop === 'ground';
  if (playing && !over && matchState === 'drop' && !landed){
    // 먼저 내린 봇은 남이 다 내릴 때까지 서 있지 않는다 — 착지하자마자 움직인다
    for (const e of ents){
      if (!e.alive || e.drop !== 'ground') continue;
      if (e.bot) updateBot(e, dt);
      if (e.mesh){ e.mesh.position.set(e.x, e.y, e.z); e.mesh.rotation.y = e.yaw; e.mesh.scale.y = STANCE[e.st].h; }
    }
  }
  if (playing && !over && (matchState === 'live' || landed)){
    const live = matchState === 'live';          // 자기장·레드존·보급·지프는 전원 착지 뒤부터
    if (live){
      elapsed += dt;
      if (careIdx < CARE_AT.length && elapsed > CARE_AT[careIdx]){ careIdx++; dropCare(); }
      updateRed(dt); updateCares(dt);
    }
    updateCars(dt);                              // 지프는 내가 내렸으면 바로 몬다
    if (!riding && (locked || invOpen)) movePlayer(dt);   // 인벤토리를 열어도 걸을 수 있다
    const p = me();
    // 치료
    if (p.healT > 0){
      p.healT -= dt;
      if (p.healT <= 0) finishHeal();
    }
    if (p.boost > 0){                            // 부스트는 천천히 체력으로 바뀐다
      const g = Math.min(p.boost, dt * 2.4);
      p.boost -= g;
      if (p.hp < 100) p.hp = Math.min(100, p.hp + g * 0.9);
    }
    if (p.cd > 0) p.cd -= dt;
    if (p.reload > 0){
      p.reload -= dt;
      if (p.reload <= 0){
        const g = GUNS[p.guns[p.slot]];
        const need = g.mag - p.ammo[p.slot], take = Math.min(need, p.bag[g.am]);
        p.ammo[p.slot] += take; p.bag[g.am] -= take; hudGun();
      }
    }
    if (firing && locked) myShoot();
    // 반동 회복
    const back = Math.min(1, dt*7);
    if (Math.abs(kickP) > 1e-5){ pitO.rotation.x -= kickP*back; kickP *= (1-back); }
    if (Math.abs(kickY) > 1e-5){ yawO.rotation.y -= kickY*back; kickY *= (1-back); }
    bloom = Math.max(0, bloom - dt*1.5);

    for (const e of ents){
      if (!e.alive){
        if (e.mesh && e.fall < 1){ e.fall = Math.min(1, e.fall + dt*2.4); e.mesh.rotation.z = -e.fall*1.57; }
        continue;
      }
      if (e.bot) updateBot(e, dt);
      if (e.mesh){
        e.mesh.position.set(e.x, e.y, e.z);
        e.mesh.rotation.y = e.yaw;
        e.mesh.scale.y = STANCE[e.st].h;
      }
      if (live && outOfZone(e)){                 // 매 프레임이 아니라 0.5초마다 모아서
        const dps = ZONE_DPS[Math.min(ZONE_DPS.length-1, zone.phase)];
        e.zoneAcc = (e.zoneAcc || 0) + dps*dt; e.zoneT = (e.zoneT || 0) + dt;
        if (e.zoneT >= 0.5){ hurt(e, e.zoneAcc, null, null); e.zoneAcc = 0; e.zoneT = 0; }
      } else { e.zoneAcc = 0; e.zoneT = 0; }
    }
    if (live) updateZone(dt);
    zoneFx.style.opacity = live && outOfZone(me()) ? '1' : '0';
    scanLoot();
    if (invOpen && (invT -= dt) <= 0){ invT = 0.25; if (invMenu.hidden) renderInv(); }
    if (hitT > 0){
      hitT -= dt;
      hitEl.style.opacity = String(Math.max(0, hitT/0.13));
    }
    for (let i=feeds.length-1;i>=0;i--){
      feeds[i].t -= dt;
      if (feeds[i].t <= 0){ feeds.splice(i,1); feedEl.innerHTML = feeds.map(f=>'<div>'+f.html+'</div>').join(''); }
    }
    // 크로스헤어 퍼짐
    const gi = me().guns[me().slot];
    const sp = (gi !== null ? GUNS[gi].spread : 0.02) * (1 + bloom*1.7) * (scoped?0.3:1);
    const gap = Math.max(3, Math.round(sp / Math.tan(cam.fov*Math.PI/360) * (innerHeight/2)));
    crossBars[0].style.cssText = 'top:'+(-gap-8)+'px;left:0';
    crossBars[1].style.cssText = 'top:'+gap+'px;left:0';
    crossBars[2].style.cssText = 'left:'+(-gap-8)+'px;top:0';
    crossBars[3].style.cssText = 'left:'+gap+'px;top:0';

    hudT += dt;
    if (hudT > 0.15){
      hudT = 0;
      aliveEl.textContent = aliveN();
      const ph = zone.phase >= PHASES.length ? '최종' : (zone.phase+1) + '단계';
      zoneB.textContent = zone.phase >= PHASES.length ? '최종'
        : (zone.moving ? '수축 ' : ph + ' ') + Math.max(0, Math.ceil(zone.t)) + 's';
      zoneEl.classList.toggle('warn', zone.moving || outOfZone(me()) || red.on);
      hudGun(); drawMap();
    }
  }
  if (playing && !over && matchState === 'drop' && !landed){
    hudT += dt;
    if (hudT > 0.15){
      hudT = 0;
      aliveEl.textContent = aliveN();
      const h = Math.max(0, Math.round(me().y - heightAt(me().x, me().z)));
      zoneB.textContent = me().drop === 'plane' ? 'Space 로 이탈'
        : '고도 ' + h + 'm · 착지 ' + Math.ceil(etaLand(me())) + '초';
      drawMap();
    }
  }
  updateFx(dt);
  sun.position.set(me().x - 180, 150, me().z + 120);
  sun.target.position.set(me().x, 0, me().z);
  sun.target.updateMatrixWorld();
  renderer.render(scene, cam);
}

// ══ 시작 ══════════════════════════════════════════════════════
let elapsed = 0;
function boot(){
  buildTerrain();
  buildProps();
  buildLoot();
  makeEnts();
  buildZone();
  buildPlane();
  buildCars();
  buildRed();
  initFx();
  nextPhase();
  // 봇은 항로의 서로 다른 지점에서 뛴다
  planDrops();
  const p = me();
  const pp = planePos(0);
  p.x = pp.x; p.z = pp.z; p.y = PLANE_Y - 3;
  yawO.position.set(p.x, p.y, p.z);
  yawO.rotation.y = Math.atan2(-(plane.bx - plane.ax), -(plane.bz - plane.az));
  pitO.rotation.x = -0.45;
  resize();
  hudGun();
  playBtn.disabled = false;
  playBtn.textContent = '낙하';
  requestAnimationFrame(frame);
}
function start(){
  audio();
  veil.hidden = true;
  hudEl.hidden = false;
  if (over) { location.reload(); return; }     // 다음 판은 새 섬에서
  playing = true;
  feed('<i>수송기 — Space 로 이탈한다</i>');
  lockMouse();
}
playBtn.addEventListener('click', (e) => { e.stopPropagation(); start(); });
veil.addEventListener('click', () => { if (!playBtn.disabled) start(); });
boot();
