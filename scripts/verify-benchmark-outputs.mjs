import {readFileSync,writeFileSync} from 'node:fs'
import {basename,join} from 'node:path'
import {execFileSync,spawnSync} from 'node:child_process'
const sourceCache=new Map()
const packets=path=>JSON.parse(execFileSync('ffprobe',['-v','error','-show_packets','-show_data_hash','sha256','-show_entries','packet=codec_type,pts_time,data_hash','-of','json',path],{encoding:'utf8',maxBuffer:20*1024*1024})).packets
const sourceMap=path=>{
 if(sourceCache.has(path))return sourceCache.get(path)
 const map=new Map()
 for(const packet of packets(path)){const key=packet.codec_type+':'+packet.data_hash;const values=map.get(key)??[];values.push(Number(packet.pts_time));map.set(key,values)}
 sourceCache.set(path,map);return map
}
const frame=(path,start)=>execFileSync('ffmpeg',['-v','error',...(start===undefined?[]:['-ss',String(Math.max(0,start))]),'-i',path,'-frames:v','1','-pix_fmt','gray','-f','rawvideo','-'],{maxBuffer:4*1024*1024})
const results=[]
for(const filename of process.argv.slice(2)){
 const report=JSON.parse(readFileSync(filename,'utf8'))
 const dir=join('test-results/performance/outputs',basename(filename,'.json'))
 for(const [i,clip]of report.clips.entries()){
  const path=join(dir,`clip-${i+1}.mp4`)
  const decode=spawnSync('ffmpeg',['-v','error','-i',path,'-f','null','-'],{encoding:'utf8'})
  if(decode.status!==0||decode.stderr.trim())throw new Error(`Decode failed: ${path}: ${decode.stderr}`)
  const target=clip.alignedRange??clip.actualRange??clip.range
  const expected=frame(report.fixture,target.start-(report.mode==='fast'?0.001:0)),actual=frame(path)
  if(expected.length!==actual.length)throw new Error('Frame dimensions differ')
  let squared=0;for(let j=0;j<expected.length;j++)squared+=(expected[j]-actual[j])**2
  const psnr=squared?10*Math.log10(255**2/(squared/expected.length)):Infinity
  if(report.mode==='fast'&&squared!==0)throw new Error(`Fast Cut first decoded frame does not match target keyframe: ${path}`)
  if(report.mode!=='fast'&&psnr<28)throw new Error(`Precision first frame PSNR too low (${psnr}): ${path}`)
  let timestampOffsetSpreadMs,matchedPackets
  if(report.mode==='fast'){
   const map=sourceMap(report.fixture);const offsets=[]
   const kinds=new Set()
   for(const packet of packets(path)){
    const times=map.get(packet.codec_type+':'+packet.data_hash)
    if(times?.length===1){offsets.push(Number(packet.pts_time)-times[0]);kinds.add(packet.codec_type)}
   }
   if(!kinds.has('video')||!kinds.has('audio'))throw new Error('Could not verify copied video and audio packet timestamps')
   timestampOffsetSpreadMs=(Math.max(...offsets)-Math.min(...offsets))*1000;matchedPackets=offsets.length
   if(timestampOffsetSpreadMs>3)throw new Error(`A/V packet timestamps changed by inconsistent offsets: ${timestampOffsetSpreadMs}ms`)
  }
  results.push({report:basename(filename),clip:i+1,decoded:true,firstFramePSNRdB:Number.isFinite(psnr)?Number(psnr.toFixed(3)):'identical',timestampOffsetSpreadMs,matchedPackets,requested:clip.range,keyframeTarget:report.mode==='fast'?target:undefined,outputDuration:clip.probe.duration,bytes:clip.probe.size})
  console.log(JSON.stringify(results.at(-1)))
 }
}
writeFileSync('test-results/performance/output-verification.json',JSON.stringify(results,null,2))
