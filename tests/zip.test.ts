import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zipClips } from '../lib/video/zip'
import type { ProcessedClip } from '../lib/video/types'
import type { ZipResponse } from '../lib/video/zip'
const clip: ProcessedClip = { id:'1',name:'one.mp4',blob:new Blob(['video']),range:{start:0,end:1},mimeType:'video/mp4' }
test('ZIP cancellation terminates its worker and cannot complete afterward', async()=>{
  let terminated=false
  class ZipWorker {
    onmessage?: (event: {data:ZipResponse})=>void
    onerror?: ()=>void
    terminate(){terminated=true}
    postMessage(){}
  }
  Object.defineProperty(globalThis,'Worker',{value:ZipWorker,configurable:true})
  const signal=new AbortController()
  const result=zipClips([clip],()=>assert.fail('No synthetic progress'),signal.signal)
  signal.abort()
  await assert.rejects(result,{name:'AbortError'})
  assert.equal(terminated,true)
})
test('ZIP percentages and Blob come from the worker, not a timer', async()=>{
  const updates:number[]=[];let terminated=false
  class ZipWorker {
    onmessage?: (event: {data:ZipResponse})=>void
    onerror?: ()=>void
    terminate(){terminated=true}
    postMessage(){queueMicrotask(()=>{this.onmessage?.({data:{type:'progress',fraction:0.42}});this.onmessage?.({data:{type:'done',blob:new Blob(['zip'])}})})}
  }
  Object.defineProperty(globalThis,'Worker',{value:ZipWorker,configurable:true})
  const result=await zipClips([clip],fraction=>updates.push(fraction))
  assert.deepEqual(updates,[0.42]);assert.equal(await result.text(),'zip');assert.equal(terminated,true)
})
