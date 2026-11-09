import {createHash} from "node:crypto";
export type VerifiedMp4={sha256:string;sizeBytes:number;durationMs:number;receipt:string};
function u32(bytes:Uint8Array,offset:number){return new DataView(bytes.buffer,bytes.byteOffset+offset,4).getUint32(0)}
export function inspectMp4(bytes:Uint8Array):VerifiedMp4{
  if(bytes.length<1000||bytes.length>50000000)throw Error("Artifact size is outside the verified Preview limit");
  if(String.fromCharCode(...bytes.slice(4,8))!=="ftyp")throw Error("Artifact is not an MP4 file");
  let offset=0,durationMs=0;
  while(offset+8<=bytes.length){let size=u32(bytes,offset);const type=String.fromCharCode(...bytes.slice(offset+4,offset+8));if(size===0)size=bytes.length-offset;if(size<8||offset+size>bytes.length)break;if(type==="moov"){let inner=offset+8;while(inner+8<=offset+size){const child=u32(bytes,inner),kind=String.fromCharCode(...bytes.slice(inner+4,inner+8));if(child<8||inner+child>offset+size)break;if(kind==="mvhd"){const version=bytes[inner+8];const base=inner+12+(version===1?16:8);const timescale=u32(bytes,base);const duration=version===1?Number(new DataView(bytes.buffer,bytes.byteOffset+base+4,8).getBigUint64(0)):u32(bytes,base+4);if(timescale>0&&duration>0)durationMs=Math.round(duration/timescale*1000)}inner+=child}break}offset+=size}
  if(!durationMs||durationMs>86400000)throw Error("MP4 duration metadata is invalid");
  const sha256=createHash("sha256").update(bytes).digest("hex");
  const receipt=createHash("sha256").update(`server-artifact-v1:${sha256}:${bytes.length}:${durationMs}`).digest("hex");
  return{sha256,sizeBytes:bytes.length,durationMs,receipt};
}
