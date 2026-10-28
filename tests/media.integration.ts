import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { encodingArgs } from '../lib/video/command'

// This verifies command semantics with native FFmpeg. It does NOT verify WASM/browser behavior.
test('real 30-second cuts from non-keyframe start; compression presets and silent portrait', () => {
  const dir=mkdtempSync(join(tmpdir(),'econtent-media-'))
  const run=(args:string[])=>execFileSync('ffmpeg',['-hide_banner','-loglevel','error',...args],{cwd:dir})
  const probe=()=>JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json','output.mp4'],{cwd:dir,encoding:'utf8'}))
  try {
    run(['-f','lavfi','-i','testsrc2=size=320x180:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','35','-c:v','libx264','-g','300','-pix_fmt','yuv420p','-c:a','aac','-f','mp4','input'])
    for (const compression of ['off','high','balanced','small'] as const) {
      run(encodingArgs({range:{start:1.25,end:31.25},compression,outputName:'clip.mp4'}))
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
