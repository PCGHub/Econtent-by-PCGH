import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JobProgressTracker, mediaFraction } from '../lib/video/progress'

test('duration-weighted overall progress never reaches 100 before finalized outputs', () => {
  let now = 1
  const job = new JobProgressTracker([90, 90, 0.625], () => now)
  assert.equal(job.snapshot().overallFraction, 0)
  assert.equal(job.update(0, { status: 'loading' }).indeterminate, true)
  assert.equal(job.update(0, { status: 'preparing' }).etaSeconds, undefined)
  assert.equal(job.update(0, { status: 'processing', fraction: 0.5 }).overallFraction, 45 / 180.625)
  job.update(0, { status: 'processing', fraction: 1 }); job.finishClip(0)
  assert.equal(job.update(1, { status: 'preparing' }).overallFraction, 90 / 180.625)
  job.update(1, { status: 'processing', fraction: 1 }); job.finishClip(1)
  job.update(2, { status: 'processing', fraction: 1 }); job.finishClip(2)
  assert.equal(job.snapshot().overallFraction, 0.99)
  assert.equal(job.finish('completed').overallFraction, 1)
  now = 10000; assert.equal(job.snapshot().elapsedSeconds, 0)
})
test('unreliable, regressing and missing events cannot fabricate progress or ETA', () => {
  let now = 100
  const job = new JobProgressTracker([100], () => now)
  job.update(0, { status: 'processing', fraction: 0.25 })
  assert.equal(job.update(0, { status: 'processing', fraction: 0.1 }).overallFraction, 0.25)
  assert.equal(job.update(0, { status: 'processing', fraction: NaN }).indeterminate, true)
  assert.equal(job.snapshot().etaSeconds, undefined)
  job.update(0, { status: 'processing', fraction: 0.3 }); now += 5000
  assert.equal(job.snapshot().indeterminate, true)
  assert.equal(job.snapshot().overallFraction, 0.3)
  assert.throws(() => job.finish('completed'))
  const cancelled = job.finish('cancelled'); now += 1000
  assert.equal(job.snapshot().elapsedSeconds, cancelled.elapsedSeconds)
  assert.equal(job.update(0, { status: 'processing', fraction: 1 }).status, 'cancelled')
})
test('ETA requires stable timed samples and is removed while finalizing or stalled', () => {
  let now = 100
  const job = new JobProgressTracker([100], () => now)
  for (let i = 0; i < 8; i++) { now += 1000; job.update(0, { status: 'processing', fraction: i / 100 }) }
  assert.ok(Math.abs(job.snapshot().etaSeconds! - 93) < 0.01)
  now += 5000; assert.equal(job.snapshot().etaSeconds, undefined)
  assert.equal(job.update(0, { status: 'finalizing' }).etaSeconds, undefined)
})
test('ZIP progress uses actual packaging callbacks and completion is explicit', () => {
  const job = new JobProgressTracker([])
  assert.equal(job.update(0, { status: 'packaging' }).indeterminate, true)
  assert.equal(job.update(0, { status: 'packaging', fraction: 0.42 }).overallFraction, 0.42)
  assert.equal(job.update(0, { status: 'packaging', fraction: 1 }).overallFraction, 0.99)
  assert.equal(job.finish('completed').overallFraction, 1)
})
test('FFmpeg output timestamps are normalized against the active clip, not source duration', () => {
  assert.equal(mediaFraction(45e6, 90), 0.5)
  for (const time of [NaN, Infinity, -1, 180e6]) assert.equal(mediaFraction(time, 90), undefined)
  assert.equal(mediaFraction(90.04e6, 90), 1)
})

test('invalid planned work and stale clip callbacks cannot corrupt job percentages', () => {
  for (const duration of [0,-1,NaN,Infinity]) assert.throws(()=>new JobProgressTracker([duration]))
  const job=new JobProgressTracker([10,10])
  job.update(0,{status:'processing',fraction:1});job.finishClip(0)
  job.update(1,{status:'preparing'})
  assert.equal(job.update(0,{status:'processing',fraction:0.5}).clipIndex,2)
  const zip=new JobProgressTracker([])
  assert.equal(zip.update(0,{status:'packaging',fraction:2}).indeterminate,true)
})

test('timestamp callbacks preserve the stage description without inventing percentages', () => {
  const job = new JobProgressTracker([30])
  job.update(0, { status: 'processing', message: 'Copying streams at source keyframes…' })
  const progress = job.update(0, { status: 'processing', fraction: 0.25 })
  assert.equal(progress.message, 'Copying streams at source keyframes…')
  assert.equal(progress.overallFraction, 0.25)
  assert.equal(job.update(0, { status: 'finalizing' }).message, undefined)
})

test('operation diagnostics use elapsed clocks and only advancing measured media timestamps', () => {
  let now = 100
  const job = new JobProgressTracker([30], () => now)
  job.update(0, {status:'preparing', operation:'Inspect source metadata'})
  now = 1100
  assert.equal(job.snapshot().operationElapsedSeconds, 1)
  job.update(0, {status:'processing', operation:'Copy selected streams to MP4'})
  now = 2100
  job.update(0, {status:'processing', fraction:0.5})
  now = 4100
  const repeated = job.update(0, {status:'processing', fraction:0.5})
  assert.equal(repeated.lastMediaAdvanceSeconds, 2)
  assert.equal(repeated.operation, 'Copy selected streams to MP4')
  assert.equal(repeated.operationElapsedSeconds, 3)
  now = 7100
  const stalled = job.update(0, {status:'processing', fraction:0.5})
  assert.equal(stalled.indeterminate, true)
  assert.equal(stalled.etaSeconds, undefined)
  assert.equal(stalled.lastMediaAdvanceSeconds, 5)
  const failed = job.finish('failed')
  now = 8100
  assert.equal(job.snapshot().operationElapsedSeconds, failed.operationElapsedSeconds)
})

test('measured startup bytes do not advance video percentage or invent an ETA', () => {
  const job = new JobProgressTracker([30])
  const progress = job.update(0, {status:'loading',operation:'Download FFmpeg WASM',startup:{phase:'download',receivedBytes:1024,totalBytes:4096}})
  assert.equal(progress.startup?.receivedBytes,1024)
  assert.equal(progress.overallFraction,0)
  assert.equal(progress.indeterminate,true)
  assert.equal(progress.etaSeconds,undefined)
})
