"""game_accounts.py — /game 게임 계정 + 라스트 드롭 캐릭터 꾸미기 API (Flask Blueprint)

배치: 이 레포의 server/game_accounts.py 를 deploy.sh 가 valuetopic/ 옆으로 복사하고,
      valuetopic/app.py 가 import 해서 register_blueprint 한다 (문서 28-accounts-lastdrop-home).

사이트의 /_sec_ 로그인(비공개 투자 모니터 계정)과는 완전히 따로다:
  - DB 따로:     valuetopic/data/game_accounts/game_accounts.db  (GAME_ACCOUNTS_DB 로 바꿀 수 있다)
  - 쿠키 따로:   vtg_sess, Path=/game — Flask session 쿠키·secret key 를 쓰지 않는다
  - 공개 가입이 그쪽 계정 등록부에 섞이지 않고, 30일 유지가 관리자 세션에 번지지 않는다.

보안
  - 비밀번호: argon2id 해시만 저장 (argon2-cffi). 없는 아이디도 더미 검증으로 시간을 맞춘다.
  - 세션: 랜덤 토큰을 쿠키로, DB 엔 그 sha256 만. HttpOnly · Secure · SameSite=Lax · 30일.
  - CSRF: 로그인 상태의 변경 요청은 X-CSRF-Token 헤더(세션마다 다른 값) 필수.
          가입·로그인은 Origin 이 같은 호스트여야 하고 JSON 만 받는다(다른 사이트 폼으로는 못 보낸다).
  - 실패 잠금: 같은 아이디 또는 같은 IP 로 10분에 5번 틀리면 잠금. 가입은 IP 당 1시간에 5번.
              기록은 DB 에 — 재기동해도 유지된다.
  - SQL 은 전부 파라미터 바인딩. 응답은 JSON 뿐이고, 화면은 textContent 로만 넣는다.
"""
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
from urllib.parse import urlparse

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from flask import Blueprint, jsonify, request

game_bp = Blueprint('game_accounts', __name__)

DB_PATH = os.environ.get('GAME_ACCOUNTS_DB') or os.path.join(
    os.path.dirname(os.path.abspath(__file__)), 'data', 'game_accounts', 'game_accounts.db')

COOKIE = 'vtg_sess'
SESSION_TTL = 30 * 24 * 3600
LOGIN_WINDOW, LOGIN_MAX = 600, 5          # 10분에 5번
REG_WINDOW, REG_MAX = 3600, 5             # 1시간에 5번
ID_RE = re.compile(r'^[A-Za-z0-9]{4,16}$')
NICK_BAD = re.compile(r'[\x00-\x1f\x7f<>]')
# 꾸미기 v2 (29 문서) — 색은 자유(#rrggbb, 무료), 머리 모양 0~2, 장식은 머리·얼굴·등 부위별 1개(보유한 것만)
HEX_RE = re.compile(r'^#[0-9a-f]{6}$')
AV_COLORS = ('skin', 'hairColor', 'top', 'bottom', 'bag')
AV_SLOTS = ('head', 'face', 'back')
# 상점 — 가격은 여기 한 곳(서버)에서만 정한다. 클라이언트가 보낸 가격은 안 믿는다
SHOP = {
    'pumpkin':    ('할로윈 호박 모자', 'head', 30),
    'witch':      ('마녀 모자',        'head', 30),
    'beanie':     ('비니',             'head', 10),
    'cap':        ('캡',               'head', 10),
    'crown':      ('왕관',             'head', 100),
    'sunglasses': ('선글라스',         'face', 15),
    'goggles':    ('고글',             'face', 20),
    'skull':      ('해골 가면',        'face', 40),
    'cape':       ('망토',             'back', 50),
    'scarf':      ('스카프',           'back', 15),
}
# 코인 — 순위별 (1~4등), 5등 이하 0. 매치 검증 (29 문서)
COIN_BY_PLACE = {1: 10, 2: 3, 3: 2, 4: 1}
N_PLAYERS = 16
MIN_MATCH = 180            # 판 길이 최소 3분 (서버가 잰 토큰 발급 ~ 결과 제출)
TOKEN_TTL = 3600           # 토큰은 1시간 안에 써야 한다
MAX_PER_HOUR = 12          # 계정당 시간당 코인 받는 판 수
MAX_TOKENS_PER_HOUR = 40   # 토큰 발급 남용 방지

_ph = PasswordHasher()                    # argon2id 기본값 (m=64MiB, t=3, p=4)
_DUMMY = _ph.hash(secrets.token_hex(16))


def _db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    fresh = not os.path.exists(DB_PATH)
    conn = sqlite3.connect(DB_PATH, timeout=5)
    conn.row_factory = sqlite3.Row
    if fresh:
        os.chmod(DB_PATH, 0o600)
    conn.executescript('''
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS users(
            id INTEGER PRIMARY KEY,
            username TEXT NOT NULL UNIQUE COLLATE NOCASE,
            nickname TEXT NOT NULL UNIQUE COLLATE NOCASE,
            pw_hash TEXT NOT NULL,
            created_ts REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            csrf TEXT NOT NULL,
            created_ts REAL NOT NULL,
            expires_ts REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS hits(kind TEXT NOT NULL, key TEXT NOT NULL, ts REAL NOT NULL);
        CREATE INDEX IF NOT EXISTS hits_k ON hits(kind, key, ts);
        CREATE TABLE IF NOT EXISTS avatars(
            user_id INTEGER PRIMARY KEY, game TEXT NOT NULL, data TEXT NOT NULL, updated_ts REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS matches(
            id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, token_hash TEXT NOT NULL UNIQUE,
            issued_ts REAL NOT NULL, ended_ts REAL, place INTEGER, kills INTEGER, survival REAL,
            shots INTEGER, hits INTEGER, coins INTEGER, status TEXT NOT NULL DEFAULT 'open');
        CREATE INDEX IF NOT EXISTS matches_u ON matches(user_id, status, ended_ts);
        CREATE TABLE IF NOT EXISTS wallet(user_id INTEGER PRIMARY KEY, coins INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS coin_log(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, delta INTEGER NOT NULL,
            reason TEXT NOT NULL, ts REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS owned(user_id INTEGER NOT NULL, item TEXT NOT NULL, ts REAL NOT NULL,
            PRIMARY KEY(user_id, item));
        CREATE TABLE IF NOT EXISTS rejects(id INTEGER PRIMARY KEY, user_id INTEGER, reason TEXT NOT NULL,
            payload TEXT, ts REAL NOT NULL);
    ''')
    return conn


def _ip():
    # Cloudflare 터널 뒤라 Flask 는 늘 127.0.0.1 을 본다 — 그때만 터널이 붙인 실제 IP 를 믿는다
    ra = request.remote_addr or ''
    if ra in ('127.0.0.1', '::1'):
        return (request.headers.get('CF-Connecting-IP') or ra).strip()[:64]
    return ra[:64]


def _err(msg, code=400, **extra):
    r = jsonify({'error': msg, **extra})
    r.status_code = code
    return r


@game_bp.after_request
def _no_store(resp):
    if request.path.startswith('/game/api/'):
        resp.headers['Cache-Control'] = 'no-store'
        resp.headers['X-Content-Type-Options'] = 'nosniff'
    return resp


def _same_origin_json():
    """가입·로그인처럼 세션이 없는 POST — JSON 이어야 하고 Origin 이 이 호스트여야 한다."""
    if not request.is_json:
        return _err('JSON 으로 보내야 한다', 415)
    origin = request.headers.get('Origin')
    if origin and urlparse(origin).netloc != request.host:
        return _err('다른 사이트에서 온 요청', 403)
    if not origin and request.headers.get('Sec-Fetch-Site') not in (None, 'same-origin', 'none'):
        return _err('다른 사이트에서 온 요청', 403)
    if (request.content_length or 0) > 4096:
        return _err('요청이 너무 크다', 413)
    return None


def _hits(conn, kind, key, window):
    return conn.execute('SELECT COUNT(*), MIN(ts) FROM hits WHERE kind=? AND key=? AND ts>?',
                        (kind, key, time.time() - window)).fetchone()


def _hit(conn, kind, key):
    conn.execute('INSERT INTO hits(kind, key, ts) VALUES(?,?,?)', (kind, key, time.time()))
    conn.execute('DELETE FROM hits WHERE ts < ?', (time.time() - 2 * REG_WINDOW,))


def _current(conn):
    """쿠키의 세션 → (user row, session row) 또는 (None, None)"""
    tok = request.cookies.get(COOKIE)
    if not tok or len(tok) > 100:
        return None, None
    th = hashlib.sha256(tok.encode()).hexdigest()
    s = conn.execute('SELECT * FROM sessions WHERE token_hash=? AND expires_ts>?', (th, time.time())).fetchone()
    if not s:
        return None, None
    u = conn.execute('SELECT id, username, nickname FROM users WHERE id=?', (s['user_id'],)).fetchone()
    return (u, s) if u else (None, None)


def _need_csrf(s):
    got = request.headers.get('X-CSRF-Token', '')
    return hmac.compare_digest(got, s['csrf'])


def _start_session(conn, uid):
    tok, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(24)
    now = time.time()
    conn.execute('INSERT INTO sessions VALUES(?,?,?,?,?)',
                 (hashlib.sha256(tok.encode()).hexdigest(), uid, csrf, now, now + SESSION_TTL))
    conn.execute('DELETE FROM sessions WHERE expires_ts < ?', (now,))
    return tok, csrf


def _with_cookie(resp, tok):
    resp.set_cookie(COOKIE, tok, max_age=SESSION_TTL, path='/game',
                    httponly=True, secure=True, samesite='Lax')
    return resp


def _me_json(u, csrf):
    return {'user': {'username': u['username'], 'nickname': u['nickname']}, 'csrf': csrf}


@game_bp.route('/game/api/register', methods=['POST'])
def register():
    bad = _same_origin_json()
    if bad:
        return bad
    d = request.get_json(silent=True) or {}
    uname = d.get('username') if isinstance(d.get('username'), str) else ''
    nick = (d.get('nickname') if isinstance(d.get('nickname'), str) else '').strip()
    pw = d.get('password') if isinstance(d.get('password'), str) else ''
    pw2 = d.get('password2') if isinstance(d.get('password2'), str) else ''
    if not ID_RE.match(uname):
        return _err('아이디는 영문·숫자 4~16자')
    if not (2 <= len(nick) <= 12) or NICK_BAD.search(nick):
        return _err('닉네임은 2~12자 (꺾쇠·제어문자 제외)')
    if not (8 <= len(pw) <= 128):
        return _err('비밀번호는 8자 이상')
    if pw != pw2:
        return _err('비밀번호 확인이 다르다')
    conn = _db()
    try:
        ip = _ip()
        n, _ = _hits(conn, 'reg_ip', ip, REG_WINDOW)
        if n >= REG_MAX:
            return _err('계정을 너무 많이 만들었다 — 잠시 뒤에', 429)
        if conn.execute('SELECT 1 FROM users WHERE username=?', (uname,)).fetchone():
            return _err('이미 있는 아이디', 409, field='username')
        if conn.execute('SELECT 1 FROM users WHERE nickname=?', (nick,)).fetchone():
            return _err('이미 있는 닉네임', 409, field='nickname')
        _hit(conn, 'reg_ip', ip)
        cur = conn.execute('INSERT INTO users(username, nickname, pw_hash, created_ts) VALUES(?,?,?,?)',
                           (uname, nick, _ph.hash(pw), time.time()))
        tok, csrf = _start_session(conn, cur.lastrowid)
        conn.commit()
        u = conn.execute('SELECT id, username, nickname FROM users WHERE id=?', (cur.lastrowid,)).fetchone()
        return _with_cookie(jsonify(_me_json(u, csrf)), tok)
    except sqlite3.IntegrityError:
        return _err('이미 있는 아이디 또는 닉네임', 409)
    finally:
        conn.close()


@game_bp.route('/game/api/login', methods=['POST'])
def login():
    bad = _same_origin_json()
    if bad:
        return bad
    d = request.get_json(silent=True) or {}
    uname = d.get('username') if isinstance(d.get('username'), str) else ''
    pw = d.get('password') if isinstance(d.get('password'), str) else ''
    if not uname or not pw or len(uname) > 32 or len(pw) > 128:
        return _err('아이디·비밀번호를 넣어라')
    conn = _db()
    try:
        ip, ukey = _ip(), uname.lower()
        now = time.time()
        for kind, key in (('login_user', ukey), ('login_ip', ip)):
            n, first = _hits(conn, kind, key, LOGIN_WINDOW)
            if n >= LOGIN_MAX:
                wait = int(first + LOGIN_WINDOW - now) + 1
                return _err('로그인을 너무 많이 틀렸다 — %d초 뒤에 다시' % wait, 429, retry=wait)
        u = conn.execute('SELECT * FROM users WHERE username=?', (uname,)).fetchone()
        ok = False
        try:
            ok = _ph.verify(u['pw_hash'] if u else _DUMMY, pw) and bool(u)
        except (VerifyMismatchError, VerificationError, InvalidHashError):
            ok = False
        if not ok:
            _hit(conn, 'login_user', ukey)
            _hit(conn, 'login_ip', ip)
            conn.commit()
            return _err('아이디 또는 비밀번호가 틀렸다', 401)
        conn.execute('DELETE FROM hits WHERE kind=? AND key=?', ('login_user', ukey))
        if _ph.check_needs_rehash(u['pw_hash']):
            conn.execute('UPDATE users SET pw_hash=? WHERE id=?', (_ph.hash(pw), u['id']))
        tok, csrf = _start_session(conn, u['id'])
        conn.commit()
        return _with_cookie(jsonify(_me_json(u, csrf)), tok)
    finally:
        conn.close()


@game_bp.route('/game/api/logout', methods=['POST'])
def logout():
    conn = _db()
    try:
        u, s = _current(conn)
        if s:
            if not _need_csrf(s):
                return _err('CSRF 토큰이 맞지 않다', 403)
            conn.execute('DELETE FROM sessions WHERE token_hash=?', (s['token_hash'],))
            conn.commit()
        r = jsonify({'ok': True})
        r.delete_cookie(COOKIE, path='/game', secure=True, httponly=True, samesite='Lax')
        return r
    finally:
        conn.close()


@game_bp.route('/game/api/me', methods=['GET'])
def me():
    conn = _db()
    try:
        u, s = _current(conn)
        return jsonify(_me_json(u, s['csrf']) if u else {'user': None})
    finally:
        conn.close()


def _owned(conn, uid):
    return {r['item'] for r in conn.execute('SELECT item FROM owned WHERE user_id=?', (uid,))}


def _valid_avatar(a, owned):
    """v2 만 받는다. 색은 #rrggbb, 머리 모양 0~2, 장식은 그 부위의 아이템이고 보유한 것만."""
    keys = {'v', 'hair', *AV_COLORS, *AV_SLOTS}
    if not isinstance(a, dict) or a.get('v') != 2 or set(a) != keys:
        return None
    hair = a['hair']
    if not isinstance(hair, int) or isinstance(hair, bool) or not 0 <= hair <= 2:
        return None
    out = {'v': 2, 'hair': hair}
    for k in AV_COLORS:
        v = a[k]
        if not isinstance(v, str) or not HEX_RE.match(v.lower()):
            return None
        out[k] = v.lower()
    for slot in AV_SLOTS:
        v = a[slot]
        if v is None:
            out[slot] = None
            continue
        if not isinstance(v, str) or v not in SHOP or SHOP[v][1] != slot or v not in owned:
            return None
        out[slot] = v
    return out


@game_bp.route('/game/api/lastdrop/avatar', methods=['GET', 'PUT'])
def avatar():
    conn = _db()
    try:
        u, s = _current(conn)
        if not u:
            return _err('로그인이 필요하다', 401)
        if request.method == 'GET':
            row = conn.execute('SELECT data FROM avatars WHERE user_id=? AND game=?', (u['id'], 'lastdrop')).fetchone()
            return jsonify({'avatar': json.loads(row['data']) if row else None})
        if not _need_csrf(s):
            return _err('CSRF 토큰이 맞지 않다', 403)
        if not request.is_json or (request.content_length or 0) > 1024:
            return _err('JSON 1KB 이하로', 413)
        a = _valid_avatar((request.get_json(silent=True) or {}).get('avatar'), _owned(conn, u['id']))
        if a is None:
            return _err('꾸미기 값이 맞지 않다 (가지지 않은 장식이거나 형식이 틀렸다)')
        conn.execute('INSERT INTO avatars(user_id, game, data, updated_ts) VALUES(?,?,?,?) '
                     'ON CONFLICT(user_id) DO UPDATE SET data=excluded.data, updated_ts=excluded.updated_ts',
                     (u['id'], 'lastdrop', json.dumps(a, sort_keys=True), time.time()))
        conn.commit()
        return jsonify({'avatar': a})
    finally:
        conn.close()


# ══ 전적 · 코인 · 상점 (29 문서) ══════════════════════════════════
def _authed(conn, need_csrf):
    u, s = _current(conn)
    if not u:
        return None, _err('로그인이 필요하다', 401)
    if need_csrf and not _need_csrf(s):
        return None, _err('CSRF 토큰이 맞지 않다', 403)
    return u, None


def _coins(conn, uid):
    r = conn.execute('SELECT coins FROM wallet WHERE user_id=?', (uid,)).fetchone()
    return r['coins'] if r else 0


def _reject(conn, uid, reason, payload):
    conn.execute('INSERT INTO rejects(user_id, reason, payload, ts) VALUES(?,?,?,?)',
                 (uid, reason, json.dumps(payload, ensure_ascii=False)[:500], time.time()))
    print('[game_accounts] 매치 결과 거부 user=%s reason=%s' % (uid, reason), flush=True)


@game_bp.route('/game/api/lastdrop/match/start', methods=['POST'])
def match_start():
    """판 시작 — 일회용 매치 토큰. 결과를 낼 때 이 토큰이 있어야 전적·코인이 남는다."""
    conn = _db()
    try:
        u, bad = _authed(conn, True)
        if bad:
            return bad
        n = conn.execute('SELECT COUNT(*) FROM matches WHERE user_id=? AND issued_ts>?',
                         (u['id'], time.time() - 3600)).fetchone()[0]
        if n >= MAX_TOKENS_PER_HOUR:
            return _err('판을 너무 자주 시작했다 — 잠시 뒤에', 429)
        tok = secrets.token_urlsafe(24)
        conn.execute('INSERT INTO matches(user_id, token_hash, issued_ts) VALUES(?,?,?)',
                     (u['id'], hashlib.sha256(tok.encode()).hexdigest(), time.time()))
        conn.commit()
        return jsonify({'token': tok})
    finally:
        conn.close()


def _int(v, lo, hi):
    return isinstance(v, int) and not isinstance(v, bool) and lo <= v <= hi


@game_bp.route('/game/api/lastdrop/match/end', methods=['POST'])
def match_end():
    """판 끝 — 토큰 + 결과. 서버가 검증하고 코인을 계산한다(클라이언트 값은 순위·킬 등 '사실' 만 받는다)."""
    conn = _db()
    try:
        u, bad = _authed(conn, True)
        if bad:
            return bad
        if not request.is_json or (request.content_length or 0) > 1024:
            return _err('JSON 1KB 이하로', 413)
        d = request.get_json(silent=True) or {}
        tok = d.get('token') if isinstance(d.get('token'), str) else ''
        m = conn.execute('SELECT * FROM matches WHERE token_hash=? AND user_id=?',
                         (hashlib.sha256(tok.encode()).hexdigest(), u['id'])).fetchone() if tok else None
        now = time.time()

        def no(reason, msg):
            if m and m['status'] == 'open':
                conn.execute("UPDATE matches SET status='rejected', ended_ts=? WHERE id=?", (now, m['id']))
            _reject(conn, u['id'], reason, {k: d.get(k) for k in ('place', 'kills', 'survival', 'shots', 'hits')})
            conn.commit()
            return _err(msg, 400, reason=reason)

        if not m:
            return no('bad_token', '모르는 매치 토큰')
        if m['status'] != 'open':
            return no('token_reused', '이미 쓴 매치 토큰')
        elapsed = now - m['issued_ts']
        if elapsed > TOKEN_TTL:
            return no('expired', '매치 토큰이 만료됐다')
        place, kills, shots, hits, surv = d.get('place'), d.get('kills'), d.get('shots'), d.get('hits'), d.get('survival')
        if not _int(place, 1, N_PLAYERS):
            return no('bad_place', '순위가 이상하다')
        if not _int(kills, 0, N_PLAYERS - place):          # 내 아래 순위(먼저 죽은 사람) 수보다 많이 죽일 수 없다
            return no('bad_kills', '킬 수가 이상하다')
        if not _int(shots, 0, 20000) or not _int(hits, 0, shots):
            return no('bad_shots', '명중 수가 이상하다')
        if not isinstance(surv, (int, float)) or isinstance(surv, bool) or not 0 <= surv <= elapsed + 5:
            return no('bad_survival', '생존 시간이 이상하다')
        status, coins, why = 'ok', COIN_BY_PLACE.get(place, 0), None
        if elapsed < MIN_MATCH:
            if place <= 4:                                  # 3분도 안 돼 4등 안 — 있을 수 없다
                return no('too_short', '판이 너무 짧다 (3분 미만)')
            status, coins, why = 'nocoin', 0, 'too_short'   # 일찍 죽은 판 — 전적만 (어차피 코인 0)
        recent = conn.execute("SELECT COUNT(*) FROM matches WHERE user_id=? AND status='ok' AND ended_ts>?",
                              (u['id'], now - 3600)).fetchone()[0]
        if coins and recent >= MAX_PER_HOUR:
            status, coins, why = 'capped', 0, 'hourly_cap'
            _reject(conn, u['id'], 'hourly_cap', {'place': place})
        conn.execute('UPDATE matches SET status=?, ended_ts=?, place=?, kills=?, survival=?, shots=?, hits=?, coins=? '
                     "WHERE id=? AND status='open'",
                     (status, now, place, kills, round(float(surv), 1), shots, hits, coins, m['id']))
        if coins:
            conn.execute('INSERT INTO wallet(user_id, coins) VALUES(?, ?) '
                         'ON CONFLICT(user_id) DO UPDATE SET coins = coins + excluded.coins', (u['id'], coins))
            conn.execute('INSERT INTO coin_log(user_id, delta, reason, ts) VALUES(?,?,?,?)',
                         (u['id'], coins, 'place_%d' % place, now))
        conn.commit()
        return jsonify({'coins': coins, 'total': _coins(conn, u['id']), 'status': status, 'why': why})
    finally:
        conn.close()


@game_bp.route('/game/api/lastdrop/stats', methods=['GET'])
def stats():
    conn = _db()
    try:
        u, bad = _authed(conn, False)
        if bad:
            return bad
        rows = conn.execute("SELECT place, kills, survival, shots, hits, ended_ts FROM matches "
                            "WHERE user_id=? AND status IN ('ok','nocoin','capped') ORDER BY ended_ts DESC",
                            (u['id'],)).fetchall()
        g = len(rows)
        wins = sum(1 for r in rows if r['place'] == 1)
        shots = sum(r['shots'] for r in rows)
        return jsonify({
            'games': g, 'wins': wins, 'winRate': round(wins / g * 100, 1) if g else 0,
            'top4': sum(1 for r in rows if r['place'] <= 4),
            'avgPlace': round(sum(r['place'] for r in rows) / g, 1) if g else None,
            'kills': sum(r['kills'] for r in rows), 'maxKills': max((r['kills'] for r in rows), default=0),
            'accuracy': round(sum(r['hits'] for r in rows) / shots * 100, 1) if shots else 0,
            'recent': [{'ts': r['ended_ts'], 'place': r['place'], 'kills': r['kills'], 'survival': r['survival']}
                       for r in rows[:10]],
            'coins': _coins(conn, u['id']),
        })
    finally:
        conn.close()


@game_bp.route('/game/api/lastdrop/shop', methods=['GET'])
def shop():
    conn = _db()
    try:
        u, bad = _authed(conn, False)
        if bad:
            return bad
        own = _owned(conn, u['id'])
        return jsonify({'coins': _coins(conn, u['id']),
                        'items': [{'id': k, 'name': v[0], 'slot': v[1], 'price': v[2], 'owned': k in own}
                                  for k, v in SHOP.items()]})
    finally:
        conn.close()


@game_bp.route('/game/api/lastdrop/shop/buy', methods=['POST'])
def shop_buy():
    """구매 — 잔액 확인·차감·보유 등록을 한 트랜잭션으로. 가격은 서버 목록."""
    conn = _db()
    try:
        u, bad = _authed(conn, True)
        if bad:
            return bad
        item = (request.get_json(silent=True) or {}).get('item') if request.is_json else None
        if not isinstance(item, str) or item not in SHOP:
            return _err('없는 상품')
        price = SHOP[item][2]
        if conn.execute('SELECT 1 FROM owned WHERE user_id=? AND item=?', (u['id'], item)).fetchone():
            return _err('이미 가지고 있다', 409)
        try:
            cur = conn.execute('UPDATE wallet SET coins = coins - ? WHERE user_id=? AND coins >= ?',
                               (price, u['id'], price))
            if cur.rowcount != 1:
                conn.rollback()
                return _err('코인이 부족하다 (%d 필요, %d 보유)' % (price, _coins(conn, u['id'])), 402)
            conn.execute('INSERT INTO owned(user_id, item, ts) VALUES(?,?,?)', (u['id'], item, time.time()))
            conn.execute('INSERT INTO coin_log(user_id, delta, reason, ts) VALUES(?,?,?,?)',
                         (u['id'], -price, 'buy_' + item, time.time()))
            conn.commit()
        except sqlite3.IntegrityError:                     # 동시에 두 번 산 경우 — 둘째는 되돌린다
            conn.rollback()
            return _err('이미 가지고 있다', 409)
        return jsonify({'coins': _coins(conn, u['id']), 'item': item})
    finally:
        conn.close()

