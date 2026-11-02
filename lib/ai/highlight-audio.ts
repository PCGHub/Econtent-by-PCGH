/** Optional local audio-energy analysis. Some browsers cannot decode audio from video containers. */
export async function sampleAudioEnergy(file:File, duration:number):Promise<((start:number,end:number)=>number)|null>{
 if(file.size>35_000_000||duration>480||typeof AudioContext==="undefined")return null;
 const context=new AudioContext();
 try{
  const buffer=await context.decodeAudioData(await file.arrayBuffer());
  const channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i));
  const sampleRate=buffer.sampleRate;
  const bins=Math.max(1,Math.ceil(duration));
  const energy=new Float32Array(bins);
  for(let second=0;second<bins;second++){
   let sum=0,n=0;
   const start=Math.floor(second*sampleRate);
   const end=Math.min(buffer.length,Math.floor((second+1)*sampleRate));
   const stride=Math.max(1,Math.floor(sampleRate/200));
   for(let i=start;i<end;i+=stride){for(const channel of channels){const value=channel[i]||0;sum+=value*value;n++;}}
   energy[second]=n?Math.sqrt(sum/n):0;
  }
  const max=Math.max(...energy,0.001);
  return (start:number,end:number)=>{
   let sum=0,n=0;
   for(let i=Math.max(0,Math.floor(start));i<Math.min(bins,Math.ceil(end));i++){sum+=energy[i]/max;n++;}
   return n?sum/n:0;
  };
 }catch{return null;}
 finally{await context.close().catch(()=>{});}
}
