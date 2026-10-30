import {test,expect,type Page} from '@playwright/test'
import {execFileSync} from 'node:child_process'
import {mkdtempSync,rmSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'

function fixtures(){
 const dir=mkdtempSync(join(tmpdir(),'econtent-shell-'))
 for(const [name,color]of [['main','red'],['layer','blue']])execFileSync('ffmpeg',['-v','error','-f','lavfi','-i',`color=${color}:size=320x180:rate=24`,'-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','2','-c:v','libx264','-c:a','aac',join(dir,name+'.mp4')])
 return dir
}
async function edit(page:Page,dir:string){
 await page.goto('/overlay-studio')
 await page.getByLabel('Upload main video',{exact:true}).setInputFiles(join(dir,'main.mp4'))
 await expect(page.getByLabel('Main composition video')).toBeVisible()
 await page.getByLabel('Upload overlay video',{exact:true}).setInputFiles(join(dir,'layer.mp4'))
 await page.getByLabel('Composition project title').fill('Preserve my local edit')
 await page.getByRole('button',{name:'Free layer positioning',exact:true}).click()
 await page.getByRole('button',{name:'Add text clip',exact:true}).click()
 await page.getByLabel('Text 1 content',{exact:true}).fill('Persistent text')
 await page.getByLabel('Text 1 x',{exact:true}).fill('0.3')
}
async function oneShell(page:Page){
 await expect(page.locator('[data-testid="workspace-shell"]:visible')).toHaveCount(1)
 await expect(page.locator('[data-testid="workspace-header"]:visible')).toHaveCount(1)
 await expect(page.locator('main:visible')).toHaveCount(1)
 await expect(page.locator('main main')).toHaveCount(0)
}

test('desktop shell collapse preserves live media, editing history and rendered MP4; Cutter sidebar uses its real route',async({page})=>{
 const dir=fixtures()
 try{
  page.on('dialog',dialog=>dialog.accept())
  let workers=0;page.on('worker',()=>workers++)
  await edit(page,dir);await oneShell(page)
  const primary=await page.getByLabel('Main composition video').elementHandle()
  const layer=await page.getByLabel('Secondary composition video').getAttribute('src')
  await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click()
  await expect(page.getByRole('navigation',{name:'Workspace navigation'}).getByRole('link',{name:'Video Cutter',exact:true})).toBeVisible()
  await expect(page.getByLabel('Text 1 x',{exact:true})).toHaveValue('0.3')
  expect(await primary!.evaluate(el=>el===document.querySelector('[aria-label="Main composition video"]'))).toBe(true)
  await page.getByRole('button',{name:'Undo layout change',exact:true}).click();await expect(page.getByLabel('Text 1 x',{exact:true})).toHaveValue('0.05')
  await page.getByRole('button',{name:'Redo layout change',exact:true}).click();await expect(page.getByLabel('Text 1 x',{exact:true})).toHaveValue('0.3')
  await page.getByRole('button',{name:'Expand sidebar',exact:true}).click()
  expect(await page.getByLabel('Secondary composition video').getAttribute('src')).toBe(layer)
  await page.getByLabel('Approve local composition encoding').check();await page.getByRole('button',{name:'Render Preview',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Rendered preview ready',exact:true})).toBeVisible({timeout:120000})
  const rendered=await page.getByLabel('Exported composition preview').elementHandle(),workerCount=workers
  const download=async(name:string)=>{const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download composition MP4',exact:true}).click();const path=join(dir,name);await(await pending).saveAs(path);return path}
  const before=await download('before.mp4')
  await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();await page.getByRole('button',{name:'Expand sidebar',exact:true}).click()
  expect(await rendered!.evaluate(el=>el===document.querySelector('[aria-label="Exported composition preview"]'))).toBe(true)
  await page.getByRole('button',{name:'Render Preview',exact:true}).click();expect(workers).toBe(workerCount)
  const after=await download('after.mp4');expect(createHash('sha256').update(readFileSync(after)).digest('hex')).toBe(createHash('sha256').update(readFileSync(before)).digest('hex'))
  execFileSync('ffmpeg',['-v','error','-xerror','-i',after,'-f','null','-'])
  const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',after],{encoding:'utf8'}));expect(info.streams.map((s:{codec_name:string})=>s.codec_name)).toEqual(['h264','aac'])
  const nav=page.getByRole('navigation',{name:'Workspace navigation'});await expect(nav.getByRole('link',{name:'Overlay Studio',exact:true})).toHaveAttribute('aria-current','page')
  await expect(nav.getByRole('link',{name:'Cinematic Titles coming soon',exact:true})).toHaveAttribute('aria-disabled','true')
  await expect(nav.getByRole('link',{name:'Cinematic Titles coming soon',exact:true})).not.toHaveAttribute('href')
  await nav.getByRole('link',{name:'Video Cutter',exact:true}).click();await expect(page).toHaveURL(/\/editor$/);await oneShell(page)
  await expect(page.getByLabel('Choose video',{exact:true})).toBeVisible();await expect(page.getByRole('navigation',{name:'Workspace navigation'}).getByRole('link',{name:'Video Cutter',exact:true})).toHaveAttribute('aria-current','page')
 }finally{rmSync(dir,{recursive:true,force:true})}
})

test('touch drawer traps focus, closes with Escape/backdrop/button and navigation, preserving attached media and edits',async({browser})=>{
 const dir=fixtures(),context=await browser.newContext({hasTouch:true,isMobile:true,viewport:{width:390,height:844}}),page=await context.newPage()
 try{
  page.on('dialog',dialog=>dialog.accept())
  await edit(page,dir);await oneShell(page)
  const primary=await page.getByLabel('Main composition video').elementHandle(),src=await page.getByLabel('Main composition video').getAttribute('src')
  const open=page.getByRole('button',{name:'Open workspace navigation',exact:true}),dialog=page.getByRole('dialog',{name:'Workspace navigation',exact:true})
  await expect(page.getByRole('navigation',{name:'Workspace navigation'})).toHaveCount(0)
  await open.tap();await expect(dialog).toBeVisible();await expect(page.getByRole('button',{name:'Close workspace navigation',exact:true})).toBeFocused()
  await expect(page.getByTestId('workspace-content')).toHaveAttribute('inert','')
  await page.keyboard.press('Shift+Tab');await expect(dialog.getByRole('link',{name:'Settings',exact:true})).toBeFocused()
  await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Close workspace navigation',exact:true})).toBeFocused()
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(open).toBeFocused()
  await expect(page.getByTestId('workspace-content')).not.toHaveAttribute('inert')
  await open.tap();await page.getByRole('button',{name:'Close workspace navigation backdrop',exact:true}).tap({position:{x:380,y:300}});await expect(dialog).toHaveCount(0)
  await open.tap();await page.getByRole('button',{name:'Close workspace navigation',exact:true}).tap();await expect(dialog).toHaveCount(0)
  expect(await primary!.evaluate(el=>el===document.querySelector('[aria-label="Main composition video"]'))).toBe(true)
  expect(await page.getByLabel('Main composition video').getAttribute('src')).toBe(src)
  await expect(page.getByLabel('Composition project title')).toHaveValue('Preserve my local edit');await expect(page.getByLabel('Text 1 x',{exact:true})).toHaveValue('0.3')
  expect(await page.evaluate(()=>document.body.style.overflow)).toBe('')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await open.tap();await dialog.getByRole('link',{name:'Video Cutter',exact:true}).tap();await expect(page).toHaveURL(/\/editor$/)
  await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'Open workspace navigation',exact:true})).toHaveAttribute('aria-expanded','false');await oneShell(page)
  await page.getByRole('button',{name:'Open workspace navigation',exact:true}).tap();await page.getByRole('dialog').getByRole('link',{name:'Dashboard',exact:true}).tap();await expect(page).toHaveURL(url=>url.pathname==='/login'&&url.searchParams.get('next')==='/dashboard')
  await expect(page.getByTestId('workspace-shell')).toHaveCount(0)
 }finally{await context.close();rmSync(dir,{recursive:true,force:true})}
})

test('opening the mobile drawer during FFmpeg loading keeps the worker alive and cancellation accessible after closing',async({browser})=>{
 const dir=fixtures(),context=await browser.newContext({hasTouch:true,isMobile:true,viewport:{width:390,height:844}}),page=await context.newPage()
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve})
 try{
  await context.route('**/core/ffmpeg-core.wasm',async route=>{await held;await route.continue().catch(()=>{})})
  await edit(page,dir)
  const downloading=page.waitForRequest(request=>request.url().endsWith('/core/ffmpeg-core.wasm'))
  await page.getByLabel('Approve local composition encoding').check();await page.getByRole('button',{name:'Export MP4',exact:true}).click();await downloading
  const workers=page.workers().length;expect(workers).toBeGreaterThan(0)
  await page.getByRole('button',{name:'Open workspace navigation',exact:true}).tap();await expect(page.getByRole('dialog')).toBeVisible()
  expect(page.workers().length).toBe(workers)
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button',{name:'Cancel composition export',exact:true})).toBeEnabled()
  await page.getByRole('button',{name:'Cancel composition export',exact:true}).tap();await expect(page.getByRole('heading',{name:'Cancelled',exact:true})).toBeVisible()
  await expect(page.getByLabel('Composition project title')).toHaveValue('Preserve my local edit');await expect(page.getByLabel('Text 1 x',{exact:true})).toHaveValue('0.3')
 }finally{release();await context.unrouteAll({behavior:'ignoreErrors'});await context.close();rmSync(dir,{recursive:true,force:true})}
})
