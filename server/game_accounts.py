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
# 꾸미기 — 항목마다 프리셋 번호. 값은 0 ~ n-1 의 정수만 받는다
AVATAR_SPEC = {'skin': 8, 'hair': 3, 'hairColor': 8, 'top': 8, 'bottom': 8, 'hat': 4, 'bag': 8}

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


def _valid_avatar(a):
    if not isinstance(a, dict) or set(a) != set(AVATAR_SPEC):
        return None
    out = {}
    for k, n in AVATAR_SPEC.items():
        v = a[k]
        if not isinstance(v, int) or isinstance(v, bool) or not (0 <= v < n):
            return None
        out[k] = v
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
        a = _valid_avatar((request.get_json(silent=True) or {}).get('avatar'))
        if a is None:
            return _err('꾸미기 값이 맞지 않다')
        conn.execute('INSERT INTO avatars(user_id, game, data, updated_ts) VALUES(?,?,?,?) '
                     'ON CONFLICT(user_id) DO UPDATE SET data=excluded.data, updated_ts=excluded.updated_ts',
                     (u['id'], 'lastdrop', json.dumps(a, sort_keys=True), time.time()))
        conn.commit()
        return jsonify({'avatar': a})
    finally:
        conn.close()
