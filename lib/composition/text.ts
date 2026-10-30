import type {TextClip} from './tracks';
export interface RasterText {file:File;width:number;height:number;x:number;y:number}
/** The same rasterizer drives live preview and export, including Unicode and line wrapping. */
export async function rasterizeText(clip:TextClip,w:number,h:number):Promise<RasterText>{
 await document.fonts.ready;
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas text rendering is unavailable');
 const size=clip.fontSize*Math.min(w,h)/360,pad=Math.ceil(size*.15+(clip.outline??0)*Math.min(w,h)/360+(clip.shadow?size*.3:0)),lineHeight=Math.ceil(size*1.25),maxWidth=Math.max(1,w-2*pad);
 const font=`${clip.italic?'italic ':''}${clip.bold?'700':'400'} ${size}px sans-serif`;
 ctx.font=font;const lines:string[]=[];
 for(const paragraph of clip.text.split('\n')){let line='';for(const char of paragraph){if(line&&ctx.measureText(line+char).width>maxWidth){lines.push(line);line='';}line+=char;}lines.push(line);}
 if(lines.length*lineHeight+pad*2>h)throw Error('Text is too large for this canvas. Reduce font size or content.');
 const width=Math.min(w,Math.ceil(Math.max(1,...lines.map(l=>ctx.measureText(l).width)))+pad*2),height=lines.length*lineHeight+pad*2;
 canvas.width=width;canvas.height=height;ctx.font=font;ctx.textBaseline='top';
 if(clip.background&&clip.background!=='transparent'){ctx.fillStyle=clip.background;ctx.fillRect(0,0,width,height);}
 ctx.fillStyle=clip.color;ctx.textAlign=clip.align??'left';ctx.lineJoin='round';ctx.strokeStyle=clip.outlineColor??'#000000';ctx.lineWidth=2*(clip.outline??0)*Math.min(w,h)/360;
 const at=clip.align==='center'?width/2:clip.align==='right'?width-pad:pad;
 for(const [i,line]of lines.entries()){ctx.save();if(clip.shadow){ctx.shadowColor='#000000';ctx.shadowBlur=size*.15;ctx.shadowOffsetX=size*.08;ctx.shadowOffsetY=size*.08;}if(ctx.lineWidth>0&&(clip.outline??0)>0)ctx.strokeText(line,at,pad+i*lineHeight);ctx.fillText(line,at,pad+i*lineHeight);ctx.restore();}
 let output=canvas;
 if(clip.rotation){const radians=clip.rotation*Math.PI/180,cos=Math.abs(Math.cos(radians)),sin=Math.abs(Math.sin(radians));const rotated=document.createElement('canvas');rotated.width=Math.ceil(width*cos+height*sin);rotated.height=Math.ceil(width*sin+height*cos);if(rotated.width>w||rotated.height>h)throw Error('Rotated text exceeds the canvas. Reduce its size.');const r=rotated.getContext('2d')!;r.translate(rotated.width/2,rotated.height/2);r.rotate(radians);r.drawImage(canvas,-width/2,-height/2);output=rotated;}

 const blob=await new Promise<Blob>((resolve,reject)=>output.toBlob(b=>b?resolve(b):reject(Error('Text rasterization failed')),'image/png'));
 return {file:new File([blob],`text-${clip.id}.png`,{type:'image/png'}),width:output.width,height:output.height,x:Math.round(clip.x*(w-output.width)),y:Math.round(clip.y*(h-output.height))};
}
