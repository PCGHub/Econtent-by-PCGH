import type {Composition} from './model';
import type {TextClip} from './tracks';
const layerKeys=['layout','x','y','width','height','split','mainCropX','mainCropY','cropX','cropY','mainFit','overlayFit'] as const;
const textKeys=['x','y','fontSize','rotation','align','outline','outlineColor','shadow','background','color','bold','italic'] as const;
/** Restore spatial edits without rolling back timestamps, media references or audio edits. */
export function restoreSpatial(current:Composition,snapshot:Composition):Composition{
 const next={...current};for(const key of layerKeys)Object.assign(next,{[key]:snapshot[key]});
 if(current.tracks)next.tracks={...current.tracks,text:current.tracks.text.map(clip=>{const saved=snapshot.tracks?.text.find(t=>t.id===clip.id);if(!saved)return clip;const restored={...clip};for(const key of textKeys){delete restored[key];if(saved[key]!==undefined)Object.assign(restored,{[key]:saved[key]});}return restored as TextClip;})};
 return next;
}
export function spatialSignature(c:Composition){return JSON.stringify([layerKeys.map(k=>c[k]),c.tracks?.text.map(t=>[t.id,...textKeys.map(k=>t[k])])]);}
