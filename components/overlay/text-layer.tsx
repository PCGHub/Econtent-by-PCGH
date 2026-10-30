'use client';
import {useEffect,useState} from 'react';
import type {TextClip} from '@/lib/composition/tracks';
import {rasterizeText,type RasterText} from '@/lib/composition/text';
import {DirectBox} from './direct-box';
export function TextLayer({clip,width,height,selected=false,onSelect,onEdit,onFinish}:{clip:TextClip;width:number;height:number;selected?:boolean;onSelect?:()=>void;onEdit?:(patch:Partial<TextClip>)=>void;onFinish?:(cancel:boolean)=>void}){
 const [image,setImage]=useState<(Omit<RasterText,'file'>&{url:string})>();const [error,setError]=useState('');
 // Position changes reuse raster bytes. Text styling alone invalidates the PNG.
 const signature=JSON.stringify({...clip,x:0,y:0});
 useEffect(()=>{let active=true,url:string|undefined;void rasterizeText(JSON.parse(signature),width,height).then(result=>{if(!active)return;url=URL.createObjectURL(result.file);setImage({...result,url});setError('');}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Text preview unavailable');});return()=>{active=false;if(url)URL.revokeObjectURL(url);};},[signature,width,height]);
 if(error)return <p role="alert" className="absolute inset-x-0 top-0 bg-white p-1 text-xs text-red-700">{error}</p>;
 if(!image)return null;
 const box={x:Math.round(clip.x*(width-image.width))/width,y:Math.round(clip.y*(height-image.height))/height,width:image.width/width,height:image.height/height};
 // Local raster bytes are shared with export, never sent to an image service.
 // eslint-disable-next-line @next/next/no-img-element
 const img=<img alt={clip.text} draggable={false} src={image.url} className="pointer-events-none h-full w-full"/>;
 return onEdit?<DirectBox box={box} label={'Text layer '+clip.text.replace(/\s+/g,' ').slice(0,40)} selected={selected} onSelect={()=>onSelect?.()} onMove={(x,y)=>onEdit({x:width===image.width?0:Math.max(0,Math.min(1,x*width/(width-image.width))),y:height===image.height?0:Math.max(0,Math.min(1,y*height/(height-image.height)))})} onResize={(sx,sy)=>onEdit({fontSize:Math.max(8,Math.min(160,clip.fontSize*Math.min(sx,sy),clip.fontSize*width/image.width,clip.fontSize*height/image.height))})} onFinish={cancel=>onFinish?.(cancel)}>{img}</DirectBox>:<div className="pointer-events-none absolute" style={{left:`${box.x*100}%`,top:`${box.y*100}%`,width:`${box.width*100}%`,height:`${box.height*100}%`}}>{img}</div>;
}
