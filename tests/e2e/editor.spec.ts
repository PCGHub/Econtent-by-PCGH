import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) console.error('EDITOR FAILURE STATE:', await page.locator('body').innerText())
})

test('browser worker trims 30 seconds, compresses, previews and downloads real MP4', async ({ page }, info) => {
  page.on('pageerror', error => console.error('BROWSER ERROR:', error.message))
  const dir = mkdtempSync(join(tmpdir(), 'econtent-browser-'))
  try {
    const input = join(dir,'input.mp4')
    execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=320x180:rate=30','-f','lavfi','-i','sine=frequency=440','-t','35','-c:v','libx264','-g','300','-pix_fmt','yuv420p','-c:a','aac',input])
    await page.goto('/')
    await page.getByRole('button',{name:'Start editing free'}).click()
    await page.getByLabel('Choose video',{exact:true}).setInputFiles(input)
    await expect(page.getByText(/35.000 seconds/)).toBeVisible()
    await page.getByLabel('Start (seconds)',{exact:false}).fill('1.25')
    await page.getByLabel('End (seconds)',{exact:false}).fill('31.25')
    await page.getByLabel('Compression',{exact:true}).selectOption('balanced')
    await page.getByRole('button',{name:'Process video',exact:true}).click()
    await expect(page.getByText('MP4 exports ready.',{exact:false})).toBeVisible({timeout:150000})
    const preview = page.getByLabel('Preview econtent-001.mp4')
    await expect.poll(() => preview.evaluate((video: HTMLVideoElement) => video.duration)).toBeCloseTo(30,0)
    await preview.evaluate((video: HTMLVideoElement) => video.play())
    await expect.poll(() => preview.evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThan(0)
    const pending = page.waitForEvent('download')
    await page.getByRole('button',{name:'Download MP4',exact:true}).click()
    const download = await pending
    const output = info.outputPath('actual-output.mp4')
    await download.saveAs(output)
    const probe = JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',output],{encoding:'utf8'}))
    expect(Math.abs(Number(probe.format.duration)-30)).toBeLessThan(0.05)
    expect(probe.streams.map((stream:{codec_name:string}) => stream.codec_name)).toEqual(['h264','aac'])
    const zipPending=page.waitForEvent('download')
    await page.getByRole('button',{name:'Download all ZIP'}).click()
    const zip=await zipPending;const zipPath=info.outputPath('clips.zip');await zip.saveAs(zipPath)
    execFileSync('unzip',['-t',zipPath])
    await page.getByLabel('Mode',{exact:true}).selectOption('full-split')
    await page.getByLabel('Clip length (seconds)',{exact:false}).fill('10')
    await page.getByLabel('Compression',{exact:true}).selectOption('off')
    await page.getByRole('button',{name:'Process video',exact:true}).click()
    await expect(page.getByRole('button',{name:'Download MP4',exact:true})).toHaveCount(4,{timeout:150000})
    await expect(page.getByRole('button',{name:'Download all ZIP'})).toBeEnabled()
    const bundlePending=page.waitForEvent('download')
    await page.getByRole('button',{name:'Download all ZIP'}).click()
    const bundle=await bundlePending;const bundlePath=info.outputPath('split-clips.zip');await bundle.saveAs(bundlePath)
    const entries=execFileSync('unzip',['-Z1',bundlePath],{encoding:'utf8'}).trim().split('\n')
    expect(entries).toHaveLength(4)
    const extraction=info.outputPath('extracted')
    execFileSync('unzip',['-q',bundlePath,'-d',extraction])
    for (const [index,entry] of entries.entries()) {
      const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',join(extraction,entry)],{encoding:'utf8'}))
      expect(Math.abs(duration-(index===3?5:10))).toBeLessThan(0.05)
    }
    await page.getByRole('checkbox').nth(1).uncheck()
    const subsetPending=page.waitForEvent('download')
    await page.getByRole('button',{name:'Download selected ZIP (3)',exact:true}).click()
    const subset=await subsetPending;const subsetPath=info.outputPath('subset.zip');await subset.saveAs(subsetPath)
    expect(execFileSync('unzip',['-Z1',subsetPath],{encoding:'utf8'}).trim().split('\n')).toHaveLength(3)
    await page.getByRole('button',{name:'Process video',exact:true}).click()
    await page.getByRole('button',{name:'Cancel processing',exact:true}).click()
    await expect(page.getByText('cancelled',{exact:true})).toBeVisible()
    await expect(page.getByRole('button',{name:'Process video',exact:true})).toBeEnabled()


  } finally { rmSync(dir,{recursive:true,force:true}) }
})
