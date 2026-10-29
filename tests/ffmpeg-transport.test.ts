import test from 'node:test';
import assert from 'node:assert/strict';
import { FFmpegTransport, STARTUP_LIMITS } from '../lib/video/ffmpeg-transport';

type Message = {id?:number; type:string; data?:unknown};
class MockWorker {
  static last: MockWorker;
  onmessage?: (event:{data:Message})=>void;
  onerror?: (event:{preventDefault:()=>void;message:string})=>void;
  onmessageerror?: ()=>void;
  terminated = false;
  sent: Message[] = [];
  constructor() { MockWorker.last = this; }
  emit(message: Message) { this.onmessage?.({data:message}); }
  postMessage(message: Message) { this.sent.push(message); }
  terminate() { this.terminated = true; }
}
function environment() {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis,'Worker');
  Object.defineProperty(globalThis,'Worker',{value:MockWorker,configurable:true});
  Object.defineProperty(globalThis,'location',{value:{origin:'http://localhost'},configurable:true});
  return () => { if(descriptor)Object.defineProperty(globalThis,'Worker',descriptor);else Reflect.deleteProperty(globalThis,'Worker'); };
}
const config = {coreURL:'',wasmURL:''};
test('LOAD waits for startup handshake; upstream filesystem and command payloads remain compatible', async()=>{
 const restore=environment();const events: string[]=[];const ff=new FFmpegTransport(p=>events.push(p.phase));
 try {
  const loading=ff.load(config);const worker=MockWorker.last;assert.equal(worker.sent.length,0);
  worker.emit({type:'ECONTENT_STARTUP',data:{phase:'core',workerReady:true}});
  await Promise.resolve();assert.equal(worker.sent[0].type,'LOAD');
  worker.emit({type:'ECONTENT_STARTUP',data:{phase:'download',receivedBytes:42,totalBytes:42}});
  worker.emit({type:'ECONTENT_STARTUP',data:{phase:'compile'}});
  worker.emit({type:'ECONTENT_STARTUP',data:{phase:'initialize'}});
  worker.emit({...worker.sent[0],data:true});await loading;assert.equal(ff.loaded,true);
  const pending=ff.mount('WORKERFS',{files:[]},'/source');const request=worker.sent.at(-1)!;
  assert.deepEqual(request.data,{fsType:'WORKERFS',options:{files:[]},mountPoint:'/source'});
  worker.emit({...request,data:true});assert.equal(await pending,true);
  assert.deepEqual(events,['worker','core','download','compile','initialize']);
 }finally{ff.terminate();restore();}
});
test('native worker and message errors reject load immediately and terminate resources',async()=>{
 for(const type of ['error','messageerror']) {
  const restore=environment();const ff=new FFmpegTransport(()=>{});
  try {const loading=ff.load(config);const rejection=assert.rejects(loading,/worker (failed|message)/);const worker=MockWorker.last;
   if(type==='error')worker.onerror?.({preventDefault(){},message:'CSP denied worker script'});else worker.onmessageerror?.();
   await rejection;assert.equal(worker.terminated,true);assert.equal(ff.loaded,false);
  }finally{ff.terminate();restore();}
 }
});
test('worker handshake, download inactivity, compile and initialization have separate deadlines',async()=>{
 for(const phase of ['worker','core','download','compile','initialize']) {
  const restore=environment();const limits={...STARTUP_LIMITS,worker:25,downloadIdle:25,compile:25,initialize:25};const ff=new FFmpegTransport(()=>{},limits);
  try {const loading=ff.load(config);const rejection=assert.rejects(loading,/handshake|download bytes|compilation|initialization/);const worker=MockWorker.last;
   if(phase!=='worker')worker.emit({type:'ECONTENT_STARTUP',data:{phase:'core',workerReady:true}});
   if(phase!=='worker'&&phase!=='core')worker.emit({type:'ECONTENT_STARTUP',data:{phase,receivedBytes:0,totalBytes:100}});
   await rejection;assert.equal(worker.terminated,true);
  }finally{ff.terminate();restore();}
 }
});
test('advancing download bytes extend only inactivity, and total download deadline remains bounded',async()=>{
 const restore=environment();const ff=new FFmpegTransport(()=>{},{...STARTUP_LIMITS,downloadIdle:50,downloadTotal:150});
 try {const loading=ff.load(config);const rejection=assert.rejects(loading,/five-minute download limit/);const worker=MockWorker.last;
  worker.emit({type:'ECONTENT_STARTUP',data:{phase:'core',workerReady:true}});let bytes=0;
  const timer=setInterval(()=>worker.emit({type:'ECONTENT_STARTUP',data:{phase:'download',receivedBytes:++bytes,totalBytes:1000}}),10);
  try {await rejection;}finally{clearInterval(timer);}assert.equal(worker.terminated,true);
 }finally{ff.terminate();restore();}
});
test('cancelling during startup rejects before LOAD and permits a fresh transport',async()=>{
 const restore=environment();const ff=new FFmpegTransport(()=>{});
 try {const loading=ff.load(config);const rejected=assert.rejects(loading,{name:'AbortError'});ff.terminate();await rejected;
  const second=new FFmpegTransport(()=>{});const next=second.load(config);const rejectedNext=assert.rejects(next,{name:'AbortError'});assert.equal(MockWorker.last.terminated,false);second.terminate();await rejectedNext;
 }finally{restore();}
});

test('runtime readiness still requires a bounded LOAD acknowledgement',async()=>{
 const restore=environment();const ff=new FFmpegTransport(()=>{},{...STARTUP_LIMITS,worker:25});
 try {const loading=ff.load(config);const rejected=assert.rejects(loading,/load acknowledgement/);
  const worker=MockWorker.last;worker.emit({type:'ECONTENT_STARTUP',data:{phase:'core',workerReady:true}});
  await Promise.resolve();worker.emit({type:'ECONTENT_STARTUP',data:{phase:'ready'}});
  await rejected;assert.equal(worker.terminated,true);assert.equal(ff.loaded,false);
 }finally{ff.terminate();restore();}
});
