#!/usr/bin/env python3
"""땅따먹기 온라인 — 방 관리 + 중계 WebSocket 서버 (포트 5002).

역할은 둘뿐이다.
  1) 방 관리 — 생성 / 목록 / 입장 / 퇴장 (정원 2)
  2) 중계    — 같은 방의 상대에게 메시지를 그대로 전달

게임 계산은 하지 않는다. 방장 클라이언트가 계산하고(host-authoritative)
서버는 그 결과를 상대에게 넘기기만 한다. (마일스톤 C에서 사용)

배포: 이 파일은 land-grab-game 레포의 server/ 에 있고, 서버에서도 같은 경로로 실행한다.
      ~/land-grab-game/server/ws_server_on.sh 로 기동한다.
경로: Cloudflare Tunnel이 https://valuetopic.com/game/ws → localhost:5002 로 넘긴다.
"""

import asyncio
import json
import logging
import os
import secrets
import signal
import time

from websockets.asyncio.server import serve
from websockets.exceptions import ConnectionClosed

HOST = '127.0.0.1'
PORT = 5002
WS_PATH = '/game/ws'
ROOM_MAX = 2
NAME_MAX = 20            # 방 이름 길이 제한
ROOM_LIMIT = 40          # 동시 방 개수 상한 (무한 생성 방지)
IDLE_ROOM_SEC = 3600     # 아무도 없는 방은 이 시간 뒤 정리

LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logs')
os.makedirs(LOG_DIR, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    handlers=[logging.FileHandler(os.path.join(LOG_DIR, 'ws_server.log')), logging.StreamHandler()],
)
log = logging.getLogger('ws')

clients = {}   # client_id -> Client
rooms = {}     # room_id   -> Room


class Client:
    def __init__(self, ws, cid):
        self.ws = ws
        self.id = cid
        self.name = '플레이어'
        self.room = None       # room_id
        self.in_lobby = True   # 방 목록을 받아볼 상태인가

    async def send(self, obj):
        try:
            await self.ws.send(json.dumps(obj, ensure_ascii=False))
        except (ConnectionClosed, RuntimeError):
            pass


class Room:
    def __init__(self, rid, name, host_id):
        self.id = rid
        self.name = name
        self.host = host_id       # 방장 = 게임 계산 주체
        self.members = [host_id]
        self.created = time.time()

    @property
    def state(self):
        return 'play' if len(self.members) >= ROOM_MAX else 'wait'

    def info(self):
        return {
            'id': self.id,
            'name': self.name,
            'players': len(self.members),
            'max': ROOM_MAX,
            'state': self.state,
            'host': self.host,
        }

    def members_info(self):
        out = []
        for cid in self.members:
            c = clients.get(cid)
            if c:
                out.append({'id': c.id, 'name': c.name, 'host': cid == self.host})
        return out


def room_list():
    return [r.info() for r in rooms.values()]


async def push_room_list():
    """로비에 있는 사람들에게만 목록을 보낸다."""
    msg = {'t': 'rooms', 'rooms': room_list()}
    await asyncio.gather(*[c.send(msg) for c in list(clients.values()) if c.in_lobby],
                         return_exceptions=True)


async def push_room_state(room):
    msg = {'t': 'room', 'room': room.info(), 'members': room.members_info()}
    await asyncio.gather(*[clients[cid].send(msg) for cid in room.members if cid in clients],
                         return_exceptions=True)


def clean_name(raw, fallback):
    if not isinstance(raw, str):
        return fallback
    s = raw.strip().replace('\n', ' ')[:NAME_MAX]
    return s or fallback


async def leave_room(client, notify=True):
    rid = client.room
    if not rid:
        return
    client.room = None
    client.in_lobby = True
    room = rooms.get(rid)
    if not room:
        return

    if client.id in room.members:
        room.members.remove(client.id)

    if not room.members:
        rooms.pop(rid, None)
        log.info('방 삭제 %s (%s)', rid, room.name)
    else:
        # 방장이 나가면 남은 사람이 방장이 된다
        if room.host == client.id:
            room.host = room.members[0]
        if notify:
            await asyncio.gather(
                *[clients[cid].send({'t': 'peer', 'event': 'leave', 'id': client.id, 'name': client.name})
                  for cid in room.members if cid in clients],
                return_exceptions=True)
            await push_room_state(room)
    await push_room_list()


async def handle(client, msg):
    t = msg.get('t')

    if t == 'hello':
        client.name = clean_name(msg.get('name'), '플레이어')
        await client.send({'t': 'welcome', 'id': client.id, 'name': client.name})
        await client.send({'t': 'rooms', 'rooms': room_list()})

    elif t == 'list':
        await client.send({'t': 'rooms', 'rooms': room_list()})

    elif t == 'create':
        if client.room:
            await leave_room(client)
        if len(rooms) >= ROOM_LIMIT:
            await client.send({'t': 'error', 'msg': '방이 너무 많습니다. 잠시 후 다시 시도하세요.'})
            return
        rid = secrets.token_hex(3)
        name = clean_name(msg.get('name'), client.name + '의 방')
        room = Room(rid, name, client.id)
        rooms[rid] = room
        client.room = rid
        client.in_lobby = False
        log.info('방 생성 %s "%s" by %s', rid, name, client.name)
        await client.send({'t': 'joined', 'room': room.info(), 'you': 'host'})
        await push_room_state(room)
        await push_room_list()

    elif t == 'join':
        rid = msg.get('room')
        room = rooms.get(rid)
        if not room:
            await client.send({'t': 'error', 'msg': '없는 방입니다.'})
            await client.send({'t': 'rooms', 'rooms': room_list()})
            return
        if len(room.members) >= ROOM_MAX:
            await client.send({'t': 'error', 'msg': '방이 가득 찼습니다.'})
            return
        if client.room:
            await leave_room(client)
        room.members.append(client.id)
        client.room = rid
        client.in_lobby = False
        log.info('방 입장 %s "%s" ← %s', rid, room.name, client.name)
        await client.send({'t': 'joined', 'room': room.info(),
                           'you': 'host' if room.host == client.id else 'guest'})
        await asyncio.gather(
            *[clients[cid].send({'t': 'peer', 'event': 'join', 'id': client.id, 'name': client.name})
              for cid in room.members if cid != client.id and cid in clients],
            return_exceptions=True)
        await push_room_state(room)
        await push_room_list()

    elif t == 'leave':
        await leave_room(client)
        await client.send({'t': 'left'})
        await client.send({'t': 'rooms', 'rooms': room_list()})

    elif t == 'relay':
        # 마일스톤 C용 — 같은 방의 상대에게 그대로 넘긴다. 서버는 내용을 보지 않는다.
        room = rooms.get(client.room)
        if not room:
            return
        out = {'t': 'relay', 'from': client.id, 'data': msg.get('data')}
        await asyncio.gather(*[clients[cid].send(out) for cid in room.members
                               if cid != client.id and cid in clients],
                             return_exceptions=True)

    elif t == 'ping':
        await client.send({'t': 'pong', 'ts': msg.get('ts')})

    else:
        await client.send({'t': 'error', 'msg': '알 수 없는 요청: ' + str(t)})


async def handler(ws):
    path = getattr(getattr(ws, 'request', None), 'path', WS_PATH) or WS_PATH
    if path.split('?')[0].rstrip('/') not in (WS_PATH, WS_PATH.rstrip('/')):
        log.warning('잘못된 경로 접속 거부: %s', path)
        await ws.close(1008, 'bad path')
        return

    cid = secrets.token_hex(4)
    client = Client(ws, cid)
    clients[cid] = client
    log.info('접속 %s (총 %d명)', cid, len(clients))

    try:
        async for raw in ws:
            if len(raw) > 64_000:          # 비정상적으로 큰 프레임은 버린다
                continue
            try:
                msg = json.loads(raw)
            except (ValueError, TypeError):
                continue
            if not isinstance(msg, dict):
                continue
            await handle(client, msg)
    except ConnectionClosed:
        pass
    finally:
        clients.pop(cid, None)
        await leave_room(client)
        log.info('종료 %s (총 %d명)', cid, len(clients))


async def janitor():
    """빈 방 청소 — 방이 members 없이 남는 경우를 대비한 안전장치."""
    while True:
        await asyncio.sleep(300)
        now = time.time()
        dead = [rid for rid, r in rooms.items()
                if not r.members and now - r.created > IDLE_ROOM_SEC]
        for rid in dead:
            rooms.pop(rid, None)
        if dead:
            log.info('빈 방 %d개 정리', len(dead))
            await push_room_list()


async def main():
    stop = asyncio.get_running_loop().create_future()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            asyncio.get_running_loop().add_signal_handler(sig, lambda: stop.done() or stop.set_result(None))
        except NotImplementedError:
            pass

    async with serve(handler, HOST, PORT, ping_interval=20, ping_timeout=20, max_size=128_000):
        log.info('WS 서버 시작 — ws://%s:%d%s', HOST, PORT, WS_PATH)
        await stop
    log.info('WS 서버 종료')


if __name__ == '__main__':
    asyncio.run(main())
