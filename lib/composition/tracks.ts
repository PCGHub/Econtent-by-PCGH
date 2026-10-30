export interface TextClip {id:string;text:string;start:number;end:number;fontSize:number;color:string;x:number;y:number;bold:boolean;italic:boolean}
export interface AudioClip {id:string;sourceId:string;start:number;end:number;sourceStart:number;volume:number;muted:boolean}
export interface StudioTracks {version:1;text:TextClip[];audio:AudioClip[];zoom:number;muteMain:boolean;muteSecondary:boolean}
export interface LocalAudio {id:string;file:File;url:string;duration:number}
export const EMPTY_TRACKS:StudioTracks={version:1,text:[],audio:[],zoom:1,muteMain:false,muteSecondary:false};
const obj=(v:unknown)=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid track metadata');return v as Record<string,unknown>;};
const keys=(v:Record<string,unknown>,allowed:string[])=>{if(Object.keys(v).length!==allowed.length||Object.keys(v).some(k=>!allowed.includes(k)))throw Error('Unexpected track fields');};
const num=(v:unknown,min:number,max:number)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error('Invalid track number/range');return v;};
const bool=(v:unknown)=>{if(typeof v!=='boolean')throw Error('Invalid mute/style flag');return v;};
export function trackId(v:unknown):string{if(typeof v!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(v))throw Error('Invalid track identity');return v;}
export function parseTracks(value:unknown,duration:number):StudioTracks{
 const v=obj(value);keys(v,['version','text','audio','zoom','muteMain','muteSecondary']);
 if(v.version!==1||!Array.isArray(v.text)||!Array.isArray(v.audio)||v.text.length>8||v.audio.length>4)throw Error('Use at most eight text clips and four music clips');
 const range=(v:Record<string,unknown>)=>{const start=num(v.start,0,duration),end=num(v.end,0,duration);if(end-start<.01)throw Error('Clip end must follow start and remain within the project');return {start,end};};
 const text=v.text.map(value=>{const t=obj(value);keys(t,['id','text','start','end','fontSize','color','x','y','bold','italic']);if(typeof t.text!=='string'||!t.text.trim()||t.text.length>500||t.text.split('\n').length>8||/[\u0000-\u0008\u000b-\u001f]/.test(t.text))throw Error('Text must contain 1–500 characters and at most eight lines');if(typeof t.color!=='string'||!/^#[a-f0-9]{6}$/i.test(t.color))throw Error('Choose a six-digit text color');return {id:trackId(t.id),text:t.text,...range(t),fontSize:num(t.fontSize,8,160),color:t.color,x:num(t.x,0,1),y:num(t.y,0,1),bold:bool(t.bold),italic:bool(t.italic)};});
 const audio=v.audio.map(value=>{const a=obj(value);keys(a,['id','sourceId','start','end','sourceStart','volume','muted']);return {id:trackId(a.id),sourceId:trackId(a.sourceId),...range(a),sourceStart:num(a.sourceStart,0,31536000),volume:num(a.volume,0,1),muted:bool(a.muted)};});
 if(new Set([...text,...audio].map(c=>c.id)).size!==text.length+audio.length)throw Error('Duplicate clip identity');
 return {version:1,text,audio,zoom:num(v.zoom,1,8),muteMain:bool(v.muteMain),muteSecondary:bool(v.muteSecondary)};
}
/** Move preserves duration. Trimming the left of audio advances its source offset. */
export function editClip<T extends {start:number;end:number;sourceStart?:number}>(clip:T,kind:'move'|'start'|'end',delta:number,duration:number):T{
 if(!Number.isFinite(delta))throw Error('Invalid timeline movement');
 if(kind==='move'){const start=Math.max(0,Math.min(duration-(clip.end-clip.start),clip.start+delta));return {...clip,start,end:start+clip.end-clip.start};}
 if(kind==='end')return {...clip,end:Math.max(clip.start+.01,Math.min(duration,clip.end+delta))};
 const minimum=clip.sourceStart===undefined?0:Math.max(0,clip.start-clip.sourceStart);
 const start=Math.max(minimum,Math.min(clip.end-.01,clip.start+delta));return {...clip,start,...(clip.sourceStart===undefined?{}:{sourceStart:clip.sourceStart+start-clip.start})};
}
