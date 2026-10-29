import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCutPlan } from '../lib/video/planner'
import { alignFastRange, encodingArgs } from '../lib/video/command'
import { assertValidRange } from '../lib/video/validation'

test('full splits, exact multiples, keep/discard and short sources', () => {
  for (const [duration, keep, count] of [[120,true,4],[125,true,5],[125,false,4],[20,true,1],[20,false,0]] as const) {
    const clips = createCutPlan({ mode: 'full-split', sourceDuration: duration, clipDuration:30, keepRemainder:keep })
    assert.equal(clips.length,count)
    for (const [index,clip] of clips.entries()) { assert.ok(clip.end <= duration); assert.ok(clip.duration > 0); if(index) assert.equal(clips[index-1].end,clip.start) }
  }
})
test('section, manual trim, compression only and fractional boundaries', () => {
  assert.deepEqual(createCutPlan({mode:'manual-trim',sourceDuration:60,selectedRange:{start:12.5,end:39.5}}),[{index:1,start:12.5,end:39.5,duration:27}])
  assert.equal(createCutPlan({mode:'section-split',sourceDuration:700,selectedRange:{start:300,end:600},clipDuration:120,keepRemainder:true}).length,3)
  assert.equal(createCutPlan({mode:'section-split',sourceDuration:700,selectedRange:{start:300,end:600},clipDuration:120,keepRemainder:false}).length,2)
  assert.equal(createCutPlan({mode:'compress-only',sourceDuration:6})[0].end,6)
  for (const keepRemainder of [true,false]) assert.equal(createCutPlan({mode:'full-split',sourceDuration:0.3,clipDuration:0.1,keepRemainder}).at(-1)?.end,0.3)
})
test('invalid inputs and resource exhaustion are rejected', () => {
  for (const value of [0,-1,NaN,Infinity]) assert.throws(()=>createCutPlan({mode:'full-split',sourceDuration:60,clipDuration:value}))
  for (const range of [{start:-1,end:5},{start:5,end:5},{start:8,end:7},{start:0,end:61},{start:NaN,end:6}]) assert.throws(()=>assertValidRange(range,60))
  assert.throws(()=>createCutPlan({mode:'full-split',sourceDuration:60,clipDuration:0.00001}))
})
test('accurate encode uses input seek, optional audio and H264/AAC', () => {
  for(const compression of ['off','high','balanced','small'] as const) {
    const args=encodingArgs({range:{start:1.25,end:31.25},compression,cutStrategy:'precision',outputName:'clip.mp4'})
    assert.ok(args.indexOf('-ss')<args.indexOf('-i'));assert.ok(args.includes('libx264'));assert.ok(args.includes('0:a:0?'));assert.equal(args[args.indexOf('-t')+1],'30')
  }
})

test('Fast Cut is stream copy only and uses deterministic preceding keyframes', () => {
  const args = encodingArgs({ range: { start: 10, end: 20 }, cutStrategy: 'fast', compression: 'off', outputName: 'clip.mp4' })
  assert.ok(args.includes('copy')); assert.ok(!args.includes('libx264'))
  assert.deepEqual(alignFastRange({ start: 12, end: 29 }, [0,10,20,30], 40), { start:10,end:20 })
  assert.deepEqual(alignFastRange({ start:30,end:35.5 },[0,10,20,30],35.5),{start:30,end:35.5})
  assert.throws(()=>alignFastRange({start:1,end:2},[0,10],20),/Precision/)
  assert.throws(()=>encodingArgs({range:{start:0,end:10},compression:'balanced',cutStrategy:'fast',outputName:'x.mp4'}),/Off/)
})
