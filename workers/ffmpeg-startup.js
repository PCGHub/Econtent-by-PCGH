// Only pinned, same-origin assets. No media or credentials leave this worker.
try {
  await import('./ffmpeg/worker.js');
  const upstream = self.onmessage;
  self.onmessage = event => {
    if (event.data.type === 'LOAD') event.data.data = {
      coreURL: new URL('./core-loader.js', import.meta.url).href,
      wasmURL: new URL('./core/ffmpeg-core.wasm', import.meta.url).href,
    };
    return upstream.call(self, event);
  };
  // Parent must wait for this before posting LOAD; messages cannot disappear during import.
  self.postMessage({type:'ECONTENT_STARTUP', data:{phase:'core', workerReady:true}});
} catch (error) {
  // A native error reaches the transport's onerror and rejects every pending request.
  setTimeout(() => { throw error; });
}
