const report = data => self.postMessage({type:'ECONTENT_STARTUP', data});
const asset = name => new URL('./'+name, import.meta.url).href;
async function responseFor(name, mime) {
  let response;
  try { response = await fetch(asset(name), {credentials:'same-origin', redirect:'error'}); }
  catch { throw Error(`FFmpeg asset ${name}: request failed or redirected. Check the network, CSP/CORS and Preview authorization; open the exact Preview directly in Chrome and sign in to Vercel if required.`); }
  if (!response.ok) throw Error(`FFmpeg asset ${name}: HTTP ${response.status}. Check deployment protection/session and asset URL.`);
  if (!mime.test(response.headers.get('content-type') ?? '')) throw Error(`FFmpeg asset ${name}: unexpected Content-Type. Expected ${name.endsWith('.wasm')?'application/wasm':'JavaScript/JSON'}, possibly received a login or HTML error page. Open the exact Preview and sign in to Vercel if required.`);
  return response;
}
export default async function loadCore(options) {
  let abort, streamFailure;
  try {
    const manifestResponse = await responseFor('asset-manifest.json', /application\/json/i);
    const manifest = await manifestResponse.json();
    if (manifest.coreVersion !== '0.12.10' || manifest.wrapperVersion !== '0.12.15' || !Number.isSafeInteger(manifest.wasmBytes) || manifest.wasmBytes < 8 || manifest.wasmBytes > 64*1048576) throw Error('FFmpeg asset manifest/version is invalid; refresh this Preview.');
    // Small JS preflight catches protection HTML/MIME errors before dynamic module import.
    const js = await responseFor('core/ffmpeg-core.js', /(?:java|ecma)script/i);
    if (!js.body) throw Error('FFmpeg JavaScript response has no body.');
    const jsReader = js.body.getReader();
    let jsBytes = 0;
    for (;;) {
      const {value,done} = await jsReader.read(); if(done) break;
      jsBytes += value.byteLength;
      report({phase:'core',receivedBytes:jsBytes});
    }
    const {default:createCore} = await import('./core/ffmpeg-core.js');
    report({phase:'download', receivedBytes:0, totalBytes:manifest.wasmBytes});
    const response = await responseFor('core/ffmpeg-core.wasm', /application\/wasm/i);
    abort = () => response.body?.cancel().catch(()=>{});
    if (!response.body) throw Error('FFmpeg WASM response has no readable body.');
    let received = 0, lastReported = 0, lastReportedAt = 0, prefix = [];
    const rejectStream = message => { streamFailure = Error(message); throw streamFailure; };
    const monitored = response.body.pipeThrough(new TransformStream({
      transform(chunk, controller) {
        for(let i=0;i<chunk.length && prefix.length<4;i++) prefix.push(chunk[i]);
        if(prefix.length===4 && prefix.join(',')!=='0,97,115,109') rejectStream('Invalid FFmpeg WASM magic bytes; asset is damaged or an HTML/protection response.');
        received += chunk.byteLength;
        if(received > manifest.wasmBytes) rejectStream('FFmpeg WASM exceeds the pinned asset size; refresh to avoid mixed versions.');
        if(lastReported===0 || received-lastReported>=131072 || Date.now()-lastReportedAt>=250 || received===manifest.wasmBytes) {
          report({phase:'download', receivedBytes:received, totalBytes:manifest.wasmBytes}); lastReported=received; lastReportedAt=Date.now();
        }
        controller.enqueue(chunk);
      },
      flush() {
        if(received !== manifest.wasmBytes) rejectStream(`FFmpeg WASM truncated: ${received} of ${manifest.wasmBytes} bytes received.`);
        report({phase:'compile', receivedBytes:received, totalBytes:manifest.wasmBytes});
      },
    }));
    // Compile as bytes arrive, rather than retaining another full binary on the main thread.
    const compiledModule = typeof WebAssembly.compileStreaming === 'function'
      ? await WebAssembly.compileStreaming(new Response(monitored, {headers:{'Content-Type':'application/wasm'}}))
      : await WebAssembly.compile(await new Response(monitored).arrayBuffer());
    report({phase:'initialize'});
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
    report({phase:'ready'});
    return core;
  } catch(error) {
    abort?.();
    throw Error('FFmpeg startup failed: '+(streamFailure?.message ?? error?.message ?? String(error))+'. No video encoding started. Retry with a fresh worker; close other tabs if memory is constrained.');
  }
}
