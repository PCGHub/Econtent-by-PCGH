import {chromium} from 'playwright'
import {createServer} from 'node:http'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {resolve,extname,join} from 'node:path'
import {execFileSync} from 'node:child_process'
const [version='baseline',fixture='/tmp/econtent-bench/720p-short.mp4',mode='precision',compression='off',rangesArg='[[0,20],[20,40],[40,60.625]]']=process.argv.slice(2)
const root=process.cwd(),ranges=JSON.parse(rangesArg),label=process.env.ECONTENT_BENCH_LABEL??'short',mt=process.env.ECONTENT_BENCH_MT==='1'
const server=createServer(async(req,res)=>{
 try{
  if(mt){res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp')}
  const pathname=new URL(req.url,'http://localhost').pathname
  if(pathname==='/'){res.setHeader('content-type','text/html');res.end('<input id="source" type="file">');return}
  const dir=pathname.startsWith('/ffmpeg/')?join(root,'public'):join(root,'test-results/performance/site')
  const path=resolve(dir,'.'+pathname)
  if(!path.startsWith(dir+'/'))throw new Error('Invalid path')
  const body=await readFile(path)
  res.setHeader('content-type',({'.js':'application/javascript','.wasm':'application/wasm'})[extname(path)]??'application/octet-stream');res.end(body)
 }catch{res.statusCode=404;res.end()}
})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--enable-precise-memory-info']})
const startCPU=process.cpuUsage();let peakRSSKiB=0;const ticks=new Map()
const sample=()=>{
 try{
  const rows=execFileSync('ps',['-eo','pid=,ppid=,rss=,time='],{encoding:'utf8'}).trim().split('\n').map(s=>s.trim().split(/\s+/))
  const children=new Set([String(process.pid)]);for(let n=0;n<8;n++)for(const [pid,ppid]of rows)if(children.has(ppid))children.add(pid)
  let rss=0;for(const [pid,,mem,time]of rows)if(children.has(pid)){rss+=Number(mem);const nums=time.split(':').map(Number);ticks.set(pid,Math.max(ticks.get(pid)??0,nums.reduce((v,n)=>v*60+n,0)))}
  peakRSSKiB=Math.max(peakRSSKiB,rss)
 }catch{}
}
const interval=setInterval(sample,500)
const context=await browser.newContext({acceptDownloads:true});const page=await context.newPage()
const outputDir=join(root,'test-results/performance/outputs',`${version}-${mode}-${compression}-${label}`);await mkdir(outputDir,{recursive:true})
try{
 await page.goto(`http://127.0.0.1:${server.address().port}`)
 await page.locator('#source').setInputFiles(fixture)
 const setup=await page.evaluate(async({version,mt})=>{
  const {BrowserVideoEngine}=await import(`/${version}/ffmpeg-browser.js`)
  let factory
  if(mt){
   const {FFmpeg}=await import('/ffmpeg/ffmpeg/index.js');const ff=new FFmpeg()
   const load=ff.load.bind(ff);ff.load=()=>load({coreURL:location.origin+'/ffmpeg/core-mt/ffmpeg-core.js',wasmURL:location.origin+'/ffmpeg/core-mt/ffmpeg-core.wasm',workerURL:location.origin+'/ffmpeg/core-mt/ffmpeg-core.worker.js'})
   const exec=ff.exec.bind(ff);ff.exec=args=>exec([...args.slice(0,-1),'-threads','2','-filter_threads','1',args.at(-1)])
   factory=async()=>ff
  }
  window.engine=new BrowserVideoEngine(factory);window.events=[];const start=performance.now()
  await window.engine.initialize(p=>{window.events.push({...p,at:performance.now()});if(window.events.length>5000)window.events.shift()})
  const ff=window.engine.ffmpeg;window.io={writes:0,writeBytes:0,mounts:0,probes:[],keyframeBytes:0,commands:[]}
  const exec=ff.exec.bind(ff);ff.exec=async args=>{const start=performance.now();const result=await exec(args);window.io.commands.push({ms:performance.now()-start,video:args.includes('-c')?args[args.indexOf('-c')+1]:args[args.lastIndexOf('-c:v')+1],selectedSeconds:args.includes('-t')?Number(args[args.indexOf('-t')+1]):null});return result}
  const probe=ff.ffprobe.bind(ff);ff.ffprobe=async args=>{const start=performance.now();const result=await probe(args);window.io.probes.push({interval:args.includes('-read_intervals')?args[args.indexOf('-read_intervals')+1]:null,output:args[args.indexOf('-o')+1],ms:performance.now()-start});return result}
  const read=ff.readFile.bind(ff);ff.readFile=async path=>{const result=await read(path);if(path==='keyframes.txt')window.io.keyframeBytes+=typeof result==='string'?result.length:result.byteLength;return result}
  const write=ff.writeFile.bind(ff);ff.writeFile=(path,data)=>{if(!path.endsWith('.json')){window.io.writes++;window.io.writeBytes+=data.byteLength??0}return write(path,data)}
  if(ff.mount){const mount=ff.mount.bind(ff);ff.mount=(...args)=>{window.io.mounts++;return mount(...args)}}
  return {loadMs:performance.now()-start,crossOriginIsolated:window.crossOriginIsolated,multithreaded:mt}
 },{version,mt})
 const wallStart=performance.now();const clips=[]
 for(const [index,range]of ranges.entries()){
  const result=await page.evaluate(async({range,index,mode,compression})=>{
   const file=document.querySelector('#source').files[0];const started=performance.now()
   const clip=await window.engine.process(file,{range:{start:range[0],end:range[1]},cutStrategy:mode,compression,outputName:`clip-${index+1}.mp4`})
   const ms=performance.now()-started;window.lastBlob=clip.blob
   return {ms,size:clip.blob.size,range:clip.range,alignedRange:clip.alignedRange,duration:clip.outputDuration,method:clip.cutStrategy,sourceAccess:window.engine.sourceAccess}
  },{range,index,mode,compression})
  const pending=page.waitForEvent('download');await page.evaluate(()=>{const a=document.createElement('a');a.href=URL.createObjectURL(window.lastBlob);a.download='clip.mp4';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000)})
  const download=await pending;const path=join(outputDir,`clip-${index+1}.mp4`);await download.saveAs(path)
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',path],{encoding:'utf8'}))
  const streams=probe.streams.map(s=>({type:s.codec_type,codec:s.codec_name,start:Number(s.start_time),duration:Number(s.duration),frames:Number(s.nb_frames)}))
  clips.push({...result,probe:{duration:Number(probe.format.duration),size:Number(probe.format.size),streams}})
  console.log(JSON.stringify({version,mode,compression,clip:index+1,ms:result.ms,duration:probe.format.duration,sourceAccess:result.sourceAccess}))
 }
 const wallMs=performance.now()-wallStart
 const telemetry=await page.evaluate(()=>({io:window.io,events:window.events,jsHeap:performance.memory?.usedJSHeapSize}));await page.evaluate(()=>window.engine.dispose());sample()
 const report={browserVersion:browser.version(),platform:process.platform,architecture:process.arch,version,mode,compression,fixture,ranges,...setup,wallMs,processingMs:clips.reduce((s,c)=>s+c.ms,0),startupAndProcessingMs:setup.loadMs+clips.reduce((s,c)=>s+c.ms,0),clips,io:telemetry.io,peakProcessTreeRSSKiB:peakRSSKiB,processTreeCPUSeconds:[...ticks.values()].reduce((s,n)=>s+n,0),controllerCPU:process.cpuUsage(startCPU),jsHeapBytes:telemetry.jsHeap,events:telemetry.events}
 const reportPath=join(root,`test-results/performance/${version}-${mode}-${compression}-${label}.json`);await writeFile(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify({report:reportPath,wallMs,processingMs:report.processingMs,io:report.io,peakProcessTreeRSSKiB:peakRSSKiB}))
}finally{clearInterval(interval);await browser.close();await new Promise(r=>server.close(r))}
