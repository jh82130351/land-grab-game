import asyncio, json, sys, urllib.request, websockets
PORT=int(sys.argv[1]); URL=sys.argv[2]; JS=sys.argv[3]; ARGS=sys.argv[4] if len(sys.argv)>4 else '{}'
async def main():
    tabs=json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json'))
    ws=[t for t in tabs if t['type']=='page'][0]['webSocketDebuggerUrl']
    async with websockets.connect(ws, max_size=None, ping_interval=None) as w:
        n=[0]; logs=[]
        async def call(m,p):
            n[0]+=1;i=n[0];await w.send(json.dumps({'id':i,'method':m,'params':p}))
            while True:
                r=json.loads(await w.recv())
                if r.get('method')=='Runtime.exceptionThrown': logs.append('EXC '+json.dumps(r['params'])[:600])
                if r.get('method')=='Runtime.consoleAPICalled' and r['params']['type'] in ('error','warning'): logs.append('CON '+json.dumps([a.get('value',a.get('description')) for a in r['params']['args']])[:400])
                if r.get('id')==i: return r.get('result')
        async def ev(e, aw=False):
            r=await call('Runtime.evaluate',{'expression':e,'returnByValue':True,'awaitPromise':aw})
            if 'exceptionDetails' in r: return 'EXC '+json.dumps(r['exceptionDetails'])[:1500]
            return r.get('result',{}).get('value')
        await call('Runtime.enable',{})
        await call('Emulation.setDeviceMetricsOverride',{'width':1280,'height':800,'deviceScaleFactor':1,'mobile':False})
        await call('Page.enable',{})
        await ev(f"location.href={json.dumps(URL)}")
        for _ in range(40):
            await asyncio.sleep(1)
            if await ev("typeof playBtn!=='undefined' && !playBtn.disabled"): break
        await ev(f"window.__A={ARGS}")
        out=await ev(open(JS).read(), True)
        print(json.dumps(out, ensure_ascii=False, indent=1) if not isinstance(out,str) else out)
        for l in logs[:20]: print(l)
asyncio.run(main())
