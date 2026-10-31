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
// 총 = { gi, ld } — 장전 탄은 총에 붙어 다닌다 (가방에 넣었다 빼도 그대로). lastdrop-06
// 핫바 5칸 e.hot: null | { t:'gun', g } | { t:'heal', k }(회복템 바로가기). 가방 속 총 e.gb: 무게 0, 개수 제한 없음.
const HOT_N = 5;
const heldGun = (e) => { const s = e.hot[e.sel]; return s && s.t === 'gun' ? s.g : null; };
const heldDef = (e) => { const h = heldGun(e); return h ? GUNS[h.gi] : null; };
const allGuns = (e) => e.hot.filter(s => s && s.t === 'gun').map(s => s.g).concat(e.gb);
const ammoOf = (e, h) => h.ld + e.bag[GUNS[h.gi].am];
// 주먹 — 나·봇 공통. 총이 없을 때 최소 대응
const FIST = { range:1.6, dmg:12, rate:0.5 };
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
// ══ 캐릭터 꾸미기 (28 · 29 문서) ═════════════════════════════
// 형태와 색으로만 — 텍스처 없음. 색은 자유(#rrggbb, 무료). 장식은 상점에서 산 것만, 머리·얼굴·등 부위별 1개.
// 저장 형식 v2 = { v:2, hair, skin, hairColor, top, bottom, bag, head, face, back } — 서버 game_accounts.py 가 같은 규칙으로 검사한다.
const AV_PRESET = {                              // 색 고르기의 빠른 칸 (자유 색 선택기도 있다)
  skin:      ['#f6d7b8','#eec39a','#dcaa7e','#c68e5f','#a8703f','#8a5532','#6b3d24','#4a2a19'],
  hairColor: ['#1c1a19','#4a3020','#7a4f2c','#d9b46a','#b5462c','#9a9a9a','#3d5fa8','#d77fa8'],
  top:       ['#b4552f','#2f6f9a','#3d7a3a','#d9c25a','#7a3d8a','#e8e4dc','#2b2b2b','#d1495b'],
  bottom:    ['#2f3a46','#4b5a3a','#6b5a46','#1f2a44','#8a8a8a','#2b2b2b','#7a2f2f','#c9b38a'],
  bag:       ['#5b4a32','#3a4a5b','#4b5a3a','#8a3a2a','#2b2b2b','#c9b38a','#7a3d8a','#2f6f9a'],
};
const AV_COLOR_NAMES = { skin:'피부', hairColor:'머리 색', top:'상의', bottom:'하의', bag:'가방' };
const AV_HAIRS = ['짧은 머리', '긴 머리', '뾰족 머리'];
const AV_SLOTS = { head:'머리', face:'얼굴', back:'등' };
const SHOP_ITEMS = {                             // 이름·부위만 — 가격은 서버가 정한다 (GET /game/api/lastdrop/shop)
  pumpkin:{ n:'할로윈 호박 모자', slot:'head' }, witch:{ n:'마녀 모자', slot:'head' }, beanie:{ n:'비니', slot:'head' },
  cap:{ n:'캡', slot:'head' }, crown:{ n:'왕관', slot:'head' }, sunglasses:{ n:'선글라스', slot:'face' },
  goggles:{ n:'고글', slot:'face' }, skull:{ n:'해골 가면', slot:'face' }, cape:{ n:'망토', slot:'back' }, scarf:{ n:'스카프', slot:'back' },
};
const AV_DEFAULT = { v:2, hair:0, skin:'#eec39a', hairColor:'#4a3020', top:'#b4552f', bottom:'#2f3a46', bag:'#5b4a32', head:null, face:null, back:null };
const HEXC = /^#[0-9a-f]{6}$/;
function avNormalize(a){                         // v1(프리셋 번호) → v2. 이상하면 기본값
  if (!a || typeof a !== 'object') return { ...AV_DEFAULT };
  if (a.v !== 2){
    const pick = (k, i) => AV_PRESET[k][Number.isInteger(i) && i >= 0 && i < 8 ? i : 0];
    return { ...AV_DEFAULT, hair: [0,1,2].includes(a.hair) ? a.hair : 0, skin:pick('skin', a.skin), hairColor:pick('hairColor', a.hairColor),
             top:pick('top', a.top), bottom:pick('bottom', a.bottom), bag:pick('bag', a.bag) };   // 옛 무료 모자(캡·비니)는 상점으로 옮겼다
  }
  const o = { ...AV_DEFAULT };
  if ([0,1,2].includes(a.hair)) o.hair = a.hair;
  for (const k of Object.keys(AV_PRESET)) if (typeof a[k] === 'string' && HEXC.test(a[k])) o[k] = a[k];
  for (const sl of Object.keys(AV_SLOTS)) o[sl] = SHOP_ITEMS[a[sl]] && SHOP_ITEMS[a[sl]].slot === sl ? a[sl] : null;
  return o;
}
const hexN = (h) => parseInt(h.slice(1), 16);
function avatarGeo(a){                           // 발이 원점, 앞이 +z
  const ps = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const put = (x, y, z, w, h, d, c, g) => { m.compose(new THREE.Vector3(x, y + h/2, z), q, s.set(w, h, d)); ps.push({ g:g || BOX, m:m.clone(), c }); };
  const skin = hexN(a.skin), hc = hexN(a.hairColor), top = hexN(a.top), bot = hexN(a.bottom), bag = hexN(a.bag);
  put(-0.07, 0.06, 0, 0.12, 0.82, 0.2, bot); put(0.07, 0.06, 0, 0.12, 0.82, 0.2, bot);              // 다리
  put(-0.07, 0, 0.03, 0.13, 0.08, 0.26, 0x2a2622); put(0.07, 0, 0.03, 0.13, 0.08, 0.26, 0x2a2622);  // 신발
  put(0, 0.88, 0, 0.5, 0.6, 0.28, top);                                                              // 몸통
  put(-0.32, 1.0, 0, 0.13, 0.46, 0.16, top); put(0.32, 1.0, 0, 0.13, 0.46, 0.16, top);              // 팔
  put(-0.32, 0.88, 0, 0.11, 0.12, 0.12, skin); put(0.32, 0.88, 0, 0.11, 0.12, 0.12, skin);          // 손
  put(0, 1.48, 0, 0.12, 0.06, 0.12, skin); put(0, 1.54, 0, 0.28, 0.28, 0.28, skin);                 // 목 · 머리
  put(-0.06, 1.66, 0.141, 0.04, 0.04, 0.01, 0x1a1a1a); put(0.06, 1.66, 0.141, 0.04, 0.04, 0.01, 0x1a1a1a);   // 눈
  const capped = a.head && a.head !== 'crown';   // 모자를 쓰면 정수리 머리카락은 모자에 가린다
  if (a.hair === 0){ if (!capped) put(0, 1.80, 0, 0.3, 0.06, 0.3, hc); put(0, 1.62, -0.13, 0.3, 0.2, 0.05, hc); }
  else if (a.hair === 1){ if (!capped) put(0, 1.80, 0, 0.3, 0.07, 0.3, hc); put(0, 1.36, -0.14, 0.32, 0.46, 0.06, hc);
    put(-0.145, 1.5, -0.01, 0.03, 0.3, 0.26, hc); put(0.145, 1.5, -0.01, 0.03, 0.3, 0.26, hc); }
  else { put(0, 1.80, 0, 0.29, 0.05, 0.29, hc); if (!capped) for (let i = 0; i < 4; i++) put(0, 1.84, -0.11 + i*0.075, 0.07, 0.12 - Math.abs(i - 1.5)*0.02, 0.06, hc); }
  put(0, 0.98, -0.24, 0.38, 0.44, 0.16, bag);                                                        // 가방
  put(-0.15, 0.95, 0.145, 0.05, 0.52, 0.02, bag); put(0.15, 0.95, 0.145, 0.05, 0.52, 0.02, bag);    // 멜빵
  // ── 장식: 머리
  if (a.head === 'pumpkin'){ put(0, 1.72, 0, 0.40, 0.30, 0.40, 0xe07a1f); put(-0.1, 1.72, 0, 0.03, 0.30, 0.41, 0xb85e12); put(0.1, 1.72, 0, 0.03, 0.30, 0.41, 0xb85e12);
    put(0, 2.02, 0, 0.05, 0.08, 0.05, 0x3d6b2a); put(-0.07, 1.86, 0.2, 0.05, 0.04, 0.01, 0x2a1406); put(0.07, 1.86, 0.2, 0.05, 0.04, 0.01, 0x2a1406); }
  else if (a.head === 'witch'){ put(0, 1.80, 0, 0.56, 0.03, 0.56, 0x1c1825); put(0, 1.83, 0, 0.31, 0.06, 0.31, 0x6a3d8a);
    put(0, 1.83, 0, 0.17, 0.46, 0.17, 0x1c1825, CONE); }
  else if (a.head === 'beanie'){ put(0, 1.76, 0, 0.31, 0.14, 0.31, 0xb03a3a); put(0, 1.9, 0, 0.08, 0.06, 0.08, 0xe8e4dc); }
  else if (a.head === 'cap'){ put(0, 1.79, 0, 0.31, 0.1, 0.31, 0x24324a); put(0, 1.79, 0.2, 0.27, 0.025, 0.14, 0x24324a); }
  else if (a.head === 'crown'){ put(0, 1.82, 0, 0.30, 0.07, 0.30, 0xe6b52e);
    for (const [x, z] of [[-0.12,-0.12],[0.12,-0.12],[-0.12,0.12],[0.12,0.12],[0,0.13],[0,-0.13],[0.13,0],[-0.13,0]]) put(x, 1.89, z, 0.05, 0.07, 0.05, 0xe6b52e);
    put(0, 1.83, 0.152, 0.05, 0.04, 0.01, 0xc4202e); }
  // ── 장식: 얼굴
  if (a.face === 'sunglasses'){ put(0, 1.655, 0.148, 0.29, 0.025, 0.01, 0x111111); put(-0.065, 1.63, 0.15, 0.1, 0.06, 0.012, 0x0c0c10); put(0.065, 1.63, 0.15, 0.1, 0.06, 0.012, 0x0c0c10); }
  else if (a.face === 'goggles'){ put(0, 1.645, 0, 0.30, 0.04, 0.30, 0x3a3a3a);
    put(-0.065, 1.625, 0.15, 0.1, 0.08, 0.04, 0x5a5a5a); put(0.065, 1.625, 0.15, 0.1, 0.08, 0.04, 0x5a5a5a);
    put(-0.065, 1.635, 0.171, 0.07, 0.055, 0.005, 0x4fb3c8); put(0.065, 1.635, 0.171, 0.07, 0.055, 0.005, 0x4fb3c8); }
  else if (a.face === 'skull'){ put(0, 1.55, 0.145, 0.29, 0.26, 0.03, 0xeae6da);
    put(-0.065, 1.65, 0.161, 0.07, 0.065, 0.005, 0x141414); put(0.065, 1.65, 0.161, 0.07, 0.065, 0.005, 0x141414);
    put(0, 1.60, 0.161, 0.035, 0.035, 0.005, 0x141414); for (let i = -2; i <= 2; i++) put(i*0.04, 1.565, 0.161, 0.025, 0.025, 0.005, 0x141414); }
  // ── 장식: 등
  if (a.back === 'cape'){ put(0, 0.55, -0.35, 0.50, 0.92, 0.03, 0xa3242e); put(0, 1.44, -0.2, 0.46, 0.06, 0.2, 0xa3242e); }
  else if (a.back === 'scarf'){ put(0, 1.42, 0, 0.34, 0.08, 0.34, 0x2f6f9a); put(0.08, 1.04, -0.17, 0.08, 0.38, 0.03, 0x2f6f9a);
    put(0.08, 1.04, -0.185, 0.081, 0.03, 0.005, 0xe8e4dc); put(0.08, 1.2, -0.185, 0.081, 0.03, 0.005, 0xe8e4dc); }
  return merge(ps);
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
      hot:[null,null,null,null,null], sel:0, gb:[],   // 핫바 5칸 · 가방 속 총
      bag:{ '9mm':0, '5.56':0, '12g':0, '7.62':0 }, bagLv:0,   // 예비탄은 가방에 종류별로
      inv:{ band:2, kit:0, med:0, drink:0 }, healT:0, healKind:null, boost:0,
      helm:0, helmD:0, vest:0, vestD:0, st:0,
      cd:0, reload:0, burst:0, react:0, think:0, tx:0, tz:0, target:null,
      mesh:null, chute:null, kills:0,
      drop:'plane', dropT:0, lx:0, lz:0,
    };
    if (e.bot){                                   // 봇도 나처럼 맨손 · 붕대 2 로 내려 주워서 싸운다 (lastdrop-06)
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
    cars.push({ x, z, y:heightAt(x,z), yaw:rh(i,93,SEED)*6.283, spd:0, mesh, hp:CAR.hp, dead:false, boomAt:0, fire:null, killer:null });
  }
}
// ══ 지프 파괴 (29 문서) ══════════════════════════════════════
// 체력 400. 총알은 사람보다 먼저 차체(회전된 상자, 탑승자 머리까지)에 걸린다 — 멀쩡한 동안 탑승자는 안 맞는다.
// 0 이 되면 불타는 잔해(못 움직임, 엄폐물) + 탑승자 강제 하차·피해 30, 2.5초 뒤 폭발(반경 6m, 최대 60).
const CAR = { hp:400, hx:1.15, hy:0.82, hz:2.2, cy:1.13, ejectDmg:30, boomDelay:2.5, boomR:6, boomDmg:60 };
const WRECK_MAT = new THREE.MeshStandardMaterial({ color:0x1d1b19, roughness:1, flatShading:true });
const FIRE_MAT = new THREE.MeshBasicMaterial({ color:0xff7a1a, transparent:true, opacity:0.85 });
const sMetal = () => { nz(3200, 2.2, 0.18, 0.06, 'bandpass'); tone(1900, 1300, 0.07, 0.06, 'square'); };
// 광선이 차 c 의 상자에 처음 닿는 거리 (없으면 -1). 차의 x축 = (cos, 0, -sin), z축 = (sin, 0, cos)
function rayCar(c, ox, oy, oz, dx, dy, dz, maxT){
  const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
  const px = ox - c.x, py = oy - (c.y + CAR.cy), pz = oz - c.z;
  const o = [px*cs - pz*sn, py, px*sn + pz*cs], d = [dx*cs - dz*sn, dy, dx*sn + dz*cs], h = [CAR.hx, CAR.hy, CAR.hz];
  let t0 = 0, t1 = maxT;
  for (let k = 0; k < 3; k++){
    if (Math.abs(d[k]) < 1e-9){ if (Math.abs(o[k]) > h[k]) return -1; continue; }
    let a = (-h[k] - o[k]) / d[k], b = (h[k] - o[k]) / d[k];
    if (a > b){ const t = a; a = b; b = t; }
    if (a > t0) t0 = a; if (b < t1) t1 = b;
    if (t0 > t1) return -1;
  }
  return t0 > 0.05 ? t0 : -1;
}
function rayCars(ox, oy, oz, dx, dy, dz, maxT, shooter){
  let hit = null, best = maxT;
  for (const c of cars){
    if (shooter === me() && c === riding) continue;
    if (Math.hypot(c.x - ox, c.z - oz) > best + 5) continue;
    const t = rayCar(c, ox, oy, oz, dx, dy, dz, best);
    if (t > 0 && t < best){ best = t; hit = { c, t }; }
  }
  return hit;
}
function damageCar(c, dmg, by){
  if (c.dead) return;
  c.hp -= dmg;
  if (c.hp <= 0){ c.hp = 0; destroyCar(c, by); }
}
function destroyCar(c, by){
  c.dead = true; c.spd = 0; c.killer = by || null; c.boomAt = elapsed + CAR.boomDelay;
  c.mesh.material = WRECK_MAT;
  c.fire = new THREE.Group();
  for (let i = 0; i < 5; i++){
    const f = new THREE.Mesh(BOX, FIRE_MAT);
    f.position.set((i % 2 ? 0.5 : -0.5) * (i % 3 ? 1 : 0.3), 1.7, -1.6 + i * 0.8); f.scale.set(0.5, 0.7, 0.5);
    c.fire.add(f);
  }
  c.fire.position.set(c.x, c.y, c.z); c.fire.rotation.y = c.yaw; scene.add(c.fire);
  // 잔해는 엄폐물 — 회전된 차체를 감싸는 상자로 이동·총알을 막는다
  const cs = Math.abs(Math.cos(c.yaw)), sn = Math.abs(Math.sin(c.yaw));
  addCol(c.x, c.y, c.z, cs*1.0 + sn*2.15, 1.65, sn*1.0 + cs*2.15);
  c.col = cols[cols.length - 1];
  sBoom(Math.hypot(c.x - me().x, c.z - me().z) + 40);
  if (c === riding){                             // 탑승자 강제 하차 + 피해
    toggleRide();
    feed('<s>지프 파괴</s> 강제 하차');
    hurt(me(), CAR.ejectDmg, by, null, '지프 파괴');
  } else if (Math.hypot(c.x - me().x, c.z - me().z) < 80) feed('<i>지프가 불탄다 — 곧 터진다</i>');
}
function explodeCar(c){
  c.boomAt = -1;
  const bx = c.x, by = c.y + 0.8, bz = c.z;
  fx(bx, by + 0.6, bz, 6, 0.5, false); fx(bx, by + 1.6, bz, 4, 0.7, false);
  sBoom(Math.hypot(bx - me().x, bz - me().z));
  const ci = cols.indexOf(c.col); if (ci >= 0) cols.splice(ci, 1);   // 시야 검사 동안 잔해 자신은 뺀다
  for (const e of ents){
    if (!e.alive || e.drop === 'plane') continue;
    const d = Math.hypot(e.x - bx, (e.y + 0.9) - by, e.z - bz);
    if (d >= CAR.boomR) continue;
    const L = d || 1, dx = (e.x - bx)/L, dy = (e.y + 0.9 - by)/L, dz = (e.z - bz)/L;
    if (d > 0.5 && rayWorld(bx, by, bz, dx, dy, dz, d) < d - 0.3) continue;   // 사이에 벽이 있으면 막힌다
    hurt(e, CAR.boomDmg * (1 - d / CAR.boomR), c.killer, null, '지프 폭발');
  }
  if (c.col) cols.push(c.col);
}
function updateWrecks(){
  for (const c of cars){
    if (!c.dead) continue;
    if (c.boomAt > 0 && elapsed >= c.boomAt) explodeCar(c);
    if (c.fire){ const k = performance.now() * 0.012;
      c.fire.children.forEach((f, i) => { f.scale.y = 0.5 + 0.35 * Math.abs(Math.sin(k + i * 1.7)); f.position.y = 1.55 + f.scale.y * 0.4; }); }
  }
}
function nearCar(){
  const p = me();
  let best = null, bd = 4.2;
  for (const c of cars){
    if (c.dead) continue;                          // 잔해는 못 탄다
    const d = Math.hypot(c.x-p.x, c.z-p.z);
    if (d < bd){ bd = d; best = c; }
  }
  return best;
}
function updateCars(dt){
  updateWrecks();
  for (const c of cars){
    if (c.dead) continue;                          // 잔해는 그 자리에
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
  AU.g = AU.ctx.createGain(); AU.g.gain.value = SET.sound ? 0.55 : 0; AU.g.connect(AU.ctx.destination);
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
    if (e === me() && riding && !riding.dead) continue;           // 멀쩡한 지프 안 — 차체가 막아 준다 (29 문서)
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
  if (by){ e.hitBy = by; e.hitAt = elapsed; }       // 봇이 반격할 상대 (lastdrop-06)
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
  const hg = heldGun(e);
  if (!hg) return;
  const g = GUNS[hg.gi];
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
    const ch = rayCars(ox,oy,oz,dx,dy,dz,w,e);      // 지프 차체가 사람보다 먼저 막는다 (29 문서)
    const h = rayEnts(ox,oy,oz,dx,dy,dz, ch ? ch.t : w, e);
    const t = h ? h.t : ch ? ch.t : w;
    if (e === me() || far === false) tracer(ox,oy,oz, ox+dx*t, oy+dy*t, oz+dz*t);
    const dm = h ? g.dmg * h.p.m * rangeMul(g, t) : 0;
    if (!h && ch){                                  // 지프에 맞았다 — 금속 소리·불꽃, 체력이 깎인다 (잔해는 막기만)
      if (!ch.c.dead) damageCar(ch.c, g.dmg * rangeMul(g, t), e);
      fx(ox+dx*t, oy+dy*t, oz+dz*t, 0.4, 0.12, false);
      if (Math.hypot(ch.c.x - me().x, ch.c.z - me().z) < 70) sMetal();
    } else if (h && dm > 0 && hurt(h.e, dm, e, h.p, g.n)){   // 피·히트마커·명중 집계는 피해가 들어갔을 때만
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
  if (p.cd > 0 || p.reload > 0 || p.healT > 0) return;
  if (p.drop !== 'ground' || riding) return;
  const h = heldGun(p);
  cam.getWorldDirection(_fd);
  if (!h){ punch(p, _fd.x, _fd.y, _fd.z); return; }   // 맨손 — 주먹
  if (h.ld <= 0){ startReload(); return; }
  h.ld--; p.cd = GUNS[h.gi].rate;
  fireFrom(p, _fd.x, _fd.y, _fd.z);
  hudGun();
}
function punch(e, dx, dy, dz){
  e.cd = FIST.rate;
  const mine = e === me();
  const ox = mine ? yawO.position.x : e.x, oy = mine ? yawO.position.y : e.y + 1.4*STANCE[e.st].h, oz = mine ? yawO.position.z : e.z;
  const w = rayWorld(ox, oy, oz, dx, dy, dz, FIST.range);
  const h = rayEnts(ox, oy, oz, dx, dy, dz, w, e);
  if (mine){ shots++; sTake(); }
  if (h && hurt(h.e, FIST.dmg, e, h.p, '주먹') && mine){ hits++; hitT = 0.13; }
}
function startReload(){
  const p = me(), h = heldGun(p);
  if (!h || p.reload > 0) return;
  const g = GUNS[h.gi];
  if (h.ld >= g.mag || p.bag[g.am] <= 0) return;
  p.reload = g.reload; sRel(); hudGun();
}
// 핫바 칸 고르기 — 총이면 손에, 회복템이면 바로 쓴다(손은 그대로), 빈 칸이면 맨손
function selectSlot(s){
  const p = me(), it = p.hot[s];
  if (it && it.t === 'heal'){ heal(it.k); return; }
  if (s === p.sel) return;
  p.sel = s; afterHeld(); p.cd = Math.max(p.cd, 0.22); hudGun();
}
function cycleSlot(dir){                         // 휠 — 총이 든 칸만 돈다
  const p = me();
  for (let k = 1; k <= HOT_N; k++){
    const s = ((p.sel + dir*k) % HOT_N + HOT_N) % HOT_N, it = p.hot[s];
    if (it && it.t === 'gun'){ selectSlot(s); return; }
  }
}
function afterHeld(){                            // 손에 든 게 바뀌었다
  const p = me(); p.reload = 0; setScope(false); buildView();
}
function setScope(on){
  const p = me(), hg = heldGun(p);
  const want = !!(on && hg);
  if (want === scoped) return;
  scoped = want;
  const sn = !!(hg && GUNS[hg.gi].scope);
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
  const hg = heldGun(me());
  if (!hg) return;
  const g = GUNS[hg.gi];
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
    b.out = null;                              // 배회 목표가 바뀌니 집 나가는 길도 다시
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
// ══ 봇 파밍 (lastdrop-06) ════════════════════════════════════
// 맨손으로 내려 주변 전리품을 줍는다: 총 → 그 총 탄 → 방탄복·헬멧 → 가방 → 회복템 (죽은 상자도).
// 줍기는 나와 같은 takeItem — 탄 종류·가방 용량 규칙이 같고, 주운 건 맵에서 사라진다.
// 집 안 전리품은 문으로 드나든다(문 앞 2m → 문 중앙 → 안쪽). 8초 안에 못 닿으면 그 봇은 그 전리품을 포기한다.
const LOOT_R = [12, 15, 20, 25, 32, 40];        // 단계별 파밍 반경(시야 무관)
const PICK_T = [1.5, 1.2, 0.9, 0.7, 0.5, 0.3];  // 줍는 데 걸리는 시간
const GUN_RANK = { pistol:1, shot:2, sniper:3, smg:3, rifle:4 };
const armedNeed = (g) => Math.min(30, g.mag * 3); // 교전에 나설 탄 — 30발 (샷건·저격은 탄창 3개분)
const GIVE_UP = 8;
let lootGiveUps = 0;
function botArmed(b){                            // 한 번 무장하면 탄이 남아 있는 동안은 무장
  const gs = allGuns(b);
  b.armed = b.armed ? gs.some(h => ammoOf(b, h) > 0) : gs.some(h => ammoOf(b, h) >= armedNeed(GUNS[h.gi]));
  return b.armed;
}
function bestGun(b){
  let best = null;
  for (const h of allGuns(b)){
    if (ammoOf(b, h) <= 0) continue;
    if (!best || GUN_RANK[GUNS[h.gi].k] > GUN_RANK[GUNS[best.gi].k]) best = h;
  }
  return best;
}
function holdBest(b){                            // 탄이 있는 가장 좋은 총을 손에 (가방에 있으면 핫바로 꺼낸다)
  const h = bestGun(b);
  if (!h) return null;
  if (heldGun(b) === h) return h;
  let s = b.hot.findIndex(x => x && x.t === 'gun' && x.g === h);
  if (s < 0){
    b.gb.splice(b.gb.indexOf(h), 1);
    s = b.hot.findIndex(x => !x);
    if (s < 0){ s = 0; putOut(b, 0); }
    b.hot[s] = { t:'gun', g:h };
  }
  b.sel = s; b.reload = 0; b.cd = Math.max(b.cd, 0.3);
  return h;
}
function lootWant(b, it){                        // 이게 얼마나 필요한가 (0 = 필요 없다)
  const room = bagCap(b) - bagW(b), up = b.tier >= 4;   // 더 좋은 걸로 바꾸는 판단은 어려움 이상
  switch (it.kind){
    case LOOT.GUN: {
      const gs = allGuns(b);
      if (!gs.length) return 100;
      if (!gs.some(h => ammoOf(b, h) > 0)) return 80;
      if (up && GUN_RANK[GUNS[it.gun].k] > Math.max(...gs.map(h => GUN_RANK[GUNS[h.gi].k]))) return 60;
      return 0;
    }
    case LOOT.AMMO:
      if (room < AMMO[it.am].w || b.bag[it.am] >= 90) return 0;
      return allGuns(b).some(h => GUNS[h.gi].am === it.am) ? 90 : 0;
    case LOOT.VEST: return !b.vest ? 50 : (up && it.sub > b.vest ? 45 : 0);
    case LOOT.HELM: return !b.helm ? 48 : (up && it.sub > b.helm ? 44 : 0);
    case LOOT.BAG:  return !b.bagLv ? 30 : (up && it.sub > b.bagLv ? 28 : 0);
    case LOOT.HEAL: {
      const k = HEAL_ORDER[it.sub], lim = { band:5, kit:2, med:1, drink:2 }[k];
      return room >= HEAL_W[k] && b.inv[k] < lim ? 15 + it.sub : 0;
    }
    case LOOT.BOX: return Math.max(0, ...it.items.map(x => lootWant(b, x)));
  }
  return 0;
}
function houseAt(x, z){
  for (const h of houses) if (Math.abs(x - h.x) < h.w/2 - 0.2 && Math.abs(z - h.z) < h.d/2 - 0.2) return h;
  return null;
}
// 선분 a→b 가 집 h(둘레 m 만큼 넓혀서)를 지나가나 — Liang–Barsky
function segHits(ax, az, bx, bz, h, m){
  const x0 = h.x - h.w/2 - m, x1 = h.x + h.w/2 + m, z0 = h.z - h.d/2 - m, z1 = h.z + h.d/2 + m;
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dz, az - z0], [dz, z1 - az]]){
    if (Math.abs(p) < 1e-9){ if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0){ if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return t0 < t1;
}
// 집 h 를 피해 a→b 로 가는 모서리 (2m 바깥) 한두 개 — 가장 짧은 쪽
function cornersAround(ax, az, bx, bz, h){
  const m = 2, C = [[h.x - h.w/2 - m, h.z - h.d/2 - m], [h.x + h.w/2 + m, h.z - h.d/2 - m], [h.x + h.w/2 + m, h.z + h.d/2 + m], [h.x - h.w/2 - m, h.z + h.d/2 + m]];
  const D = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]), A = [ax, az], B = [bx, bz];
  let best = [], bl = 1e9;
  for (let i = 0; i < 4; i++){
    const c = C[i];
    if (segHits(ax, az, c[0], c[1], h, 0.5)) continue;
    if (!segHits(c[0], c[1], bx, bz, h, 0.5)){ const L = D(A, c) + D(c, B); if (L < bl){ bl = L; best = [c]; } continue; }
    for (const j of [(i + 1) % 4, (i + 3) % 4]){
      const c2 = C[j];
      if (!segHits(c2[0], c2[1], bx, bz, h, 0.5)){ const L = D(A, c) + D(c, c2) + D(c2, B); if (L < bl){ bl = L; best = [c, c2]; } }
    }
  }
  return best.map(([x, z]) => ({ x, z }));
}
// a → g 구간이 집을 관통하면 가장 가까운 집의 모서리로 나누고, 나뉜 구간도 다시 검사한다 (깊이 6 까지)
function routeSeg(a, g, depth, out){
  if (depth > 6) return;
  let hit = null, hd = 1e9;
  for (const h of houses){
    if (!segHits(a.x, a.z, g.x, g.z, h, 0.5)) continue;
    const d = Math.hypot(h.x - a.x, h.z - a.z);
    if (d < hd){ hd = d; hit = h; }
  }
  if (!hit) return;
  const cs = cornersAround(a.x, a.z, g.x, g.z, hit);
  if (!cs.length) return;
  let prev = a;
  for (const c of cs){ routeSeg(prev, c, depth + 1, out); out.push(c); prev = c; }
  routeSeg(prev, g, depth + 1, out);
}
// (tx,tz) 까지 웨이포인트. 집 안을 드나들 땐 문(앞 +z 벽 가운데, 폭 2.4m)으로,
// 집 밖 구간이 어느 집이든(나온 집·들어갈 집 포함) 관통하면 그 집 모서리를 돌아간다
function pathTo(b, tx, tz){
  const pts = [], hb = houseAt(b.x, b.z), ht = houseAt(tx, tz);
  if (hb && hb !== ht)                           // 안 → 밖: 안쪽 → 문 중앙 → 문 앞 2m
    pts.push({ x:hb.x, z:hb.z + hb.d/2 - 1.2 }, { x:hb.x, z:hb.z + hb.d/2 }, { x:hb.x, z:hb.z + hb.d/2 + 2 });
  if (!(hb && hb === ht)){                       // 같은 집 안이면 바로 간다
    const goal = ht ? { x:ht.x, z:ht.z + ht.d/2 + 2 } : { x:tx, z:tz };   // 집 안이 목표면 우선 그 집 문 앞 2m
    let start = pts.length ? pts[pts.length - 1] : { x:b.x, z:b.z };
    for (const h of houses){                     // 벽·문간에 붙어 서 있으면 먼저 가장 가까운 변 바깥으로 1.2m 빠진다
      const L = start.x - (h.x - h.w/2), Rr = (h.x + h.w/2) - start.x, B = start.z - (h.z - h.d/2), F = (h.z + h.d/2) - start.z;
      if (Math.min(L, Rr, B, F) < -0.5) continue;   // 이 집 둘레 0.5m 밖이다
      const m = Math.min(Math.abs(L), Math.abs(Rr), Math.abs(B), Math.abs(F)), o = 1.7;
      start = m === Math.abs(F) ? { x:start.x, z:h.z + h.d/2 + o } : m === Math.abs(B) ? { x:start.x, z:h.z - h.d/2 - o }
            : m === Math.abs(L) ? { x:h.x - h.w/2 - o, z:start.z } : { x:h.x + h.w/2 + o, z:start.z };
      pts.push(start);
      break;
    }
    routeSeg(start, goal, 0, pts);
    if (ht) pts.push({ x:ht.x, z:ht.z + ht.d/2 + 2 }, { x:ht.x, z:ht.z + ht.d/2 }, { x:ht.x, z:ht.z + ht.d/2 - 1.2 });   // 문 앞 2m → 문 중앙 → 안쪽
  }
  pts.push({ x:tx, z:tz });
  return pts;
}
// key 칸에 (tx,tz) 로 가는 길을 둔다. 목표가 바뀌거나, 길을 만들 때와 다른 집 안에 들어와 있으면 다시 만든다.
// (집에서 나서는 순간엔 다시 만들지 않는다 — 나온 집을 돌아가는 모서리 웨이포인트를 지켜야 한다)
function nav(b, key, tx, tz){
  const hb = houseAt(b.x, b.z), n = b[key];
  if (!n || (hb && n.hb !== hb) || Math.hypot(n.tx - tx, n.tz - tz) > 0.5) b[key] = { pts:pathTo(b, tx, tz), hb, tx, tz };
  return follow(b, b[key].pts);
}
function follow(b, path){                        // 웨이포인트를 하나씩 지운다
  while (path.length > 1 && Math.hypot(path[0].x - b.x, path[0].z - b.z) < 0.6) path.shift();
  const q = path[0], dx = q.x - b.x, dz = q.z - b.z, d = Math.hypot(dx, dz) || 1;
  return { mx:dx/d, mz:dz/d, run: d > 3 };      // 파밍·집 뒤지기는 뛴다 (웨이포인트 가까이선 걷는다)
}
function botLootPick(b){
  const R = LOOT_R[b.tier], bare = !allGuns(b).length;
  let best = -1, bs = 0;
  for (let i = 0; i < loots.length; i++){
    const l = loots[i];
    if (l.taken || (b.skip && b.skip.has(l))) continue;
    const d = Math.hypot(l.x - b.x, l.z - b.z);
    if (d > R || Math.hypot(l.x - zone.cx, l.z - zone.cz) > zone.r) continue;   // 자기장 밖 전리품은 안 간다
    const w = lootWant(b, l);
    if (bare && w < 80 && d > 8) continue;       // 총이 없으면 먼 회복템·방어구보다 총 찾기(집 뒤지기)가 먼저
    if (w > 0 && w*10 - d > bs){ bs = w*10 - d; best = i; }
  }
  return best;
}
function nextHouse(b){                           // 아직 안 가 본 가까운 집 (자기장 안)
  let best = null, bd = 1e9;
  for (const h of houses){
    if ((b.seenH && b.seenH.has(h)) || Math.hypot(h.x - zone.cx, h.z - zone.cz) > zone.r) continue;
    const d = Math.hypot(h.x - b.x, h.z - b.z);
    if (d < bd){ bd = d; best = h; }
  }
  return best;
}
const STOP = { mx:0, mz:0, run:false };
// 파밍 한 프레임. 움직일 방향을 돌려준다 (null = 할 게 없다)
function botLoot(b, dt){
  if (b.lootI >= 0 && loots[b.lootI].taken) b.lootI = -1;
  if (!(b.lootI >= 0) && (b.lootCD = (b.lootCD || 0) - dt) <= 0){
    b.lootCD = 0.5;
    const i = botLootPick(b);
    if (i >= 0){ b.lootI = i; b.lootT = 0; b.pickT = 0; b.exH = null; }
    else if (!b.armed && !b.exH){                // 맨손인데 근처에 없다 — 집을 뒤지러 간다
      const h = nextHouse(b);
      if (h){ b.exH = h; b.lootT = 0; }
    }
  }
  if (b.lootI >= 0){
    const l = loots[b.lootI];
    if ((b.lootT += dt) > GIVE_UP){              // 못 닿는 자리 — 이 봇은 포기
      (b.skip || (b.skip = new Set())).add(l); lootGiveUps++; b.lootI = -1; return null;
    }
    if (Math.hypot(l.x - b.x, l.z - b.z) > 1.1) return nav(b, 'path', l.x, l.z);
    if ((b.pickT += dt) < PICK_T[b.tier]) return STOP;
    if (l.kind === LOOT.BOX){
      for (let j = l.items.length - 1; j >= 0; j--) if (lootWant(b, l.items[j]) > 0) boxTakeBy(b, b.lootI, j);
    } else if (takeLootBy(b, b.lootI) !== null) (b.skip || (b.skip = new Set())).add(l);
    if (!l.taken && l.kind === LOOT.BOX) (b.skip || (b.skip = new Set())).add(l);
    b.lootI = -1; b.lootCD = 0;
    return STOP;
  }
  if (b.exH){
    const h = b.exH;
    if (Math.hypot(h.x - b.x, h.z - b.z) < 2.5 || (b.lootT += dt) > 20){ (b.seenH || (b.seenH = new Set())).add(h); b.exH = null; return STOP; }
    return nav(b, 'path', h.x, h.z);
  }
  return null;
}
function botPunch(b, t){                         // 주먹 — 붙어 있으면 누구나
  b.yaw = Math.atan2(t.x - b.x, t.z - b.z);
  if (b.cd > 0) return;
  const dx = t.x - b.x, dy = (t.y + 1.2*STANCE[t.st].h) - (b.y + 1.4*STANCE[b.st].h), dz = t.z - b.z, L = Math.hypot(dx, dy, dz) || 1;
  punch(b, dx/L, dy/L, dz/L);
}
function updateBot(b, dt){
  if (b.drop !== 'ground') return;
  const T = TIERS[b.tier];
  b.st = (b.target && b.target.alive
          && Math.hypot(b.target.x-b.x, b.target.z-b.z) < 42) ? 1 : 0;
  b.think -= dt;
  if (b.think <= 0) botThink(b);
  if (b.cd > 0) b.cd -= dt;
  const armed = botArmed(b);                     // 총 + 탄 30발 이상이어야 싸운다
  const h = armed ? holdBest(b) : null, g = h ? GUNS[h.gi] : null;
  if (b.reload > 0){                             // 재장전은 가방의 그 탄에서 (무한 탄 없음)
    b.reload -= dt;
    if (b.reload <= 0 && h){ const take = Math.min(g.mag - h.ld, b.bag[g.am]); h.ld += take; b.bag[g.am] -= take; }
  }
  let mx = 0, mz = 0, run = false;
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
  } else if (b.target && b.target.alive && armed){
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
      if (h.ld <= 0){
        if (b.bag[g.am] > 0) b.reload = g.reload;   // 가방에도 없으면 다음 프레임에 다른 총으로 바꾼다
        if (T.move >= 5) findCover(b, b.target);
      } else {
        h.ld--;
        b.cd = g.rate * (g.auto ? 1 : 1.3) + (b.burst-- > 0 ? 0 : rnd(T.rest));
        if (b.burst <= 0){ b.burst = 2 + ((Math.random()*4)|0); rollAim(b); }
        const t = b.target, sh = STANCE[t.st].h;
        const car = t === me() && riding && !riding.dead && T.move >= 4 ? riding : null;   // 어려움 이상 — 탄 사람이면 지프부터
        // 조준점 — 몸통(하드코어는 가끔 머리) + 거리에 비례한 가로·세로 오차
        const ty = (car ? car.y + 1.0 : t.y + (b.aimHead ? 1.66 : 1.15)*sh) + (Math.random()-0.5)*0.5 + b.aimY*d*T.aim;
        let dx = (car ? car.x : t.x) - b.x, dz = (car ? car.z : t.z) - b.z;
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
    const foe = b.target && b.target.alive ? b.target : null;
    const fd = foe ? Math.hypot(foe.x-b.x, foe.z-b.z) : 1e9;
    let mv = null;
    const hitMe = b.hitBy && b.hitBy.alive && elapsed - b.hitAt < 3;   // 3초 안에 나를 때린 상대
    if (hitMe && Math.hypot(b.hitBy.x-b.x, b.hitBy.z-b.z) < FIST.range){ botPunch(b, b.hitBy); mv = STOP; }   // 맞으면 주먹으로 반격 — 최소 대응
    else if (foe && !armed && T.move >= 4 && heldGun(foe) && fd < 35 && !(b.fleeCD > 0)){
      // 어려움 이상 — 맨손으로 무장한 적을 만나면 엄폐하거나 반대로 뛴다. 그 뒤 4초는 다시 파밍
      if (!findCover(b, foe)){ b.cx = b.x - (foe.x-b.x)/fd*12; b.cz = b.z - (foe.z-b.z)/fd*12; b.coverT = 2; }
      b.fleeCD = 6;
    }
    if (!mv && !outOfZone(b)) mv = botLoot(b, dt);   // 약간 어려움 이하는 적을 봐도 계속 줍는다
    if (b.fleeCD > 0) b.fleeCD -= dt;
    if (mv){ mx = mv.mx; mz = mv.mz; run = mv.run; if (mx || mz) b.yaw = Math.atan2(mx, mz); }
    else {
      const dx = b.tx-b.x, dz = b.tz-b.z, d = Math.hypot(dx,dz);
      if (d > 1.5){
        const f = nav(b, 'out', b.tx, b.tz);      // 집 안이면 문으로, 길에 집이 있으면 모서리로
        mx = f.mx; mz = f.mz;
        b.yaw = Math.atan2(mx, mz); run = outOfZone(b);
      }
    }
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
// ── 가방 무게 · 용량 (총은 무게 0)
const bagCap = (p) => BAG_CAP[p.bagLv];
function bagW(p){
  let w = 0;
  for (const k of AMMO_ORDER) w += p.bag[k] * AMMO[k].w;
  for (const k of HEAL_ORDER) w += p.inv[k] * HEAL_W[k];
  return w;
}
function itemName(it){
  switch (it.kind){
    case LOOT.GUN:  return GUNS[it.gun].n + ' (' + it.ld + '발)';
    case LOOT.AMMO: return AMMO[it.am].n + ' ×' + it.n;
    case LOOT.HEAL: return HEALS[HEAL_ORDER[it.sub]].n + (it.n > 1 ? ' ×' + it.n : '');
    case LOOT.HELM: return '헬멧 Lv' + it.sub;
    case LOOT.VEST: return '방탄복 Lv' + it.sub;
    case LOOT.BAG:  return '가방 Lv' + it.sub;
    case LOOT.BOX:  return it.name;
  }
  return '?';
}
const gunLoot = (g) => ({ kind:LOOT.GUN, gun:g.gi, ld:g.ld });
// e 의 발밑에 버린다 (조금 흩어서)
function dropItemAt(e, it){
  const a = Math.random()*6.283, r = 0.5 + Math.random()*0.6;
  return addLoot(it, e.x + Math.cos(a)*r, (e === me() ? e.y : heightAt(e.x, e.z)) + 0.35, e.z + Math.sin(a)*r);
}
const dropItem = (it) => dropItemAt(me(), it);
// 핫바 칸 비우기 — 총은 가방으로, 회복템 바로가기는 그냥 뺀다
function putOut(e, s){
  const it = e.hot[s];
  if (!it) return;
  if (it.t === 'gun') e.gb.push(it.g);
  e.hot[s] = null;
  if (e === me() && s === e.sel) afterHeld();
}
// 총 넣기 — slot 을 주면 그 칸에(원래 있던 건 가방으로), 아니면 빈 핫바 칸 → 꽉 찼으면 가방
function addGun(e, g, slot){
  if (slot === undefined){
    slot = e.hot.findIndex(x => !x);
    if (slot < 0){ e.gb.push(g); return -1; }
  } else putOut(e, slot);
  e.hot[slot] = { t:'gun', g };
  if (e === me()){
    if (slot === e.sel) afterHeld();
    else if (!heldGun(e) && !e.hot[e.sel]){ e.sel = slot; afterHeld(); }   // 맨손이었으면 바로 든다
  }
  return slot;
}
// 회복템 바로가기가 가리키는 게 다 떨어지면 칸을 비운다
function tidyHot(e){ e.hot.forEach((x, i) => { if (x && x.t === 'heal' && e.inv[x.k] <= 0) e.hot[i] = null; }); }
// 하나 줍기 (나·봇 공통). dest: undefined 자동 · 'bag' · { hot:s }
// null = 다 주웠다 · 'part' = 일부만 (가방이 참) · 그 밖의 글자 = 못 줍는 이유
function takeItem(e, it, dest){
  const room = bagCap(e) - bagW(e) + 1e-9, mine = e === me();
  const say = (h) => { if (mine) feed(h); };
  const hot = dest && dest.hot !== undefined ? dest.hot : undefined;
  if (hot !== undefined && it.kind !== LOOT.GUN && it.kind !== LOOT.HEAL) return '핫바엔 총·회복템만 꽂는다';
  switch (it.kind){
    case LOOT.GUN: {
      const g = { gi:it.gun, ld:it.ld };
      if (dest === 'bag') e.gb.push(g); else addGun(e, g, hot);
      say('<i>획득</i> ' + GUNS[it.gun].n);
      return null;
    }
    case LOOT.AMMO: {
      const t = Math.min(it.n, Math.floor(room / AMMO[it.am].w));
      if (t <= 0) return '가방이 가득 찼다 (' + Math.round(bagW(e)) + '/' + bagCap(e) + ')';
      e.bag[it.am] += t; it.n -= t; say('<i>획득</i> ' + AMMO[it.am].n + ' ' + t + '발');
      return it.n > 0 ? 'part' : null;
    }
    case LOOT.HEAL: {
      const k = HEAL_ORDER[it.sub], n = it.n || 1, t = Math.min(n, Math.floor(room / HEAL_W[k]));
      if (t <= 0) return '가방이 가득 찼다 — ' + HEALS[k].n + ' ' + HEAL_W[k] + ' 필요';
      e.inv[k] += t; it.n = n - t; say('<i>획득</i> ' + HEALS[k].n + (t > 1 ? ' ×' + t : ''));
      if (hot !== undefined){ putOut(e, hot); e.hot[hot] = { t:'heal', k }; }
      return it.n > 0 ? 'part' : null;
    }
    case LOOT.HELM:
      if (it.sub <= e.helm) return '더 좋은 헬멧을 쓰고 있다';
      if (e.helm) dropItemAt(e, { kind:LOOT.HELM, sub:e.helm, dur:e.helmD });
      e.helm = it.sub; e.helmD = it.dur ?? ARMOR[it.sub].dur; say('<i>착용</i> 헬멧 Lv' + it.sub);
      return null;
    case LOOT.VEST:
      if (it.sub <= e.vest) return '더 좋은 방탄복을 입고 있다';
      if (e.vest) dropItemAt(e, { kind:LOOT.VEST, sub:e.vest, dur:e.vestD });
      e.vest = it.sub; e.vestD = it.dur ?? ARMOR[it.sub].dur; say('<i>착용</i> 방탄복 Lv' + it.sub);
      return null;
    case LOOT.BAG:
      if (it.sub <= e.bagLv) return '더 큰 가방을 메고 있다';
      if (e.bagLv) dropItemAt(e, { kind:LOOT.BAG, sub:e.bagLv });
      e.bagLv = it.sub; say('<i>착용</i> 가방 Lv' + it.sub + ' (' + bagCap(e) + ')');
      return null;
  }
  return '못 줍는다';
}
// 바닥 전리품 i 를 e 가 줍는다 — 다 주우면 맵에서 사라진다
function takeLootBy(e, i, dest){
  const l = loots[i];
  if (!l || l.taken) return '없다';
  const r = takeItem(e, l, dest);
  if (r === null){ l.taken = true; hideLoot(i); if (nearLoot === i) nearLoot = -1; }
  return r;
}
function boxTakeBy(e, i, j, dest){
  const l = loots[i];
  if (!l || l.taken || l.kind !== LOOT.BOX || !l.items[j]) return '없다';
  const r = takeItem(e, l.items[j], dest);
  if (r === null) l.items.splice(j, 1);
  if (!l.items.length){ l.taken = true; hideLoot(i); }
  return r;
}
function tookMsg(r){                             // 내가 주운 결과를 알린다
  if (r === null) sTake();
  else if (r === 'part'){ sTake(); why('가방이 가득 차 일부만 주웠다'); }
  else why(r);
  hudGun(); if (invOpen) renderInv();
}
function takeLoot(i, dest){
  const l = loots[i];
  if (!l || l.taken) return;
  if (l.kind === LOOT.BOX){ openInv(); return; }   // 상자는 인벤토리에서 하나씩
  tookMsg(takeLootBy(me(), i, dest));
}
const takeFromBox = (i, j, dest) => tookMsg(boxTakeBy(me(), i, j, dest));
// 죽은 자리에 그 사람의 총(장전 탄째)·탄·회복템·방어구·가방 상자
function deathBox(e){
  const items = allGuns(e).map(gunLoot);
  for (const k of AMMO_ORDER) if (e.bag[k] > 0) items.push({ kind:LOOT.AMMO, am:k, n:e.bag[k] });
  HEAL_ORDER.forEach((k, sub) => { if (e.inv[k] > 0) items.push({ kind:LOOT.HEAL, sub, n:e.inv[k] }); });
  if (e.helm) items.push({ kind:LOOT.HELM, sub:e.helm, dur:e.helmD });
  if (e.vest) items.push({ kind:LOOT.VEST, sub:e.vest, dur:e.vestD });
  if (e.bagLv) items.push({ kind:LOOT.BAG, sub:e.bagLv });
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
    addGun(p, { gi:4, ld:GUNS[4].mag });
    for (const it of [{ kind:LOOT.AMMO, am:'7.62', n:15 }, { kind:LOOT.HEAL, sub:2, n:1 }]){
      if (takeItem(p, it) !== null) dropItem(it);   // 가방에 안 들어간 만큼은 발밑에
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
// 열면 마우스 잠금을 풀고 게임은 계속 간다. 왼쪽 주변(3m) · 가운데 가방 · 오른쪽 장비(핫바 5칸 + 방어구·가방).
// 클릭 = 줍기/사용/선택, 끌기(pointer 이벤트) = 핫바·가방·바닥으로 옮기기, 우클릭 = 메뉴. 목록은 DOM 으로 만든다.
let invOpen = false, invT = 0, drag = null;
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
  invOpen = false; invEl.hidden = true; invMenu.hidden = true; endDrag();
  if (!noLock && playing && !over) lockMouse();
}
function el(tag, cls, text){
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  if (text !== undefined) d.textContent = text;
  return d;
}
// 한 줄 — src 가 있으면 끌어서 옮길 수 있다. 그냥 누르면 onClick, 우클릭은 onMenu
function row(text, sub, src, onClick, onMenu){
  const r = el('div', 'row' + (onClick || src ? ' act' : ''));
  r.appendChild(el('span', '', text));
  if (sub) r.appendChild(el('i', '', sub));
  r.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); invMenu.hidden = true;
    drag = { src, onClick, x0:e.clientX, y0:e.clientY, moved:false, ghost:null, label:text };
  });
  if (onMenu) r.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); onMenu(e); });
  return r;
}
function dropTarget(e){
  const x = document.elementFromPoint(e.clientX, e.clientY), z = x && x.closest('#inv [data-drop]');
  if (!z) return null;
  const v = z.dataset.drop;
  return { el:z, dest: v.startsWith('hot') ? { hot:+v.slice(3) } : v };   // { hot:s } · 'bag' · 'ground'
}
function endDrag(){
  if (drag && drag.ghost) drag.ghost.remove();
  invEl.querySelectorAll('.over').forEach(x => x.classList.remove('over'));
  drag = null;
}
addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.moved && drag.src && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 5){
    drag.moved = true; drag.ghost = el('div', 'ghost', drag.label); invEl.appendChild(drag.ghost);
  }
  if (!drag.ghost) return;
  const b = invEl.getBoundingClientRect();
  drag.ghost.style.left = (e.clientX - b.left + 12) + 'px'; drag.ghost.style.top = (e.clientY - b.top + 8) + 'px';
  invEl.querySelectorAll('.over').forEach(x => x.classList.remove('over'));
  const t = dropTarget(e); if (t) t.el.classList.add('over');
});
addEventListener('pointerup', (e) => {
  if (!drag) return;
  const d = drag, t = d.moved ? dropTarget(e) : null;
  endDrag();
  if (d.moved){ if (t) moveItem(d.src, t.dest); }
  else if (d.onClick) d.onClick();
  renderInv();
});
// 끌어 놓기·우클릭 메뉴가 같이 쓰는 옮기기
//   src: { near:i [, j] } · { hot:s } · { bagGun:j } · { bagHeal:k } · { bagAmmo:k }
//   dest: { hot:s } · 'bag' · 'ground'
function moveItem(src, dest){
  const p = me();
  if (src.near !== undefined){
    if (dest === 'ground') return;
    if (src.j !== undefined) takeFromBox(src.near, src.j, dest); else takeLoot(src.near, dest);
    return;
  }
  if (src.hot !== undefined){
    const it = p.hot[src.hot]; if (!it) return;
    if (dest === 'bag') putOut(p, src.hot);
    else if (dest === 'ground'){
      p.hot[src.hot] = null;
      if (it.t === 'gun'){ dropItem(gunLoot(it.g)); feed('<i>버림</i> ' + GUNS[it.g.gi].n); }
      if (src.hot === p.sel) afterHeld();
    } else if (dest.hot !== src.hot){            // 핫바 칸끼리 자리 바꾸기
      const o = p.hot[dest.hot]; p.hot[dest.hot] = it; p.hot[src.hot] = o;
      if (src.hot === p.sel || dest.hot === p.sel) afterHeld();
    }
  } else if (src.bagGun !== undefined){
    const g = p.gb[src.bagGun]; if (!g) return;
    if (dest === 'ground'){ p.gb.splice(src.bagGun, 1); dropItem(gunLoot(g)); feed('<i>버림</i> ' + GUNS[g.gi].n); }
    else if (dest.hot !== undefined){ p.gb.splice(src.bagGun, 1); addGun(p, g, dest.hot); }
  } else if (src.bagHeal !== undefined){
    if (dest === 'ground') dropHeal(src.bagHeal, p.inv[src.bagHeal]);
    else if (dest.hot !== undefined){ putOut(p, dest.hot); p.hot[dest.hot] = { t:'heal', k:src.bagHeal }; }
  } else if (src.bagAmmo !== undefined){
    if (dest === 'ground') dropAmmo(src.bagAmmo, p.bag[src.bagAmmo]);
    else if (dest.hot !== undefined) why('핫바엔 총·회복템만 꽂는다');
  }
  hudGun();
}
function menu(e, opts){                          // 우클릭 메뉴
  invMenu.replaceChildren(...opts.map(([t, f]) => { const b = el('button', '', t); b.addEventListener('click', (ev) => { ev.stopPropagation(); invMenu.hidden = true; f(); renderInv(); }); return b; }));
  const box = invEl.getBoundingClientRect();
  invMenu.style.left = Math.min(e.clientX - box.left, box.width - 170) + 'px';
  invMenu.style.top = Math.min(e.clientY - box.top, box.height - 40 - opts.length * 30) + 'px';
  invMenu.hidden = false;
}
const hotOpts = (src) => [0,1,2,3,4].map(s => ['핫바 ' + (s+1) + '번에 넣기', () => moveItem(src, { hot:s })]);
function dropAmmo(k, n){
  const p = me(); n = Math.min(n, p.bag[k]); if (n <= 0) return;
  p.bag[k] -= n; dropItem({ kind:LOOT.AMMO, am:k, n }); feed('<i>버림</i> ' + AMMO[k].n + ' ' + n + '발');
  hudGun();
}
function dropHeal(k, n){
  const p = me(); n = Math.min(n, p.inv[k]); if (n <= 0) return;
  if (p.healKind === k && p.inv[k] - n <= 0){ p.healT = 0; p.healKind = null; }
  p.inv[k] -= n; dropItem({ kind:LOOT.HEAL, sub:HEAL_ORDER.indexOf(k), n }); feed('<i>버림</i> ' + HEALS[k].n + (n > 1 ? ' ×' + n : ''));
  tidyHot(p); hudGun();
}
function dropGear(kind){
  const p = me();
  if (kind === LOOT.HELM && p.helm){ dropItem({ kind, sub:p.helm, dur:p.helmD }); p.helm = 0; p.helmD = 0; }
  else if (kind === LOOT.VEST && p.vest){ dropItem({ kind, sub:p.vest, dur:p.vestD }); p.vest = 0; p.vestD = 0; }
  else if (kind === LOOT.BAG && p.bagLv){
    if (bagW(p) > BAG_CAP[0]){ why('가방을 벗으면 ' + BAG_CAP[0] + ' 를 넘는다 — 먼저 덜어 내라'); return; }
    dropItem({ kind, sub:p.bagLv }); p.bagLv = 0;
  }
  hudGun();
}
const half = (n) => Math.max(1, Math.ceil(n / 2));
const firstFree = (p) => { const s = p.hot.findIndex(x => !x); return s < 0 ? p.sel : s; };
function renderInv(){
  if (!invOpen || drag) return;                  // 끄는 중엔 다시 그리지 않는다
  const p = me();
  invW.textContent = '무게 ' + Math.round(bagW(p)) + ' / ' + bagCap(p);
  // 주변 3m — 바닥에 놓기의 목적지
  const near = [];
  loots.forEach((l, i) => {
    if (l.taken || Math.hypot(l.x-p.x, l.z-p.z) > 3 || Math.abs(l.y-p.y) > 2.5) return;
    const opts = (it, src) => (it.kind === LOOT.GUN || it.kind === LOOT.HEAL ? hotOpts(src) : []).concat([['가방에 넣기', () => moveItem(src, 'bag')]]);
    if (l.kind === LOOT.BOX){
      near.push(el('div', 'grp', l.name));
      l.items.forEach((it, j) => { const src = { near:i, j }; near.push(row(itemName(it), null, src, () => takeFromBox(i, j), (e) => menu(e, opts(it, src)))); });
    } else { const src = { near:i }; near.push(row(itemName(l), null, src, () => takeLoot(i), (e) => menu(e, opts(l, src)))); }
  });
  invNear.replaceChildren(...(near.length ? near : [el('div', 'none', '주변에 아무것도 없다')]));
  // 가방 — 탄 · 회복템 · 총
  const bag = [];
  for (const k of AMMO_ORDER) if (p.bag[k] > 0){
    const n = p.bag[k];
    bag.push(row(AMMO[k].n, n + '발 · ' + Math.round(n * AMMO[k].w * 10)/10, { bagAmmo:k }, null,
      (e) => menu(e, [['전부 버리기 (' + n + ')', () => dropAmmo(k, n)], ['절반 버리기 (' + half(n) + ')', () => dropAmmo(k, half(n))]])));
  }
  for (const k of HEAL_ORDER) if (p.inv[k] > 0){
    const n = p.inv[k];
    bag.push(row(HEALS[k].n + ' ×' + n, '클릭 사용 · ' + n * HEAL_W[k], { bagHeal:k }, () => heal(k),
      (e) => menu(e, hotOpts({ bagHeal:k }).concat([['전부 버리기 (' + n + ')', () => dropHeal(k, n)], ['절반 버리기 (' + half(n) + ')', () => dropHeal(k, half(n))]]))));
  }
  p.gb.forEach((g, j) => {
    const src = { bagGun:j };
    bag.push(row(GUNS[g.gi].n, g.ld + '발 · ' + AMMO[GUNS[g.gi].am].n + ' · 무게 0', src, () => moveItem(src, { hot:firstFree(p) }),
      (e) => menu(e, hotOpts(src).concat([['버리기', () => moveItem(src, 'ground')]]))));
  });
  invBag.replaceChildren(...(bag.length ? bag : [el('div', 'none', '비었다')]));
  // 장비 — 핫바 5칸(놓기 목적지) + 방어구·가방
  const eq = [el('div', 'grp', '핫바 — 1~5 · 휠')];
  p.hot.forEach((it, s) => {
    const src = it ? { hot:s } : null;
    const text = (s+1) + '  ' + (!it ? '빈 칸' : it.t === 'gun' ? GUNS[it.g.gi].n : HEALS[it.k].n + ' ×' + p.inv[it.k]);
    const sub = !it ? (s === p.sel ? '손에 (맨손)' : null) : it.t === 'gun' ? it.g.ld + '발 · ' + AMMO[GUNS[it.g.gi].am].n + (s === p.sel ? ' · 손에' : '') : '바로가기';
    const r = row(text, sub, src, it ? () => selectSlot(s) : null,
      it ? (e) => menu(e, [['가방에 넣기', () => moveItem(src, 'bag')]].concat(it.t === 'gun' ? [['버리기', () => moveItem(src, 'ground')]] : [])) : null);
    r.dataset.drop = 'hot' + s; r.classList.add('slot'); if (s === p.sel) r.classList.add('sel');
    eq.push(r);
  });
  eq.push(el('div', 'grp', '방어구 · 가방'));
  eq.push(row('헬멧 — ' + (p.helm ? 'Lv' + p.helm : '없음'), p.helm ? '내구 ' + Math.round(p.helmD) : null, null, null, p.helm ? (e) => menu(e, [['버리기', () => dropGear(LOOT.HELM)]]) : null));
  eq.push(row('방탄복 — ' + (p.vest ? 'Lv' + p.vest : '없음'), p.vest ? '내구 ' + Math.round(p.vestD) : null, null, null, p.vest ? (e) => menu(e, [['버리기', () => dropGear(LOOT.VEST)]]) : null));
  eq.push(row('가방 — ' + (p.bagLv ? 'Lv' + p.bagLv : '없음'), '용량 ' + bagCap(p), null, null, p.bagLv ? (e) => menu(e, [['버리기', () => dropGear(LOOT.BAG)]]) : null));
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
  tidyHot(p); hudGun();
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
  const p = me(), h = heldGun(p);
  const g = h ? GUNS[h.gi] : null;
  gunN.textContent = g ? g.n : '맨손 (주먹)';
  gunA.innerHTML = g ? (h.ld + ' <s>/ ' + AMMO[g.am].n + ' ' + p.bag[g.am] + '</s>') : '— <s>/ —</s>';
  gunR.textContent = p.reload > 0 ? '재장전…' : (p.healT > 0 ? '치료 중…' : '');
  const slots = p.hot.map((it, i) => {
    const t = !it ? '—' : it.t === 'gun' ? GUNS[it.g.gi].n : HEALS[it.k].n + '×' + p.inv[it.k];
    return (i===p.sel ? '<b>' : '') + (i+1) + ' ' + t + (i===p.sel ? '</b>' : '');
  }).join('  ') + (p.gb.length ? '  · 가방 총 ' + p.gb.length : '');
  const arm = '헬멧 ' + (p.helm ? '<b>Lv'+p.helm+'</b>' : '—')
            + '  방탄 ' + (p.vest ? '<b>Lv'+p.vest+'</b>' : '—');
  const inv = '붕대 <b>'+p.inv.band+'</b> 상자 <b>'+p.inv.kit+'</b> 킷 <b>'+p.inv.med+'</b> 드링크 <b>'+p.inv.drink+'</b>'
            + '  가방 ' + (p.bagLv ? 'Lv'+p.bagLv : '—') + ' <b>' + Math.round(bagW(p)) + '/' + bagCap(p) + '</b>';
  gunS.innerHTML = slots + '<br>' + arm + '<br>' + inv;
  hpFill.style.width = Math.max(0, p.hp) + '%';
  hpBar.classList.toggle('low', p.hp < 35);
  vitL.textContent = 'HP ' + Math.max(0, Math.round(p.hp))
    + (p.boost > 0 ? '  부스트 ' + Math.round(p.boost) : '')
    + '   ' + (riding ? '지프 ' + Math.ceil(riding.hp) + '/' + CAR.hp : STANCE[p.st].n)
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
  $id('result').hidden = false; $id('intro').hidden = true;      // 홈 탭이 결과를 보여 준다
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
  endAt = performance.now() + 2800; endWon = !!won;   // 2.8초 동안 내 캐릭터를 비추고 결과 화면 (updateMyView)
  panel('home'); matchEnd(placed);               // 결과를 서버에 — 코인은 서버가 계산
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
  const dn = /^Digit([1-5])$/.exec(e.code);      // 1~5 = 핫바 (lastdrop-06)
  if (dn) selectSlot(+dn[1] - 1);
});
addEventListener('wheel', (e) => { if (playing && locked && !over) cycleSlot(e.deltaY > 0 ? 1 : -1); }, { passive:true });
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
  const p = me(), h = heldGun(p);
  if (p.drop !== 'ground') return '착지 전에는 못 쏜다';
  if (riding) return '운전 중 — E 로 내린다';
  if (p.healT > 0) return '치료 중';
  if (!h) return null;                           // 맨손은 주먹
  if (p.reload > 0) return '재장전 중';
  if (h.ld <= 0 && p.bag[GUNS[h.gi].am] <= 0) return '탄약 없음 — ' + AMMO[GUNS[h.gi].am].n;
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
  const s = 0.0021 * SET.sens * (scoped ? 0.45 : 1);   // [설정] 마우스 감도
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
        const h = heldGun(p), g = h && GUNS[h.gi];
        if (g){ const take = Math.min(g.mag - h.ld, p.bag[g.am]); h.ld += take; p.bag[g.am] -= take; }
        hudGun();
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
    const gd = heldDef(me());
    const sp = (gd ? gd.spread : 0.02) * (1 + bloom*1.7) * (scoped?0.3:1);
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
  updateMyView(dt);
  renderHome(dt);
  sun.position.set(me().x - 180, 150, me().z + 120);
  sun.target.position.set(me().x, 0, me().z);
  sun.target.updateMatrixWorld();
  if (veil.hidden) renderer.render(scene, cam);   // 홈·결과 화면이 덮은 동안엔 섬은 안 그린다
}

// ══ 시작 ══════════════════════════════════════════════════════
let elapsed = 0;
// ══ 홈 화면 · 계정 (28 문서) ═════════════════════════════════
// /game/api/me 로 로그인을 확인한다. 로그인 → 내 캐릭터 미리보기 · [게임 시작] [꾸미기] [로그아웃].
// 아니면 로그인 안내 + '로그인 없이 하기'(게스트 — 꾸미기·기록 저장 안 됨). 계정 서버에 못 닿으면 게스트로.
// 화면에 넣는 글자는 전부 textContent 다.
const acct = { user:null, csrf:null, guest:false, online:true, avatar:{ ...AV_DEFAULT }, saved:{ ...AV_DEFAULT },
               coins:0, owned:new Set(), stats:null, match:null };
const $id = (id) => document.getElementById(id);
const authEl = $id('auth'), nickEl = $id('nick'), levelEl = $id('level'), tabsEl = $id('tabs');
const dressBtn = $id('dressBtn'), outBtn = $id('outBtn'), shopBtn = $id('shopBtn'), recBtn = $id('recBtn'), setBtn = $id('setBtn');
const dressEl = $id('dress'), dressRows = $id('dressRows'), homeMsg = $id('homeMsg');
const shopEl = $id('shop'), shopRows = $id('shopRows'), recEl = $id('rec'), recBody = $id('recBody');
const coinEl = $id('coins'), coinMsg = $id('coinMsg');   // 승률은 [기록] 에서만 (30 검토 — 상단 바엔 없다)
const TABS = { home:$id('tabHome'), dress:dressEl, shop:shopEl, rec:recEl, settings:$id('settings'), auth:authEl };
async function api(path, opt = {}){
  const h = { 'Content-Type':'application/json' };
  if (opt.csrf) h['X-CSRF-Token'] = acct.csrf || '';
  const r = await fetch('/game/api/' + path, { method:opt.method || 'GET', headers:h, credentials:'same-origin',
                                               body: opt.body ? JSON.stringify(opt.body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { ok:r.ok, status:r.status, j };
}
function guestFlag(v){
  try { if (v === undefined) return sessionStorage.getItem('vtg_guest') === '1';
        if (v) sessionStorage.setItem('vtg_guest', '1'); else sessionStorage.removeItem('vtg_guest'); } catch (e) {}
  return false;
}
async function loadAccount(){                    // 전적·코인·보유 장식 — 서버 값만 쓴다
  try { const r = await api('lastdrop/stats'); if (r.ok && r.j){ acct.stats = r.j; acct.coins = r.j.coins; } } catch (e) {}
  try { const r = await api('lastdrop/shop'); if (r.ok && r.j){ acct.shop = r.j.items; acct.coins = r.j.coins;
        acct.owned = new Set(r.j.items.filter(i => i.owned).map(i => i.id)); } } catch (e) {}
  showHeader();
}
async function initHome(){
  let me = null;
  try { const r = await api('me'); if (r.ok && r.j) me = r.j; else acct.online = false; } catch (e) { acct.online = false; }
  if (me && me.user){
    acct.user = me.user; acct.csrf = me.csrf;
    try { const r = await api('lastdrop/avatar'); if (r.ok && r.j && r.j.avatar) acct.avatar = avNormalize(r.j.avatar); } catch (e) {}
    await loadAccount();
  } else acct.guest = guestFlag() || !acct.online;
  acct.saved = { ...acct.avatar };
  showHome();
}
// 레벨 — 아직 레벨 체계가 없어 판수로 정한다 (5판마다 1, 30 문서 · 정현 확인)
const levelOf = (st) => 1 + Math.floor(((st && st.games) || 0) / 5);
function showHeader(){
  const st = acct.stats;
  coinEl.textContent = acct.user ? '코인 ' + acct.coins : '';
  levelEl.textContent = acct.user ? 'Lv ' + levelOf(st) : acct.guest ? (acct.online ? '게스트 — 저장 안 됨' : '게스트 (계정 서버 없음)') : '';
}
function showHome(){
  const signed = !!acct.user, inn = signed || acct.guest;
  nickEl.textContent = signed ? acct.user.nickname : inn ? '게스트' : '로그인 필요';
  outBtn.textContent = signed ? '로그아웃' : '로그인';
  shopBtn.hidden = recBtn.hidden = !signed;       // 게스트는 상점·기록 없음
  tabsEl.hidden = !inn; playBtn.hidden = !inn;
  showHeader();
  setAvatar(acct.avatar);
  panel(inn ? 'home' : 'auth');
}
function panel(which){                           // 왼쪽 패널 — 탭 하나만 연다 (홈·꾸미기·상점·기록·설정·로그인)
  for (const [k, el] of Object.entries(TABS)) el.hidden = k !== which;
  tabsEl.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.tab === which));
  setBtn.classList.toggle('on', which === 'settings');
  homeMsg.textContent = '';
  if (which !== 'dress' && which !== 'shop'){ acct.avatar = { ...acct.saved }; setAvatar(acct.avatar); }   // 저장 안 한 꾸미기·써 보기는 되돌린다
}
$id('guestBtn').addEventListener('click', () => { guestFlag(true); acct.guest = true; showHome(); });
outBtn.addEventListener('click', async () => {
  if (acct.user){ try { await api('logout', { method:'POST', csrf:true }); } catch (e) {} }
  guestFlag(false);
  location.href = '/game/?next=/game/lastdrop/';
});
const el2 = (tag, cls, text) => { const d = document.createElement(tag); if (cls) d.className = cls; if (text !== undefined) d.textContent = text; return d; };
// ── 꾸미기: 색은 빠른 칸 + 자유 색 선택기(무료), 머리 모양, 부위별 장식(가진 것만)
function buildDress(){
  const rows = [];
  for (const k of Object.keys(AV_PRESET)){
    const row = el2('div', 'drow'); row.appendChild(el2('span', '', AV_COLOR_NAMES[k]));
    const opts = el2('div', 'dopts');
    AV_PRESET[k].forEach(hex => {
      const b = el2('button', 'sw' + (acct.avatar[k] === hex ? ' on' : '')); b.type = 'button'; b.style.background = hex; b.title = hex;
      b.addEventListener('click', () => { acct.avatar[k] = hex; setAvatar(acct.avatar); buildDress(); });
      opts.appendChild(b);
    });
    const pick = document.createElement('input'); pick.type = 'color'; pick.value = acct.avatar[k]; pick.title = AV_COLOR_NAMES[k] + ' — 자유 색';
    pick.setAttribute('aria-label', AV_COLOR_NAMES[k] + ' 자유 색');
    if (!AV_PRESET[k].includes(acct.avatar[k])) pick.classList.add('on');
    pick.addEventListener('input', () => { acct.avatar[k] = pick.value.toLowerCase(); setAvatar(acct.avatar); });
    opts.appendChild(pick);
    row.appendChild(opts); rows.push(row);
  }
  const hr = el2('div', 'drow'); hr.appendChild(el2('span', '', '머리 모양'));
  const ho = el2('div', 'dopts');
  AV_HAIRS.forEach((n, i) => { const b = el2('button', 'opt' + (acct.avatar.hair === i ? ' on' : ''), n); b.type = 'button';
    b.addEventListener('click', () => { acct.avatar.hair = i; setAvatar(acct.avatar); buildDress(); }); ho.appendChild(b); });
  hr.appendChild(ho); rows.push(hr);
  for (const [sl, nm] of Object.entries(AV_SLOTS)){
    const row = el2('div', 'drow'); row.appendChild(el2('span', '', nm));
    const opts = el2('div', 'dopts');
    const mine = Object.keys(SHOP_ITEMS).filter(id => SHOP_ITEMS[id].slot === sl && acct.owned.has(id));
    [null, ...mine].forEach(id => {
      const b = el2('button', 'opt' + (acct.avatar[sl] === id ? ' on' : ''), id ? SHOP_ITEMS[id].n : '없음'); b.type = 'button';
      b.addEventListener('click', () => { acct.avatar[sl] = id; setAvatar(acct.avatar); buildDress(); });
      opts.appendChild(b);
    });
    if (!mine.length) opts.appendChild(el2('i', 'dim', acct.user ? '상점에서 살 수 있다' : '로그인하면 상점'));
    row.appendChild(opts); rows.push(row);
  }
  dressRows.replaceChildren(...rows);
}
$id('homeBtn').addEventListener('click', () => panel('home'));
dressBtn.addEventListener('click', () => { panel('dress'); buildDress(); });
$id('cancelBtn').addEventListener('click', () => { acct.avatar = { ...acct.saved }; setAvatar(acct.avatar); buildDress(); });
setBtn.addEventListener('click', () => panel('settings'));
async function saveAvatar(){
  if (!acct.user){ acct.saved = { ...acct.avatar }; return '게스트는 저장되지 않는다 — 이번 접속에서만'; }
  try {
    const r = await api('lastdrop/avatar', { method:'PUT', csrf:true, body:{ avatar:acct.avatar } });
    if (r.ok){ acct.avatar = avNormalize(r.j.avatar); acct.saved = { ...acct.avatar }; return '저장했다'; }
    return (r.j && r.j.error) || '저장하지 못했다';
  } catch (e) { return '저장하지 못했다 — 연결을 확인해라'; }
}
$id('saveBtn').addEventListener('click', async () => {
  homeMsg.textContent = '저장 중…';
  const m = await saveAvatar(); homeMsg.textContent = m; buildDress();
});
// ── 상점: 코인으로 장식을 산다. 줄을 누르면 미리 써 본다, [구매] 는 한 번 더 눌러 확인
function buildShop(){
  const rows = [el2('div', 'shead', '보유 코인 ' + acct.coins)];
  for (const it of acct.shop || []){
    const row = el2('div', 'srow' + (acct.avatar[it.slot] === it.id ? ' on' : ''));
    row.appendChild(el2('span', '', it.name)); row.appendChild(el2('i', '', AV_SLOTS[it.slot]));
    const b = el2('button', it.owned ? 'own' : 'buy', it.owned ? (acct.saved[it.slot] === it.id ? '장착 중' : '장착') : it.price + ' 코인');
    b.type = 'button';
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (it.owned){ acct.avatar = { ...acct.saved, [it.slot]:it.id }; setAvatar(acct.avatar); homeMsg.textContent = await saveAvatar(); buildShop(); return; }
      if (b.dataset.sure !== '1'){ b.dataset.sure = '1'; b.textContent = it.price + ' 코인 — 확인'; return; }
      b.disabled = true;
      const r = await api('lastdrop/shop/buy', { method:'POST', csrf:true, body:{ item:it.id } }).catch(() => null);
      if (r && r.ok){ homeMsg.textContent = it.name + ' 샀다 — [장착] 을 누르면 쓴다'; await loadAccount(); }
      else homeMsg.textContent = (r && r.j && r.j.error) || '사지 못했다';
      buildShop();
    });
    row.appendChild(b);
    row.addEventListener('click', () => { acct.avatar = { ...acct.saved, [it.slot]:it.id }; setAvatar(acct.avatar); buildShop(); });   // 미리 써 보기
    rows.push(row);
  }
  shopRows.replaceChildren(...rows);
}
shopBtn.addEventListener('click', async () => { panel('shop'); await loadAccount(); buildShop(); });
// ── 기록 (29-b) — 항목 버튼 × 판 수 버튼. 서버는 최근 100판 원자료 + 전체 누적을 한 번에 주고, 계산은 여기서
const REC_METRICS = [
  ['win',   '승률',          (r) => pct(r.filter(m => m.place === 1).length, r.length), (t) => pct(t.wins, t.games)],
  ['top4',  'Top4 비율',     (r) => pct(r.filter(m => m.place <= 4).length, r.length), (t) => pct(t.top4, t.games)],
  ['place', '평균 순위',     (r) => r.length ? (sum(r, 'place') / r.length).toFixed(1) + '위' : null, (t) => t.games ? (t.placeSum / t.games).toFixed(1) + '위' : null],
  ['kills', '평균 킬',       (r) => r.length ? (sum(r, 'kills') / r.length).toFixed(2) : null, (t) => t.games ? (t.kills / t.games).toFixed(2) : null],
  ['acc',   '명중률',        (r) => pct(sum(r, 'hits'), sum(r, 'shots')), (t) => pct(t.hits, t.shots)],
  ['surv',  '평균 생존시간', (r) => r.length ? mmss(sum(r, 'survival') / r.length) : null, (t) => t.games ? mmss(t.survivalSum / t.games) : null],
];
const REC_PERIODS = [[5, '최근 5판'], [10, '최근 10판'], [50, '최근 50판'], [100, '최근 100판'], [0, '전체']];
const sum = (r, k) => r.reduce((a, m) => a + (m[k] || 0), 0);
const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : null;
const mmss = (sec) => Math.floor(sec / 60) + ':' + String(Math.floor(sec % 60)).padStart(2, '0');
const recSel = { m:'win', n:50 };
try { Object.assign(recSel, JSON.parse(localStorage.getItem('ld_rec') || '{}')); } catch (e) {}
function recValue(st, metric, n){                 // → { v: 값 또는 '—', have: 계산에 쓴 판 수 }
  const M = REC_METRICS.find(x => x[0] === metric) || REC_METRICS[0];
  if (n === 0){ const v = M[3](st.totals); return { v: v === null ? '—' : v, have: st.totals.games }; }
  const r = st.recent.slice(0, n), v = M[2](r);
  return { v: v === null ? '—' : v, have: r.length };
}
function buildRec(){
  const st = acct.stats && acct.stats.totals ? acct.stats : { totals:{ games:0, wins:0, top4:0, placeSum:0, kills:0, maxKills:0, shots:0, hits:0, survivalSum:0 }, recent:[] };
  const btnRow = (items, cur, onPick) => { const d = el2('div', 'rbtns');
    for (const [k, label] of items){ const b = el2('button', k === cur ? 'on' : '', label); b.type = 'button';
      b.addEventListener('click', () => { onPick(k); try { localStorage.setItem('ld_rec', JSON.stringify(recSel)); } catch (e) {} buildRec(); }); d.appendChild(b); }
    return d; };
  const M = REC_METRICS.find(x => x[0] === recSel.m) || REC_METRICS[0];
  const P = REC_PERIODS.find(x => x[0] === recSel.n) || REC_PERIODS[2];
  const main = recValue(st, M[0], P[0]);
  const big = el2('div', 'rbig');
  big.appendChild(el2('b', '', M[1] + ' ' + main.v));
  big.appendChild(el2('span', '', ' · ' + P[1] + (P[0] && main.have < P[0] && main.have > 0 ? ' (현재 ' + main.have + '판)' : P[0] === 0 ? ' (' + main.have + '판)' : '')));
  const cmp = el2('div', 'rcmp');                  // 다섯 기간을 나란히 — 추세
  for (const [n, label] of REC_PERIODS){
    const v = recValue(st, M[0], n), c = el2('div', 'rc' + (n === P[0] ? ' on' : ''));
    c.appendChild(el2('b', '', v.v)); c.appendChild(el2('span', '', n ? n + '판' + (v.have < n && v.have > 0 ? ' (' + v.have + ')' : '') : '전체'));
    cmp.appendChild(c);
  }
  const t = st.totals, acc = el2('div', 'rgrid');  // 누적
  for (const [k, v] of [['총 판수', t.games], ['치킨', t.wins], ['총 킬', t.kills], ['최다 킬', t.maxKills]]){
    const c = el2('div', 'rc'); c.appendChild(el2('b', '', String(v))); c.appendChild(el2('span', '', k)); acc.appendChild(c);
  }
  const list = el2('div', 'rlist');
  list.appendChild(el2('div', 'rh', '최근 10판'));
  if (!st.recent.length) list.appendChild(el2('div', 'dim', '아직 기록이 없다'));
  for (const m of st.recent.slice(0, 10)){
    const d = new Date(m.ts * 1000), row = el2('div', 'rr'), pad = (n) => String(n).padStart(2, '0');
    row.appendChild(el2('span', '', (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())));
    row.appendChild(el2('b', m.place === 1 ? 'win' : '', m.place === 1 ? '치킨' : '#' + m.place));
    row.appendChild(el2('span', '', m.kills + '킬'));
    row.appendChild(el2('span', '', mmss(m.survival)));
    list.appendChild(row);
  }
  recBody.replaceChildren(btnRow(REC_METRICS.map(x => [x[0], x[1]]), M[0], k => recSel.m = k),
                          btnRow(REC_PERIODS, P[0], n => recSel.n = n), big, cmp, el2('div', 'rh', '누적'), acc, list);
}
recBtn.addEventListener('click', async () => { panel('rec'); await loadAccount(); buildRec(); });
// ── 설정 — 소리 · 마우스 감도 (이 브라우저에만 저장)
const SET = { sound:true, sens:1 };
try { Object.assign(SET, JSON.parse(localStorage.getItem('ld_settings') || '{}')); } catch (e) {}
const setSound = $id('setSound'), setSens = $id('setSens'), setSensV = $id('setSensV');
function applySettings(){
  setSound.checked = !!SET.sound; setSens.value = SET.sens; setSensV.textContent = '×' + Number(SET.sens).toFixed(1);
  if (AU.g) AU.g.gain.value = SET.sound ? 0.55 : 0;
  try { localStorage.setItem('ld_settings', JSON.stringify(SET)); } catch (e) {}
}
setSound.addEventListener('change', () => { SET.sound = setSound.checked; applySettings(); });
setSens.addEventListener('input', () => { SET.sens = Math.max(0.4, Math.min(2.5, +setSens.value || 1)); applySettings(); });
applySettings();
// ── 판: 시작 때 서버에서 일회용 매치 토큰, 끝나면 토큰 + 결과를 내고 코인은 서버가 계산한다
let matchStartedAt = 0;
function matchBegin(){
  matchStartedAt = performance.now(); acct.match = null;
  if (!acct.user) return;
  acct.match = api('lastdrop/match/start', { method:'POST', csrf:true }).then(r => r.ok && r.j ? r.j.token : null).catch(() => null);
}
async function matchEnd(place){
  coinMsg.textContent = '';
  if (!acct.user){ coinMsg.textContent = acct.online ? '로그인하면 코인과 기록이 저장된다' : ''; return; }
  const tok = acct.match ? await acct.match : null;
  if (!tok){ coinMsg.textContent = '기록하지 못했다 — 계정 서버에 닿지 않았다'; return; }
  const body = { token:tok, place, kills, shots, hits, survival: Math.round((performance.now() - matchStartedAt) / 100) / 10 };
  try {
    const r = await api('lastdrop/match/end', { method:'POST', csrf:true, body });
    if (r.ok){ coinMsg.textContent = r.j.coins ? '+' + r.j.coins + ' 코인' : '기록했다 · 코인 없음 (4등 안에 들면 코인)';
               coinMsg.classList.toggle('got', !!r.j.coins); await loadAccount(); }
    else coinMsg.textContent = '기록되지 않았다 — ' + ((r.j && r.j.error) || r.status);
  } catch (e) { coinMsg.textContent = '기록하지 못했다 — 연결을 확인해라'; }
}
// ══ 홈 장면 (30 문서) — 노을 속을 나는 수송기 화물칸. 캐릭터는 열린 램프 앞에 선다 ════
// 하늘은 아래 진한 주황 → 위 연한 노랑·살구. 낮은 구름이 램프 너머로 흘러가고, 저 아래 섬 실루엣과 바다가 반짝인다.
// 조명: 열린 문 쪽 주황 역광(윤곽이 노을빛) + 실내 약한 보조광 + 천장 붉은 경고등 점멸. 텍스처 없이 색·형태만.
const pvCanvas = $id('home3d');
const pvR = new THREE.WebGLRenderer({ canvas:pvCanvas, antialias:true });
pvR.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
const pvScene = new THREE.Scene();
pvScene.fog = new THREE.Fog(0xf2a466, 160, 520);
const pvCam = new THREE.PerspectiveCamera(36, 1, 0.1, 900);
const HOME = { clouds:[], sparks:[], warn:[], warnLight:null, t:0, charH:2.35 };
let pvMesh = null, pvYaw = 0.35, pvDrag = null, myAvatar = null, myChute = null;
const OUT = new THREE.Group();                    // 램프 너머 바깥 — 기수를 든 채 나는 중이라 뒤로 보면 수평선이 위로 올라와 있다
OUT.rotation.x = 0.06; pvScene.add(OUT);
function buildHome(){
  const lerpStops = (stops, y, c) => {            // y 에 맞는 색 (stops: [[y, 색], ...] 오름차순)
    let i = 0; while (i < stops.length - 2 && y > stops[i + 1][0]) i++;
    const [y0, c0] = stops[i], [y1, c1] = stops[i + 1], k = Math.max(0, Math.min(1, (y - y0) / (y1 - y0)));
    return c.setHex(c0).lerp(new THREE.Color(c1), k);
  };
  // 하늘
  const skyG = new THREE.SphereGeometry(600, 32, 20), sp = skyG.attributes.position, sc = [], c = new THREE.Color();
  const SKY = [[-1, 0x7a2a16], [-0.08, 0xc8461e], [0.02, 0xe8642a], [0.12, 0xf5944a], [0.3, 0xffc283], [0.6, 0xffe2b0], [1, 0xfff0d2]];
  for (let i = 0; i < sp.count; i++){ lerpStops(SKY, sp.getY(i) / 600, c); sc.push(c.r, c.g, c.b); }
  skyG.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
  OUT.add(new THREE.Mesh(skyG, new THREE.MeshBasicMaterial({ vertexColors:true, side:THREE.BackSide, depthWrite:false, fog:false })));
  // 해 — 수평선 근처
  const sun = new THREE.Mesh(new THREE.CircleGeometry(18, 32), new THREE.MeshBasicMaterial({ color:0xfff1c4, fog:false }));
  sun.position.set(-70, 26, -520); OUT.add(sun);
  // 바다 · 반짝임
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshBasicMaterial({ color:0xb4532c }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -25; OUT.add(sea);   // 문으로 보이는 건 수평선 아래 몇 도뿐 — 바다를 그 안에
  const sparkMat = new THREE.MeshBasicMaterial({ color:0xffe4a8, transparent:true, opacity:0.9, depthWrite:false });
  for (let i = 0; i < 90; i++){
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sparkMat.clone());
    m.rotation.x = -Math.PI / 2; m.scale.set(2 + Math.random() * 6, 0.35 + Math.random() * 0.5, 1);
    m.position.set(-110 + Math.random() * 160, -24.8, -70 - Math.random() * 420);
    m.userData.ph = Math.random() * 6.28; m.userData.sp = 1.5 + Math.random() * 3;
    OUT.add(m); HOME.sparks.push(m);
  }
  // 섬 실루엣 — 저 멀리 아래
  const isl = new THREE.MeshBasicMaterial({ color:0x5a2a2e });
  for (const [x, z, r, h] of [[-30, -240, 45, 14], [45, -310, 35, 9], [-95, -360, 55, 16], [90, -420, 40, 11]]){
    const m = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 7), isl); m.scale.set(r, h, r * 0.6); m.position.set(x, -25 + h / 2, z); OUT.add(m);
  }
  // 구름 — 낮게 몇 겹. 램프 너머로 흘러간다
  const cloudMats = [0xffd2ae, 0xf7b58c, 0xffe1c4, 0xeea07c].map(col => new THREE.MeshBasicMaterial({ color:col, transparent:true, opacity:0.92 }));
  for (let i = 0; i < 26; i++){
    const g = new THREE.Group(), mat = cloudMats[i % 4], n = 3 + (i % 3);
    for (let k = 0; k < n; k++){ const b = new THREE.Mesh(BOX, mat); b.scale.set(14 + Math.random() * 18, 2.5 + Math.random() * 3, 8 + Math.random() * 10);
      b.position.set((k - n / 2) * 9 + Math.random() * 5, Math.random() * 2.5, Math.random() * 6 - 3); g.add(b); }
    const low = i % 4 !== 3;                       // 대부분 낮게 깔리고, 몇 개는 수평선 위 먼 하늘에
    g.position.set(-150 + Math.random() * 300, low ? -6 - Math.random() * 14 : 10 + Math.random() * 22, -40 - Math.random() * 480);
    g.userData.sp = 9 + (i % 4) * 3;
    OUT.add(g); HOME.clouds.push(g);
  }
  // 화물칸 — 바닥 · 벽 · 천장 · 늑골 · 열린 램프 (카메라는 +z 쪽, 램프는 -z 쪽)
  const metal = new THREE.MeshStandardMaterial({ color:0x4a4f52, roughness:0.85, metalness:0.2, flatShading:true });
  const dark = new THREE.MeshStandardMaterial({ color:0x2c2f31, roughness:0.9, flatShading:true });
  const rib = new THREE.MeshStandardMaterial({ color:0x666c70, roughness:0.7, metalness:0.3, flatShading:true });
  const box = (mat, x, y, z, w, h, d) => { const m = new THREE.Mesh(BOX, mat); m.scale.set(w, h, d); m.position.set(x, y, z); pvScene.add(m); return m; };
  const L0 = -9, L1 = 16;                          // 화물칸 z 범위
  box(dark, 0, -0.1, (L0 + L1) / 2, 5.2, 0.2, L1 - L0);                 // 바닥
  box(metal, -2.7, 1.8, (L0 + L1) / 2, 0.2, 3.8, L1 - L0);              // 왼벽
  box(metal, 2.7, 1.8, (L0 + L1) / 2, 0.2, 3.8, L1 - L0);               // 오른벽
  box(metal, 0, 3.75, (L0 + L1) / 2, 5.6, 0.2, L1 - L0);                // 천장
  box(metal, 0, 1.8, L1, 5.6, 3.8, 0.2);                                // 앞 칸막이 (카메라 뒤)
  for (let z = L0 + 0.6; z < L1; z += 1.5){                              // 늑골
    box(rib, -2.52, 1.8, z, 0.16, 3.6, 0.2); box(rib, 2.52, 1.8, z, 0.16, 3.6, 0.2); box(rib, 0, 3.58, z, 5.0, 0.14, 0.2);
  }
  box(rib, -2.45, 3.2, L0, 0.3, 1.2, 0.3); box(rib, 2.45, 3.2, L0, 0.3, 1.2, 0.3); box(rib, 0, 3.6, L0, 5.4, 0.3, 0.3);   // 문틀
  const ramp = box(dark, 0, -0.62, L0 - 1.9, 5.0, 0.16, 4.0); ramp.rotation.x = -0.28;                                      // 내려간 램프
  box(rib, -2.4, -0.5, L0 - 1.9, 0.12, 0.3, 4.0).rotation.x = -0.28; box(rib, 2.4, -0.5, L0 - 1.9, 0.12, 0.3, 4.0).rotation.x = -0.28;
  // 바닥 고정 띠 · 낙하산 가방
  const strap = new THREE.MeshStandardMaterial({ color:0xb89a3a, roughness:0.9 });
  for (const x of [-1.6, 1.6]) box(strap, x, 0.005, 2, 0.08, 0.02, 20);
  for (let z = -6; z < 14; z += 3) box(strap, 0, 0.006, z, 3.3, 0.02, 0.08);
  const bagM = new THREE.MeshStandardMaterial({ color:0x4f5a3a, roughness:0.95, flatShading:true });
  for (const [x, z] of [[-2.15, -3], [-2.15, -1.8], [2.15, -4.2], [2.15, 1.5]]){
    box(bagM, x, 0.32, z, 0.45, 0.64, 0.38); box(strap, x, 0.32, z + 0.2, 0.47, 0.06, 0.02); box(strap, x, 0.5, z + 0.2, 0.47, 0.06, 0.02);
  }
  // 천장 붉은 경고등
  const warnM = new THREE.MeshBasicMaterial({ color:0xff3b2a });
  for (const z of [-6, 0, 6]){ const w = box(warnM, 0, 3.6, z, 0.3, 0.1, 0.3); HOME.warn.push(w); }
  HOME.warnLight = new THREE.PointLight(0xff3b2a, 0.6, 9, 2); HOME.warnLight.position.set(0, 3.3, 0); pvScene.add(HOME.warnLight);
  // 조명 — 열린 문 쪽 주황 역광 + 실내 약한 보조광
  pvScene.add(new THREE.HemisphereLight(0xffc89a, 0x2a1810, 0.55));
  const back = new THREE.DirectionalLight(0xff9a48, 3.0); back.position.set(0.8, 2.6, -14); back.target.position.set(0, 1, 0); pvScene.add(back, back.target);
  const rim = new THREE.DirectionalLight(0xffb070, 1.4); rim.position.set(-3, 1.5, -8); rim.target.position.set(0, 1, 0); pvScene.add(rim, rim.target);
  const fill = new THREE.DirectionalLight(0xb4c2e0, 0.95); fill.position.set(1.5, 2.5, 10); fill.target.position.set(0, 1, 0); pvScene.add(fill, fill.target);
}
buildHome();
function setAvatar(a){
  a = avNormalize(a);
  if (pvMesh){ pvMesh.geometry.dispose(); pvMesh.geometry = avatarGeo(a); }
  else { pvMesh = new THREE.Mesh(avatarGeo(a), BOT_MAT); pvScene.add(pvMesh); }
  pvMesh.geometry.computeBoundingBox(); HOME.top = pvMesh.geometry.boundingBox.max.y;   // 지금 모습의 실제 키 (모자 포함)
  if (myAvatar){ myAvatar.geometry.dispose(); myAvatar.geometry = avatarGeo(a); }
}
pvCanvas.addEventListener('pointerdown', (e) => { pvDrag = { x:e.clientX, yaw:pvYaw }; pvCanvas.setPointerCapture(e.pointerId); });
pvCanvas.addEventListener('pointermove', (e) => { if (pvDrag) pvYaw = pvDrag.yaw + (e.clientX - pvDrag.x) * 0.012; });
pvCanvas.addEventListener('pointerup', () => { pvDrag = null; });
pvCanvas.addEventListener('pointercancel', () => { pvDrag = null; });
// 구도 — 크기는 가장 큰 모습(왕관·마녀 모자 2.35m)이 'UI 아래 영역' 높이의 78% 가 되게 카메라 거리를 고정하고
// (모자를 바꿔도 확대·축소가 튀지 않게), 지금 모습의 실제 키 가운데가 그 영역 세로 가운데에 오게 카메라 높이를 정한다.
// 창 크기가 바뀌어도 잘리지 않는다. 가로는 화면 가운데.
function frameHome(W, H){
  const top = Math.max(tabsEl.hidden ? 60 : tabsEl.getBoundingClientRect().bottom + 8, 60), bottom = 20;
  const avail = Math.max(120, H - top - bottom);
  const tanH = Math.tan(pvCam.fov * Math.PI / 360);
  const visH = HOME.charH / (0.78 * avail / H);                 // 화면 전체 높이에 해당하는 세계 높이
  let D = visH / (2 * tanH);
  D = Math.min(D, 14);                                           // 칸막이(z=16) 안쪽
  const visH2 = 2 * D * tanH;
  const yc = top + avail / 2, shift = (yc - H / 2) / H * visH2;  // 캐릭터 가운데를 화면 아래쪽으로 이만큼
  const cy = (HOME.top || HOME.charH) / 2 + shift;
  pvCam.position.set(0, cy, D); pvCam.lookAt(0, cy, 0);
  return { top, avail, D };
}
function renderHome(dt){
  if (veil.hidden || !pvMesh) return;
  const W = pvCanvas.clientWidth | 0, H = pvCanvas.clientHeight | 0;
  if (!W || !H) return;
  const sz = pvR.getSize(new THREE.Vector2());
  if (sz.x !== W || sz.y !== H){ pvR.setSize(W, H, false); pvCam.aspect = W / H; pvCam.updateProjectionMatrix(); }
  HOME.t += dt;
  frameHome(W, H);
  if (!pvDrag) pvYaw += dt * 0.25;
  pvMesh.rotation.y = pvYaw;
  pvMesh.scale.y = 1 + Math.sin(HOME.t * 1.7) * 0.012;            // 숨쉬기
  pvMesh.position.y = Math.sin(HOME.t * 1.7) * 0.004;
  for (const g of HOME.clouds){ g.position.z -= g.userData.sp * dt; if (g.position.z < -520) g.position.z = -30 - Math.random() * 40; }   // 비행 중
  for (const m of HOME.sparks) m.material.opacity = 0.25 + 0.65 * Math.max(0, Math.sin(HOME.t * m.userData.sp + m.userData.ph));
  const blink = 0.35 + 0.65 * Math.pow(Math.max(0, Math.sin(HOME.t * 2.2)), 3);   // 경고등 — 은은한 점멸
  for (const w of HOME.warn) w.material.color.setRGB(0.35 + 0.65 * blink, 0.12 + 0.12 * blink, 0.08);
  HOME.warnLight.intensity = 0.15 + 0.7 * blink;
  pvR.render(pvScene, pvCam);
}
// 게임 안의 내 모습 — 낙하 중엔 3인칭으로 보이고, 죽거나 이기면 결과 화면 전에 잠깐 비춘다
let endAt = 0, endWon = false;                  // 결과 화면을 띄울 시각 (performance.now) — 프레임이 느려도 2.8초
const CAM_FP = new THREE.Vector3(0, 0, 0), CAM_TP = new THREE.Vector3(0, 1.1, 5.5);
function updateMyView(dt){
  const p = me(), air = playing && (p.drop === 'free' || p.drop === 'chute');
  const endT = endAt ? (endAt - performance.now()) / 1000 : 0;
  const show = air || endT > 0;
  if (myAvatar){
    myAvatar.visible = show;
    if (show){
      myAvatar.position.set(p.x, p.y, p.z);
      if (endT > 0) myAvatar.rotation.set(endWon ? 0 : -Math.PI/2 * Math.min(1, (2.8 - endT) * 2.5), endWon ? myAvatar.rotation.y + dt*2 : yawO.rotation.y + Math.PI, 0, 'YXZ');
      else myAvatar.rotation.set(p.drop === 'free' ? 1.2 : 0, yawO.rotation.y + Math.PI, 0, 'YXZ');   // 자유낙하는 엎드려서
    }
  }
  if (!myChute){ myChute = chuteMesh(); myChute.visible = false; scene.add(myChute); }
  myChute.visible = air && p.drop === 'chute';
  if (myChute.visible) myChute.position.set(p.x, p.y + 4.4, p.z);
  cam.position.copy(show ? CAM_TP : CAM_FP);
  if (viewGun) viewGun.visible = !show && !(scoped && heldDef(me()) && heldDef(me()).scope);
  crossEl.style.visibility = show || (scoped && heldDef(me()) && heldDef(me()).scope) ? 'hidden' : '';   // 3인칭엔 조준점 없음
  if (endT > 0){                                 // 결과 화면 전 — 내 캐릭터를 중심으로 천천히 돈다
    yawO.position.set(p.x, p.y + 1.2, p.z); yawO.rotation.y += dt * 0.6; pitO.rotation.x = -0.45;
    yawO.updateMatrixWorld(true); cam.lookAt(p.x, p.y + 0.4, p.z);   // 판이 끝났으니 카메라 각도는 되돌리지 않는다
  }
  else if (endAt){ endAt = 0; veil.hidden = false; hudEl.hidden = true; }
}

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
  myAvatar = new THREE.Mesh(avatarGeo(acct.avatar), BOT_MAT); myAvatar.visible = false; scene.add(myAvatar);
  playBtn.disabled = false;
  playBtn.textContent = '게임 시작';
  requestAnimationFrame(frame);
}
function start(){
  audio();
  veil.hidden = true;
  hudEl.hidden = false;
  if (over) { location.reload(); return; }     // 다음 판은 새 섬에서
  playing = true;
  matchBegin();                                  // 로그인이면 서버에서 매치 토큰 (29 문서)
  feed('<i>수송기 — Space 로 이탈한다</i>');
  lockMouse();
}
playBtn.addEventListener('click', (e) => { e.stopPropagation(); start(); });
// (예전엔 시작 화면 아무 데나 눌러도 시작했다 — 꾸미기 버튼과 겹쳐 [게임 시작] 으로만)
boot();
initHome();
