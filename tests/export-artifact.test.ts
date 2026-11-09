import assert from "node:assert/strict";
import test from "node:test";
import {inspectMp4} from "../lib/billing/artifact";
const box=(type:string,payload:Uint8Array)=>{const out=new Uint8Array(8+payload.length),view=new DataView(out.buffer);view.setUint32(0,out.length);out.set(new TextEncoder().encode(type),4);out.set(payload,8);return out};
test("server artifact inspection requires MP4 structure and reads movie duration",()=>{const ftyp=box("ftyp",new Uint8Array(992));const mvhdPayload=new Uint8Array(24),view=new DataView(mvhdPayload.buffer);view.setUint32(12,1000);view.setUint32(16,5000);const moov=box("moov",box("mvhd",mvhdPayload));const bytes=new Uint8Array(ftyp.length+moov.length);bytes.set(ftyp);bytes.set(moov,ftyp.length);const result=inspectMp4(bytes);assert.equal(result.durationMs,5000);assert.equal(result.sizeBytes,bytes.length);assert.match(result.sha256,/^[a-f0-9]{64}$/);assert.match(result.receipt,/^[a-f0-9]{64}$/)});
test("server artifact inspection rejects arbitrary bytes",()=>assert.throws(()=>inspectMp4(new Uint8Array(2000)),/not an MP4/));
