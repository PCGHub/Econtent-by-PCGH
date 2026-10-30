'use client';
import {useEffect,useState} from 'react';
import type {TextClip} from '@/lib/composition/tracks';
import {rasterizeText,type RasterText} from '@/lib/composition/text';
export function TextLayer({clip,width,height}:{clip:TextClip;width:number;height:number}){
 const [image,setImage]=useState<(Omit<RasterText,'file'>&{url:string})>();const [error,setError]=useState('');
 useEffect(()=>{let active=true,url:string|undefined;void rasterizeText(clip,width,height).then(result=>{if(!active)return;url=URL.createObjectURL(result.file);setImage({...result,url});setError('');}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Text preview unavailable');});return()=>{active=false;if(url)URL.revokeObjectURL(url);};},[clip,width,height]);
 if(error)return <p role="alert" className="absolute inset-x-0 top-0 bg-white p-1 text-xs text-red-700">{error}</p>;
 // Local raster bytes are shared with the export rasterizer, not sent to an image service.
 // eslint-disable-next-line @next/next/no-img-element
 return image?<img alt={clip.text} draggable={false} src={image.url} className="pointer-events-none absolute" style={{left:`${image.x/width*100}%`,top:`${image.y/height*100}%`,width:`${image.width/width*100}%`,height:`${image.height/height*100}%`}}/>:null;
}
