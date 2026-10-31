# 초원 N번 생성 → 저택 수 분포 · 놓인 단계 · 거부 사유 (07-b). 3채 미만이 있으면 종료 코드 1
# 쓰기: python3 mansions.py <크롬 디버그 포트> <게임 URL> [N=20] [skip=0]
import subprocess, json, sys, collections, os
PORT, URL = sys.argv[1], sys.argv[2]; N = int(sys.argv[3]) if len(sys.argv) > 3 else 20; SKIP = int(sys.argv[4]) if len(sys.argv) > 4 else 0
D = os.path.dirname(os.path.abspath(__file__))
dist, st, why = collections.Counter(), collections.Counter(), collections.Counter()
for i in range(N):
    o = subprocess.run(['python3', f'{D}/run.py', PORT, f'{URL}?gen={i}', f'{D}/mansions.js', json.dumps({'skip': SKIP})], capture_output=True, text=True).stdout
    j = json.loads(o[:o.rindex('}') + 1]); dist[j['m']] += 1; st.update(j['stage']); why.update(j['log'])
print('저택 수 분포', dict(sorted(dist.items()))); print('놓인 단계', dict(st)); print('거부 사유', dict(why))
sys.exit(1 if any(k < 3 for k in dist) else 0)
