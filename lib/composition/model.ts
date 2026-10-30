export type Layout = 'stack' | 'pip' | 'full';
export type Ratio = '9:16' | '16:9' | '1:1' | '4:5';
export interface Composition {
  version: 1;
  layout: Layout;
  ratio: Ratio;
  resolution: 360 | 720;
  fps: 24 | 30;
  trimStart: number;
  trimEnd: number;
  overlayStart: number;
  overlayEnd: number;
  secondaryStart: number;
  split: number;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  mainFit: 'cover' | 'contain';
  overlayFit: 'cover' | 'contain';
  mainCropX: number;
  mainCropY: number;
  cropX: number;
  cropY: number;
  audio: 'main' | 'secondary' | 'mix' | 'none';
  mainVolume: number;
  secondaryVolume: number;
}
export const DEFAULT_COMPOSITION: Composition = {
  version:1,layout:'stack',ratio:'9:16',resolution:360,fps:30,trimStart:0,trimEnd:0,
  overlayStart:0,overlayEnd:0,secondaryStart:0,split:.5,x:.65,y:.65,width:.3,height:.3,
  opacity:1,mainFit:'cover',overlayFit:'cover',mainCropX:.5,mainCropY:.5,cropX:.5,cropY:.5,
  audio:'main',mainVolume:1,secondaryVolume:1,
};
export interface LocalMedia {
  file: File;
  url: string;
  kind: 'video' | 'image';
  duration: number;
  width: number;
  height: number;
  sha256?: string;
}
export function parseComposition(value: unknown): Composition {
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid composition settings');
  const v=value as Record<string,unknown>;
  if(Object.keys(v).length!==Object.keys(DEFAULT_COMPOSITION).length||Object.keys(v).some(k=>!(k in DEFAULT_COMPOSITION)))throw Error('Unexpected composition fields');
  for(const [key,choices] of Object.entries({version:[1],layout:['stack','pip','full'],ratio:['9:16','16:9','1:1','4:5'],resolution:[360,720],fps:[24,30],mainFit:['cover','contain'],overlayFit:['cover','contain'],audio:['main','secondary','mix','none']})){
    if(!choices.includes(v[key] as never))throw Error('Invalid composition '+key);
  }
  for(const key of ['trimStart','trimEnd','overlayStart','overlayEnd','secondaryStart'])if(typeof v[key]!=='number'||!Number.isFinite(v[key])||v[key]<0||v[key]>31536000)throw Error('Invalid composition '+key);
  for(const key of ['split','x','y','width','height','opacity','mainCropX','mainCropY','cropX','cropY','mainVolume','secondaryVolume'])if(typeof v[key]!=='number'||!Number.isFinite(v[key])||v[key]<0||v[key]>1)throw Error('Invalid composition '+key);
  const c=v as unknown as Composition;
  if(c.split<.1||c.split>.9||c.width<.05||c.height<.05||c.x+c.width>1.000001||c.y+c.height>1.000001)throw Error('Layer position/size exceeds canvas');
  if(c.trimEnd<=c.trimStart||c.overlayEnd<=c.overlayStart||c.overlayEnd>c.trimEnd-c.trimStart+.001)throw Error('Composition timing exceeds trimmed video');
  return Object.fromEntries(Object.keys(DEFAULT_COMPOSITION).map(key=>[key,v[key]])) as unknown as Composition;
}
const even=(n:number)=>Math.max(2,Math.round(n/2)*2);
export function geometry(c: Composition) {
  const [rw,rh]=c.ratio.split(':').map(Number);
  const w=even(c.resolution*(rw>=rh?rw/rh:1)),h=even(c.resolution*(rh>rw?rh/rw:1));
  const split=even(h*c.split);
  const main={x:0,y:0,w,h:c.layout==='stack'?split:h};
  const overlay=c.layout==='stack'?{x:0,y:split,w,h:h-split}:c.layout==='full'?{x:0,y:0,w,h}:{x:Math.round(w*c.x/2)*2,y:Math.round(h*c.y/2)*2,w:even(w*c.width),h:even(h*c.height)};
  // Clamp rounding at the right/bottom edge; same rectangles drive CSS preview and FFmpeg.
  overlay.x=Math.max(0,Math.min(overlay.x,w-overlay.w));overlay.y=Math.max(0,Math.min(overlay.y,h-overlay.h));
  return {w,h,main,overlay};
}
