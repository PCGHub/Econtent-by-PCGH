import type {TextClip} from './tracks';
export interface RasterText {file:File;width:number;height:number;x:number;y:number}
/** The same rasterizer drives live preview and export, including Unicode and line wrapping. */
export async function rasterizeText(clip:TextClip,w:number,h:number):Promise<RasterText>{
 await document.fonts.ready;
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas text rendering is unavailable');
 const size=clip.fontSize*Math.min(w,h)/360,pad=Math.ceil(size*.15),lineHeight=Math.ceil(size*1.25),maxWidth=Math.max(1,w-2*pad);
 const font=`${clip.italic?'italic ':''}${clip.bold?'700':'400'} ${size}px sans-serif`;
 ctx.font=font;const lines:string[]=[];
 for(const paragraph of clip.text.split('\n')){let line='';for(const char of paragraph){if(line&&ctx.measureText(line+char).width>maxWidth){lines.push(line);line='';}line+=char;}lines.push(line);}
 if(lines.length*lineHeight+pad*2>h)throw Error('Text is too large for this canvas. Reduce font size or content.');
 const width=Math.min(w,Math.ceil(Math.max(1,...lines.map(l=>ctx.measureText(l).width)))+pad*2),height=lines.length*lineHeight+pad*2;
 canvas.width=width;canvas.height=height;ctx.font=font;ctx.fillStyle=clip.color;ctx.textBaseline='top';
 lines.forEach((line,i)=>ctx.fillText(line,pad,pad+i*lineHeight));
 const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Text rasterization failed')),'image/png'));
 return {file:new File([blob],`text-${clip.id}.png`,{type:'image/png'}),width,height,x:Math.round(clip.x*(w-width)),y:Math.round(clip.y*(h-height))};
}
