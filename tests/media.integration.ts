import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertStreamCopySync } from './media-assertions'
import { alignFastRange, encodingArgs } from '../lib/video/command'

// This verifies command semantics with native FFmpeg. It does NOT verify WASM/browser behavior.
test('real 30-second cuts from non-keyframe start; compression presets and silent portrait', () => {
  const dir=mkdtempSync(join(tmpdir(),'econtent-media-'))
  const run=(args:string[])=>execFileSync('ffmpeg',['-hide_banner','-loglevel','error',...args],{cwd:dir})
  const probe=()=>JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json','output.mp4'],{cwd:dir,encoding:'utf8'}))
  try {
    run(['-f','lavfi','-i','testsrc2=size=320x180:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','35','-c:v','libx264','-g','300','-pix_fmt','yuv420p','-c:a','aac','-f','mp4','input'])
    for (const compression of ['off','high','balanced','small'] as const) {
      run(encodingArgs({range:{start:1.25,end:31.25},compression,cutStrategy:'precision',outputName:'clip.mp4'}))
      const info=probe();const video=info.streams.find((s:{codec_type:string})=>s.codec_type==='video');const audio=info.streams.find((s:{codec_type:string})=>s.codec_type==='audio')
      assert.equal(video.codec_name,'h264');assert.equal(audio.codec_name,'aac');assert.ok(Math.abs(Number(info.format.duration)-30)<1/30+0.01)
      assert.ok(Math.abs(Number(video.start_time)-Number(audio.start_time))<0.05)
      assert.ok(Math.abs(Number(video.duration)-Number(audio.duration))<0.05)
      run(['-i','output.mp4','-f','null','-'])
      console.log(JSON.stringify({compression,duration:info.format.duration,size:info.format.size,video:video.codec_name,audio:audio.codec_name,audioDuration:audio.duration}))
    }
    rmSync(join(dir,'input'))
    run(['-f','lavfi','-i','testsrc2=size=180x320:rate=24','-t','3','-c:v','libx264','-f','mp4','input'])
    run(encodingArgs({range:{start:0.5,end:2.5},compression:'balanced',outputName:'silent.mp4'}))
    const silent=probe();assert.equal(silent.streams.length,1);assert.equal(silent.streams[0].width,180);assert.ok(Math.abs(Number(silent.format.duration)-2)<0.05)
  } finally { rmSync(dir,{recursive:true,force:true}) }
})

test('Fast Cut copies keyframe-aligned H264/AAC and preserves the first decoded source frame', () => {
  const dir=mkdtempSync(join(tmpdir(),'econtent-fast-'))
  const run=(args:string[])=>execFileSync('ffmpeg',['-hide_banner','-loglevel','error',...args],{cwd:dir})
  try {
    run(['-f','lavfi','-i','testsrc2=size=320x180:rate=30','-f','lavfi','-i','anoisesrc=color=pink:sample_rate=48000:seed=1','-t','35','-c:v','libx264','-g','300','-keyint_min','300','-sc_threshold','0','-pix_fmt','yuv420p','-c:a','aac','-f','mp4','input'])
    const range=alignFastRange({start:12.5,end:31.25},[0,10,20,30],35)
    run(encodingArgs({range,compression:'off',cutStrategy:'fast',outputName:'fast.mp4'}))
    const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json','output.mp4'],{cwd:dir,encoding:'utf8'}))
    assert.equal(info.streams[0].codec_name,'h264');assert.equal(info.streams[1].codec_name,'aac')
    assert.ok(Math.abs(Number(info.format.duration)-20)<0.2)
    const timestampDrift = assertStreamCopySync(join(dir,'input'),join(dir,'output.mp4'))
    const reference=run(['-ss','10','-i','input','-map','0:v:0','-an','-frames:v','1','-f','framemd5','-']).toString().trim().split('\n').at(-1)!.split(',').at(-1)!.trim()
    const output=run(['-i','output.mp4','-map','0:v:0','-an','-frames:v','1','-f','framemd5','-']).toString().trim().split('\n').at(-1)!.split(',').at(-1)!.trim()
    assert.equal(output,reference)
    run(['-i','output.mp4','-f','null','-'])
    console.log(JSON.stringify({method:'fast',requested:[12.5,31.25],keyframeRange:range,duration:info.format.duration,audioStart:info.streams[1].start_time,videoStart:info.streams[0].start_time,firstDecodedFrameMatches:true,timestampDrift}))
  }finally{rmSync(dir,{recursive:true,force:true})}
})
