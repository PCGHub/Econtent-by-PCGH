import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
test('multitrack guest edits stay available and cloud Save requests sign-in honestly',async({page})=>{
 const dir=mkdtempSync(join(tmpdir(),'econtent-preview-')),file=join(dir,'preview.mp4');
 try{
 execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=160x90:rate=12','-t','4','-c:v','libx264','-pix_fmt','yuv420p',file]);
 await page.goto('/video-editor');await page.locator('input[type=file]').first().setInputFiles(file);
 await expect(page.getByLabel('Speed for preview.mp4')).toBeVisible();await page.getByLabel('Speed for preview.mp4').selectOption('0.5');
 await page.getByRole('button',{name:'Save project and source files',exact:true}).click();
 await expect(page.getByText('Sign in to save your timeline and source files.',{exact:true})).toBeVisible();
 await expect(page.getByLabel('Speed for preview.mp4')).toHaveValue('0.5');
 await page.setViewportSize({width:390,height:844});await expect(page.getByRole('button',{name:'Save project and source files',exact:true})).toBeVisible();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
