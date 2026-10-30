'use client';
import {useRef} from 'react';
import {geometry,type Composition,type LocalMedia} from '@/lib/composition/model';
export function CropReposition({role,settings,media,onChange,onFinish,onSelect}:{role:'main'|'layer';settings:Composition;media:LocalMedia;onChange:(c:Composition)=>void;onFinish:(cancel:boolean)=>void;onSelect:()=>void}){
 const g=geometry(settings),r=role==='main'?g.main:g.overlay;
 const active=useRef<{id:number;x:number;y:number;w:number;h:number;base:Composition}|null>(null);
 const scale=Math.max(r.w/media.width,r.h/media.height),overflowX=media.width*scale-r.w,overflowY=media.height*scale-r.h;
 return <div role="button" tabIndex={0} aria-label={'Reposition '+role+' crop'} className="absolute cursor-move border-2 border-amber-400" style={{left:`${r.x/g.w*100}%`,top:`${r.y/g.h*100}%`,width:`${r.w/g.w*100}%`,height:`${r.h/g.h*100}%`,touchAction:'none'}}
 onPointerDown={e=>{if(e.button!==0||!e.isPrimary)return;e.preventDefault();e.stopPropagation();onSelect();e.currentTarget.setPointerCapture(e.pointerId);const bounds=e.currentTarget.parentElement!.getBoundingClientRect();active.current={id:e.pointerId,x:e.clientX,y:e.clientY,w:bounds.width,h:bounds.height,base:settings};}}
 onPointerMove={e=>{const a=active.current;if(!a||a.id!==e.pointerId)return;e.preventDefault();e.stopPropagation();const dx=(e.clientX-a.x)*g.w/a.w,dy=(e.clientY-a.y)*g.h/a.h,cx=role==='main'?'mainCropX':'cropX',cy=role==='main'?'mainCropY':'cropY';onChange({...a.base,[cx]:overflowX?Math.max(0,Math.min(1,a.base[cx]-dx/overflowX)):a.base[cx],[cy]:overflowY?Math.max(0,Math.min(1,a.base[cy]-dy/overflowY)):a.base[cy]});}}
 onPointerUp={e=>{if(active.current?.id!==e.pointerId)return;active.current=null;onFinish(false);}}
 onPointerCancel={e=>{if(active.current?.id!==e.pointerId)return;active.current=null;onFinish(true);}}
 onLostPointerCapture={()=>{if(active.current){active.current=null;onFinish(true);}}}
 onKeyDown={e=>{const delta=e.key==='ArrowLeft'?-.02:e.key==='ArrowRight'?.02:0,vertical=e.key==='ArrowUp'?-.02:e.key==='ArrowDown'?.02:0;if(!delta&&!vertical)return;e.preventDefault();onSelect();const cx=role==='main'?'mainCropX':'cropX',cy=role==='main'?'mainCropY':'cropY';onChange({...settings,[cx]:Math.max(0,Math.min(1,settings[cx]+delta)),[cy]:Math.max(0,Math.min(1,settings[cy]+vertical))});onFinish(false);}}/>;
}
