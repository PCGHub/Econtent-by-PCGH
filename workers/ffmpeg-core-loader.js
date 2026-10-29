import {sha256} from './hash/sha2.js';
const report = data => self.postMessage({type:'ECONTENT_STARTUP', data});
const asset = name => new URL('./'+name, import.meta.url).href;
async function responseFor(name, mime) {
  let response;
  try { response = await fetch(asset(name), {credentials:'same-origin', redirect:'error', cache:'force-cache'}); }
  catch { throw Error(`FFmpeg asset ${name}: request failed or redirected. Check the network, CSP/CORS and Preview authorization; open the exact Preview directly in Chrome and sign in to Vercel if required.`); }
  if (!response.ok) throw Error(`FFmpeg asset ${name}: HTTP ${response.status}. Check deployment protection/session and asset URL.`);
  if (!mime.test(response.headers.get('content-type') ?? '')) throw Error(`FFmpeg asset ${name}: unexpected Content-Type. Expected ${name.endsWith('.wasm')?'application/wasm':'JavaScript/JSON'}, possibly received a login or HTML error page. Open the exact Preview and sign in to Vercel if required.`);
  return response;
}
export default async function loadCore(options) {
  let abort, streamFailure, storage, cacheKey, cachedResponse=false;
  try {
    const manifestResponse = await responseFor('asset-manifest.json', /application\/json/i);
    const manifest = await manifestResponse.json();
    if (!/^[a-f0-9]{64}$/.test(manifest.wasmSha256 ?? '') || manifest.coreVersion !== '0.12.10' || manifest.wrapperVersion !== '0.12.15' || !Number.isSafeInteger(manifest.wasmBytes) || manifest.wasmBytes < 8 || manifest.wasmBytes > 64*1048576) throw Error('FFmpeg asset manifest/version is invalid; refresh this Preview.');
    // Module imports enforce JS MIME; do not fetch the same core JS twice.
    let createCore;
    try { ({default:createCore} = await import('./core/ffmpeg-core.js')); }
    catch { throw Error('FFmpeg core JavaScript import failed. Check asset MIME, network and Preview authorization.'); }
    cacheKey=new URL('/ffmpeg/wasm-cache/'+manifest.wasmSha256, self.location.origin).href;
    let response;report({phase:'cache'});const lookupStarted=performance.now();let lookupTimer;
    const found=await Promise.race([
      (async()=>{const store=await caches.open('econtent-ffmpeg-verified-v1');const item=await store.match(cacheKey);return {store,item};})().catch(()=>undefined),
      new Promise(resolve=>{lookupTimer=setTimeout(()=>resolve(undefined),1000);}),
    ]);
    clearTimeout(lookupTimer);const cacheLookupMs=performance.now()-lookupStarted;
    storage=found?.store;
    if(found?.item?.headers.get('x-econtent-sha256')===manifest.wasmSha256){response=found.item;cachedResponse=true;}
    report({phase:'download',receivedBytes:0,totalBytes:manifest.wasmBytes,cacheStorage:cachedResponse});
    if(!response)response=await responseFor('core/ffmpeg-core.wasm', /application\/wasm/i);
    abort = () => response.body?.cancel().catch(()=>{});
    if (!response.body) throw Error('FFmpeg WASM response has no readable body.');
    const downloadStarted=performance.now();
    let bodyEnded=downloadStarted;
    let received = 0, lastReported = 0, lastReportedAt = 0, prefix = [];
    const digest=sha256.create();
    const rejectStream = message => { streamFailure = Error(message); throw streamFailure; };
    const monitored = response.body.pipeThrough(new TransformStream({
      transform(chunk, controller) {
        for(let i=0;i<chunk.length && prefix.length<4;i++) prefix.push(chunk[i]);
        if(prefix.length===4 && prefix.join(',')!=='0,97,115,109') rejectStream('Invalid FFmpeg WASM magic bytes; asset is damaged or an HTML/protection response.');
        received += chunk.byteLength; digest.update(chunk);
        if(received > manifest.wasmBytes) rejectStream('FFmpeg WASM exceeds the pinned asset size; refresh to avoid mixed versions.');
        if(lastReported===0 || received-lastReported>=131072 || Date.now()-lastReportedAt>=250 || received===manifest.wasmBytes) {
          report({phase:'download', receivedBytes:received, totalBytes:manifest.wasmBytes,cacheStorage:cachedResponse}); lastReported=received; lastReportedAt=Date.now();
        }
        controller.enqueue(chunk);
      },
      flush() {
        if(received !== manifest.wasmBytes) rejectStream(`FFmpeg WASM truncated: ${received} of ${manifest.wasmBytes} bytes received.`);
        const actual=Array.from(digest.digest(),byte=>byte.toString(16).padStart(2,'0')).join('');
        if(actual!==manifest.wasmSha256)rejectStream('FFmpeg WASM integrity check failed. Retry to download the pinned asset.');
        bodyEnded=performance.now();
        report({phase:'compile', receivedBytes:received, totalBytes:manifest.wasmBytes});
      },
    }));
    let compilationStream=monitored,cacheWrite;
    if(storage&&!cachedResponse){
      const streams=monitored.tee();compilationStream=streams[0];
      // put() commits atomically only after the validation stream closes successfully.
      cacheWrite=storage.put(cacheKey,new Response(streams[1],{headers:{'Content-Type':'application/wasm','x-econtent-sha256':manifest.wasmSha256}})).then(()=>true,()=>false);
    }
    // Compile as bytes arrive, rather than retaining another full binary on the main thread.
    const compiledModule = typeof WebAssembly.compileStreaming === 'function'
      ? await WebAssembly.compileStreaming(new Response(compilationStream, {headers:{'Content-Type':'application/wasm'}}))
      : await WebAssembly.compile(await new Response(compilationStream).arrayBuffer());
    const compiledAt=performance.now();
    const timing=performance.getEntriesByName(asset('core/ffmpeg-core.wasm')).at(-1);
    const measured=timing && timing.decodedBodySize>0;
    const transferBytes=cachedResponse?0:measured?timing.transferSize:undefined;
    const metrics={downloadMs:cachedResponse?0:measured?timing.responseEnd-timing.startTime:bodyEnded-downloadStarted,
      cacheReadMs:cachedResponse?bodyEnded-downloadStarted:undefined,
      compileFinalizeMs:compiledAt-bodyEnded,transferBytes,
      networkBodyBytes:cachedResponse?0:measured?(timing.transferSize>0?timing.encodedBodySize:0):undefined,
      cached:cachedResponse|| (measured?timing.transferSize===0:undefined),cacheStorage:cachedResponse,cacheLookupMs,cacheAvailable:!!storage,cacheStored:cachedResponse};
    if(cacheWrite){
      report({phase:'cache',...metrics});const savingAt=performance.now();let timer;
      metrics.cacheStored=await Promise.race([cacheWrite,new Promise(resolve=>{timer=setTimeout(()=>resolve(false),5000);})]);
      clearTimeout(timer);metrics.cacheWriteMs=performance.now()-savingAt;
      if(metrics.cacheStored){
        try{for(const request of await storage.keys())if(request.url!==cacheKey)await storage.delete(request);}catch{}
      }
    }
    report({phase:'initialize',...metrics});
    const initializedAt=performance.now();
    let rejectInstantiation;
    const failure = new Promise((_,reject)=>{ rejectInstantiation=reject; });
    const core = await Promise.race([createCore({...options,
      instantiateWasm(imports, receive) {
        WebAssembly.instantiate(compiledModule, imports).then(instance=>receive(instance,compiledModule), rejectInstantiation);
        return {};
      },
      onAbort(reason) { rejectInstantiation(Error('FFmpeg runtime aborted (possible memory allocation failure): '+String(reason))); },
    }),failure]);
    delete core.instantiateWasm;
    report({phase:'ready',...metrics,initializeMs:performance.now()-initializedAt});
    return core;
  } catch(error) {
    abort?.();
    if(cachedResponse&&storage&&cacheKey)await storage.delete(cacheKey).catch(()=>{});
    throw Error('FFmpeg startup failed: '+(streamFailure?.message ?? error?.message ?? String(error))+'. No video encoding started. Retry with a fresh worker; close other tabs if memory is constrained.');
  }
}
