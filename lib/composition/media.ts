import type {LocalMedia} from './model';
export async function readLocalMedia(file:File,kind:'video'|'image',signal?:AbortSignal):Promise<LocalMedia>{
  if(!file.size||file.size>(kind==='image'?16:256)*1048576)throw Error(kind==='image'?'Choose a non-empty PNG, JPEG or WebP up to 16 MiB.':'Choose a non-empty video up to 256 MiB.');
  if(kind==='image'&&!/\.(png|jpe?g|webp)$/i.test(file.name))throw Error('Photo overlays support PNG, JPEG and WebP.');
  signal?.throwIfAborted();const url=URL.createObjectURL(file);
  try{
    const details=await new Promise<{duration:number;width:number;height:number}>((resolve,reject)=>{
      const element=kind==='image'?new Image():document.createElement('video');
      const finish=(error?:Error)=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);element.onload=null;element.onerror=null;if(element instanceof HTMLVideoElement){element.onloadedmetadata=null;element.removeAttribute('src');element.load();}if(error)reject(error);};
      const cancel=()=>finish(new DOMException('Cancelled','AbortError'));
      const timer=setTimeout(()=>finish(Error('Local preview metadata did not load. This browser may not decode the source; convert it with Precision Cut in Video Cutter, then import the MP4.')),15000);
      element.onerror=()=>finish(Error('This browser cannot preview this media. Use Video Cutter to explicitly convert a supported source to H.264/AAC MP4, then import it here.'));
      const ready=()=>{
        const video=element instanceof HTMLVideoElement;const width=video?element.videoWidth:(element as HTMLImageElement).naturalWidth,height=video?element.videoHeight:(element as HTMLImageElement).naturalHeight,duration=video?element.duration:0;
        if(!width||!height||(video&&(!Number.isFinite(duration)||duration<=0))||width*height>16777216){finish(Error('Invalid dimensions/duration or image/video exceeds the 16-megapixel preview safety limit.'));return;}
        resolve({duration,width,height});finish();
      };
      signal?.addEventListener('abort',cancel,{once:true});
      if(element instanceof HTMLVideoElement){element.preload='metadata';element.onloadedmetadata=ready;}else element.onload=ready;
      element.src=url;
    });
    return {file,url,kind,...details};
  }catch(error){URL.revokeObjectURL(url);throw error;}
}
