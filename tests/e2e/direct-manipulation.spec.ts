import {test,expect,type Page,type Locator} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const fixture=()=>{const dir=mkdtempSync(join(tmpdir(),'econtent-direct-'));const run=(args:string[])=>execFileSync('ffmpeg',['-v','error','-y',...args],{cwd:dir,maxBuffer:8*1048576});run(['-f','lavfi','-i','color=black:size=320x180:rate=24','-t','2','-c:v','libx264','main.mp4']);run(['-f','lavfi','-i','color=blue:size=160x160:rate=24','-t','2','-c:v','libx264','layer.mp4']);run(['-f','lavfi','-i','color=blue:size=160x160','-frames:v','1','photo.png']);return {dir,run};};
async function importMedia(page:Page,dir:string,video=false){await page.goto('/overlay-studio');await page.getByLabel('Upload main video',{exact:true}).setInputFiles(join(dir,'main.mp4'));await expect(page.getByLabel('Main composition video')).toBeVisible();await page.getByLabel(video?'Upload overlay video':'Upload photo',{exact:true}).setInputFiles(join(dir,video?'layer.mp4':'photo.png'));await page.getByRole('button',{name:'Free layer positioning',exact:true}).click();await page.getByRole('button',{name:'Add text clip',exact:true}).click();await page.getByLabel('Text 1 content',{exact:true}).fill('MOVE\nTITLE');}
async function drag(page:Page,target:Locator,dx:number,dy:number){await target.scrollIntoViewIfNeeded();const b=await target.boundingBox();await page.mouse.move(b!.x+b!.width/2,b!.y+b!.height/2);await page.mouse.down();await page.mouse.move(b!.x+b!.width/2+dx,b!.y+b!.height/2+dy,{steps:8});await page.mouse.up();}

test('mouse drag/resize, undo and four-ratio styled text/layer exports match normalized live geometry',async({page})=>{
 const {dir,run}=fixture();try{
 await importMedia(page,dir);await page.getByLabel('Aspect ratio',{exact:true}).selectOption('4:5');
 const text=page.locator('[data-testid^="Text layer "]');await expect(text).toBeVisible();await drag(page,text,45,65);
 const moved=Number(await page.getByLabel('Text 1 x',{exact:true}).inputValue());expect(moved).toBeGreaterThan(.1);expect(await page.getByLabel('Text 1 start',{exact:true}).inputValue()).toBe('0');expect(await page.getByLabel('Timeline position',{exact:true}).inputValue()).toBe('0');
 await page.getByRole('button',{name:'Undo layout change',exact:true}).click();await expect(page.getByLabel('Text 1 x',{exact:true})).toHaveValue('0.05');await page.getByRole('button',{name:'Redo layout change',exact:true}).click();expect(Number(await page.getByLabel('Text 1 x',{exact:true}).inputValue())).toBeCloseTo(moved,5);
 const size=Number(await page.getByLabel('Text 1 fontSize',{exact:true}).inputValue());await drag(page,page.getByRole('button',{name:/^Resize Text layer /}),20,20);expect(Number(await page.getByLabel('Text 1 fontSize',{exact:true}).inputValue())).toBeGreaterThan(size);
 await page.getByRole('button',{name:'Undo layout change',exact:true}).click();expect(Number(await page.getByLabel('Text 1 fontSize',{exact:true}).inputValue())).toBe(size);
 await page.getByLabel('Text 1 x',{exact:true}).fill('0.55');await page.getByLabel('Text 1 y',{exact:true}).fill('0.3');await page.getByLabel('Text 1 fontSize',{exact:true}).fill('24');await page.getByLabel('Text 1 rotation',{exact:true}).fill('10');await page.getByLabel('Text 1 outline',{exact:true}).fill('2');await page.getByLabel('Text 1 shadow',{exact:true}).check();await page.getByLabel('Text 1 background enabled',{exact:true}).check();await page.getByLabel('Text 1 background color',{exact:true}).fill('#00ff00');await page.getByLabel('Text 1 alignment',{exact:true}).selectOption('center');
 await page.getByLabel('Layer horizontal position',{exact:true}).fill('0.05');await page.getByLabel('Layer vertical position',{exact:true}).fill('0.7');
 const layer=page.getByTestId('Secondary layer');await drag(page,layer,10,-20);const x=Number(await page.getByLabel('Layer horizontal position',{exact:true}).inputValue());expect(x).toBeGreaterThan(.05);await drag(page,page.getByRole('button',{name:'Resize Secondary layer',exact:true}),8,8);expect(Number(await page.getByLabel('Layer width',{exact:true}).inputValue())).toBeGreaterThan(.3);
 for(const ratio of ['9:16','4:5','1:1','16:9']){
 const priorRaster=await page.getByAltText('MOVE\nTITLE',{exact:true}).getAttribute('src');await page.getByLabel('Aspect ratio',{exact:true}).selectOption(ratio);await expect(page.getByAltText('MOVE\nTITLE',{exact:true})).not.toHaveAttribute('src',priorRaster!);await expect(page.getByAltText('MOVE\nTITLE',{exact:true})).toBeVisible();
 // Wait for the ratio's actual raster dimensions, not a previous asynchronous PNG.
 await expect.poll(()=>page.getByAltText('MOVE\nTITLE',{exact:true}).evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
 const canvas=await page.getByTestId('composition-canvas').boundingBox(),tb=await text.boundingBox(),lb=await page.getByTestId('preview-overlay').boundingBox();
 const expected=[tb!,lb!].map(b=>({x:(b.x-canvas!.x)/canvas!.width,y:(b.y-canvas!.y)/canvas!.height,w:b.width/canvas!.width,h:b.height/canvas!.height}));
 await page.getByLabel('Approve local composition encoding').check();await page.getByRole('button',{name:'Render Preview',exact:true}).click();await expect(page.getByRole('heading',{name:'Rendered preview ready',exact:true})).toBeVisible({timeout:120000});
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download composition MP4',exact:true}).click();const file=join(dir,'output-'+ratio.replace(':','-')+'.mp4');await(await pending).saveAs(file);
 const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',file],{encoding:'utf8'}));const video=info.streams.find((s:{codec_type:string})=>s.codec_type==='video');expect(video.codec_name).toBe('h264');const {width:w,height:h}=video;
 const pixels=run(['-ss','0.5','-i',file,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','-']);
 for(const [index,isColor] of [(r:number,g:number,b:number)=>g>160&&r<80&&b<80,(r:number,g:number,b:number)=>b>160&&r<70&&g<70].entries()){
 let left=w,top=h,right=0,bottom=0,count=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*3;if(isColor(pixels[i],pixels[i+1],pixels[i+2])){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);count++;}}expect(count).toBeGreaterThan(50);const actual={x:left/w,y:top/h,w:(right-left+1)/w,h:(bottom-top+1)/h};for(const key of ['x','y','w','h'] as const)expect(Math.abs(actual[key]-expected[index][key])).toBeLessThan(.025);
 }
 run(['-xerror','-i',file,'-f','null','-']);
 }
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('touch pointer capture moves text/video without seeking, cancellation restores position, crop reposition is explicit',async({browser})=>{
 const {dir}=fixture();const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const page=await context.newPage();try{
 await importMedia(page,dir,true);const text=page.locator('[data-testid^="Text layer "]');await text.scrollIntoViewIfNeeded();const canvas=await page.getByTestId('composition-canvas').boundingBox();const b=await text.boundingBox();const session=await context.newCDPSession(page);
 const touch=async(type:'touchStart'|'touchMove'|'touchEnd'|'touchCancel',x=0,y=0)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y,id:0}]});
 await touch('touchStart',b!.x+b!.width/2,b!.y+b!.height/2);await touch('touchMove',b!.x+b!.width/2+30,b!.y+b!.height/2+40);await touch('touchEnd');
 expect(Number(await page.getByLabel('Text 1 x',{exact:true}).inputValue())).toBeGreaterThan(.1);await expect(page.getByLabel('Timeline position',{exact:true})).toHaveValue('0');await expect.poll(()=>page.getByLabel('Main composition video').evaluate((v:HTMLVideoElement)=>v.currentTime)).toBe(0);
 const layer=page.getByTestId('Secondary layer');await layer.scrollIntoViewIfNeeded();const l=await layer.boundingBox();await touch('touchStart',l!.x+l!.width/2,l!.y+l!.height/2);await touch('touchMove',l!.x+l!.width/2-20,l!.y+l!.height/2-15);await touch('touchEnd');const moved=Number(await page.getByLabel('Layer horizontal position',{exact:true}).inputValue());expect(moved).toBeLessThan(.65);
 await layer.scrollIntoViewIfNeeded();const current=await layer.boundingBox();await touch('touchStart',current!.x+current!.width/2,current!.y+current!.height/2);await touch('touchMove',current!.x+current!.width/2-15,current!.y+current!.height/2);await touch('touchCancel');expect(Number(await page.getByLabel('Layer horizontal position',{exact:true}).inputValue())).toBeCloseTo(moved,5);
 const resize=page.getByRole('button',{name:'Resize Secondary layer',exact:true});await resize.scrollIntoViewIfNeeded();const rb=await resize.boundingBox();await touch('touchStart',rb!.x+rb!.width/2,rb!.y+rb!.height/2);await touch('touchMove',rb!.x+rb!.width/2-200,rb!.y+rb!.height/2-200);await touch('touchEnd');expect(Number(await page.getByLabel('Layer width',{exact:true}).inputValue())).toBe(.05);await page.getByRole('button',{name:'Undo layout change',exact:true}).click();
 await page.getByLabel('Main crop',{exact:true}).selectOption('contain');await expect(page.getByRole('button',{name:'Reposition main',exact:true})).toBeDisabled();await page.getByLabel('Main crop',{exact:true}).selectOption('cover');await page.getByRole('button',{name:'Reposition main',exact:true}).click();const crop=page.getByLabel('Reposition main crop',{exact:true});await crop.scrollIntoViewIfNeeded();const cb=await crop.boundingBox();await touch('touchStart',cb!.x+cb!.width/2,cb!.y+cb!.height/2);await touch('touchMove',cb!.x+cb!.width/2+30,cb!.y+cb!.height/2);await touch('touchEnd');expect(Number(await page.getByLabel('Main crop horizontal',{exact:true}).inputValue())).toBeLessThan(.5);
 expect(canvas!.width).toBeGreaterThan(100);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }finally{await context.close();rmSync(dir,{recursive:true,force:true});}
});
