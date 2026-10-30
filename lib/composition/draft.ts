import {parseComposition,type Composition} from './model';
export interface LayerMetadata {
  kind:'video'|'image';
  name:string;sizeBytes:number;durationSeconds:number;width:number;height:number;mimeType:string;sha256:string;
}
export interface CompositionDraft {settings:Composition;layer:LayerMetadata}
export function parseCompositionDraft(value:unknown):CompositionDraft{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid composition draft');
 const v=value as Record<string,unknown>;
 if(Object.keys(v).length!==2||!('settings'in v)||!('layer'in v))throw Error('Unexpected composition draft fields');
 const settings=parseComposition(v.settings),layer=v.layer;
 if(!layer||typeof layer!=='object'||Array.isArray(layer))throw Error('Invalid layer metadata');
 const l=layer as Record<string,unknown>;
 const allowed=['kind','name','sizeBytes','durationSeconds','width','height','mimeType','sha256'];
 if(Object.keys(l).length!==allowed.length||Object.keys(l).some(k=>!allowed.includes(k)))throw Error('Unexpected layer metadata fields');
 if(l.kind!=='image'&&l.kind!=='video')throw Error('Invalid layer kind');
 for(const [key,max]of [['name',255],['mimeType',100],['sha256',64]] as const)if(typeof l[key]!=='string'||!l[key].trim()||l[key].length>max||/[\u0000-\u001f]/.test(l[key]))throw Error('Invalid layer '+key);
 if(!/^[a-f0-9]{64}$/.test(String(l.sha256)))throw Error('Invalid layer fingerprint');
 for(const [key,max]of [['sizeBytes',l.kind==='image'?16*1048576:256*1048576],['width',65535],['height',65535]] as const)if(typeof l[key]!=='number'||!Number.isSafeInteger(l[key])||l[key]<1||l[key]>max)throw Error('Invalid layer '+key);
 if(typeof l.durationSeconds!=='number'||!Number.isFinite(l.durationSeconds)||l.durationSeconds<0||l.durationSeconds>31536000||(l.kind==='video'&&l.durationSeconds===0)||(l.kind==='image'&&l.durationSeconds!==0))throw Error('Invalid layer duration');
 if(Number(l.width)*Number(l.height)>16777216)throw Error('Layer resolution exceeds safety limit');
 if(l.kind==='video'&&settings.secondaryStart+settings.overlayEnd-settings.overlayStart>l.durationSeconds+.001)throw Error('Saved layer range exceeds its source');
 if(l.kind==='image'&&(settings.audio==='secondary'||settings.audio==='mix'))throw Error('A photo has no selectable secondary audio');
 return {settings,layer:Object.fromEntries(allowed.map(key=>[key,l[key]])) as unknown as LayerMetadata};
}
