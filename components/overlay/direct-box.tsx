'use client';
import {useRef,useState,type ReactNode,type PointerEvent} from 'react';
export interface CanvasBox {x:number;y:number;width:number;height:number}
const clamp=(n:number,min=0,max=1)=>Math.max(min,Math.min(max,n));
/** Pointer capture keeps both touch and mouse gestures away from playback/timeline controls. */
export function DirectBox({box,label,selected,onSelect,onMove,onResize,onFinish,children,resizable=true}:{box:CanvasBox;label:string;selected:boolean;onSelect:()=>void;onMove:(x:number,y:number)=>void;onResize:(scaleX:number,scaleY:number)=>void;onFinish:(cancel:boolean)=>void;children?:ReactNode;resizable?:boolean}){
 const active=useRef<{id:number;x:number;y:number;w:number;h:number;box:CanvasBox;resize:boolean;move:typeof onMove;scale:typeof onResize}|null>(null);const [guides,setGuides]=useState({x:false,y:false});
 const start=(e:PointerEvent<HTMLDivElement>)=>{if(e.button!==0||!e.isPrimary)return;e.preventDefault();e.stopPropagation();onSelect();const parent=e.currentTarget.parentElement!.getBoundingClientRect();active.current={id:e.pointerId,x:e.clientX,y:e.clientY,w:parent.width,h:parent.height,box,resize:(e.target as HTMLElement).dataset.resize==='true',move:onMove,scale:onResize};e.currentTarget.setPointerCapture(e.pointerId);};
 const end=(e:PointerEvent<HTMLDivElement>,cancel=false)=>{if(!active.current||active.current.id!==e.pointerId)return;e.preventDefault();e.stopPropagation();active.current=null;setGuides({x:false,y:false});onFinish(cancel);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);};
 return <div role="group" tabIndex={0} aria-roledescription="draggable overlay" aria-label={label} data-selected={selected} data-testid={label} className={`absolute select-none ${selected?'outline outline-2 outline-blue-400':''}`} style={{left:`${box.x*100}%`,top:`${box.y*100}%`,width:`${box.width*100}%`,height:`${box.height*100}%`,touchAction:'none',cursor:'move'}}
 onPointerDown={start} onPointerMove={e=>{const a=active.current;if(!a||a.id!==e.pointerId)return;e.preventDefault();e.stopPropagation();const dx=(e.clientX-a.x)/a.w,dy=(e.clientY-a.y)/a.h;
 if(a.resize){a.scale(clamp(a.box.width+dx,.01,1-a.box.x)/a.box.width,clamp(a.box.height+dy,.01,1-a.box.y)/a.box.height);return;}
 let x=clamp(a.box.x+dx,0,1-a.box.width),y=clamp(a.box.y+dy,0,1-a.box.height);const sx=Math.abs(x+a.box.width/2-.5)<6/a.w,sy=Math.abs(y+a.box.height/2-.5)<6/a.h;if(sx)x=(1-a.box.width)/2;if(sy)y=(1-a.box.height)/2;setGuides({x:sx,y:sy});a.move(x,y);
 }} onPointerUp={e=>end(e)} onPointerCancel={e=>end(e,true)} onLostPointerCapture={e=>{if(active.current)end(e,true);}}
 onKeyDown={e=>{if(e.key==='Escape'){active.current=null;setGuides({x:false,y:false});onFinish(true);return;}const dx=e.key==='ArrowLeft'?-.005:e.key==='ArrowRight'?.005:0,dy=e.key==='ArrowUp'?-.005:e.key==='ArrowDown'?.005:0;if(!dx&&!dy)return;e.preventDefault();e.stopPropagation();onSelect();onMove(clamp(box.x+dx,0,1-box.width),clamp(box.y+dy,0,1-box.height));onFinish(false);}}>
 {children}
 {selected&&resizable&&<button type="button" aria-label={'Resize '+label} onKeyDown={e=>{const dx=e.key==='ArrowRight'?.01:e.key==='ArrowLeft'?-.01:0,dy=e.key==='ArrowDown'?.01:e.key==='ArrowUp'?-.01:0;if(!dx&&!dy)return;e.preventDefault();e.stopPropagation();onResize(clamp(box.width+dx,.01,1-box.x)/box.width,clamp(box.height+dy,.01,1-box.y)/box.height);onFinish(false);}} data-resize="true" className="absolute -bottom-3 -right-3 z-20 size-7 rounded-full border-2 border-blue-600 bg-white shadow" style={{touchAction:'none',cursor:'nwse-resize'}}/>}
 {(guides.x||guides.y)&&<span aria-live="polite" className="absolute bottom-full left-0 whitespace-nowrap bg-blue-600 px-1 text-[10px] text-white">{guides.x?'Centered horizontally ':''}{guides.y?'Centered vertically':''}</span>}
 </div>;
}
