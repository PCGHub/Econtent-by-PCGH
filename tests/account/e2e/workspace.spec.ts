import {createClient} from "@supabase/supabase-js";
import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
test.afterEach(async ({page},info)=>{if(info.status!==info.expectedStatus)console.error('ACCOUNT FAILURE:',await page.locator('body').innerText())})
const password = "Econtent-local-only-123!";
async function emailLink(email: string, after = 0) {
  let link = "";
  await expect
    .poll(
      async () => {
        const list = await (
          await fetch("http://localhost:55324/api/v1/messages")
        ).json();
        const message = list.messages?.find(
          (item: { To: { Address: string }[]; ID: string; Created: string }) =>
            item.To.some((to) => to.Address === email) &&
            new Date(item.Created).getTime() >= after,
        );
        if (!message) return false;
        const detail = await (
          await fetch("http://localhost:55324/api/v1/message/" + message.ID)
        ).json();
        link =
          String(detail.HTML)
            .match(
              /href="(http:\/\/localhost:55321\/auth\/v1\/verify[^\"]*)"/,
            )?.[1]
            ?.replaceAll("&amp;", "&") ?? "";
        return !!link;
      },
      { timeout: 20000 },
    )
    .toBe(true);
  return link;
}
async function register(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Local Creator");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Check your inbox");
  await page.goto(await emailLink(email));
  await expect(page).toHaveURL(/\/dashboard$/);
}
test("real email verification, sessions, recovery, project CRUD, autosave, reconnect and user isolation", async ({
  page,
  browser,
}) => {
  page.on("pageerror",error=>console.error("Account browser error:",error.message));
  page.on("response",response=>{if(new URL(response.url()).pathname.startsWith("/api/projects")&&response.status()>=400)void response.json().then(value=>console.error("Account API failure:",response.status(),value.error)).catch(()=>{})});
  const dir = mkdtempSync(join(tmpdir(), "econtent-account-"));
  const email = "creator-" + randomUUID() + "@example.test";
  const input = join(dir, "source.mp4");
  const wrong = join(dir, "wrong.mp4");
  let other: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  try {
    await page.goto("/projects");
    await expect(page).toHaveURL(/\/login\?next=/);
    const guest = await page.request.get("/api/projects");
    expect(guest.status()).toBe(401);
    await register(page, email);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Welcome back, Local Creator" }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Create new project", exact: true })
      .click();
    await page.getByLabel("Project title").fill("Saved integration footage");
    await page
      .getByRole("button", { name: "Create project", exact: true })
      .click();
    await expect(page).toHaveURL(/\/projects\/[a-f0-9-]+$/);
    const projectURL = page.url();
    const id = projectURL.split("/").pop()!;
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x180:rate=30",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440",
      "-t",
      "6",
      "-c:v",
      "libx264",
      "-g",
      "30",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      input,
    ]);
    writeFileSync(wrong, "wrong file");
    await page.getByLabel("Choose video", { exact: true }).setInputFiles(input);
    await expect(
      page.getByText("6.000 seconds", { exact: false }),
    ).toBeVisible();
    await page.getByLabel("Start (seconds)", { exact: false }).fill("1");
    await page.getByLabel("End (seconds)", { exact: false }).fill("4");
    await page
      .getByLabel("Compression", { exact: true })
      .selectOption("balanced");
    await expect(page.getByRole("status").first()).toContainText("Saved", {
      timeout: 10000,
    });
    await expect
      .poll(async () => {
        const response = await page.request.get("/api/projects/" + id);
        return (await response.json()).project.settings.range;
      })
      .toEqual({ start: 1, end: 4 });
    const saved = (await (await page.request.get("/api/projects/" + id)).json())
      .project;
    const stale = await page.request.patch("/api/projects/" + id, {
      data: { revision: saved.revision - 1, title: "stale" },
      headers: { Origin: "http://localhost:3000" },
    });
    expect(stale.status()).toBe(409);
    const csrf = await page.request.patch("/api/projects/" + id, {
      data: { revision: saved.revision, title: "csrf" },
      headers: { Origin: "https://unrelated.invalid" },
    });
    expect(csrf.status()).toBe(403);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Reconnect original video" }),
    ).toBeVisible();
    // Next can briefly retain an inert hidden page during hydration; operate on the live input.
    const reconnect=page.locator('input[aria-label="Reconnect video"]:visible');
    await expect(reconnect).toBeEnabled();
    await reconnect.setInputFiles(wrong);
    await expect(page.locator("main").getByRole("alert")).toContainText("File size differs");
    await expect(
      page.getByLabel("Start (seconds)", { exact: false }),
    ).toHaveCount(0);
    const mutated=readFileSync(input);mutated[100]^=1;const sameSize=join(dir,'different-same-size.mp4');writeFileSync(sameSize,mutated);
    await reconnect.setInputFiles(sameSize);
    await expect(page.locator('main').getByRole('alert')).toContainText('different video');
    await reconnect.setInputFiles(input);
    await expect(
      page.getByLabel("Start (seconds)", { exact: false }),
    ).toHaveValue("1");
    await expect(
      page.getByLabel("End (seconds)", { exact: false }),
    ).toHaveValue("4");
    await expect(page.getByLabel("Compression", { exact: true })).toHaveValue(
      "balanced",
    );
    await page
      .getByRole("button", { name: "Process video", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Completed", exact: true }),
    ).toBeVisible();
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download MP4", exact: true })
      .click();
    await (await download).saveAs(join(dir, "saved-project-output.mp4"));
    const probe = JSON.parse(
      execFileSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_format",
          "-show_streams",
          "-of",
          "json",
          join(dir, "saved-project-output.mp4"),
        ],
        { encoding: "utf8" },
      ),
    );
    expect(Number(probe.format.duration)).toBeGreaterThan(2.9);
    expect(Number(probe.format.duration)).toBeLessThan(3.2);
    expect(
      probe.streams.some(
        (s: { codec_type: string }) => s.codec_type === "audio",
      ),
    ).toBe(true);
    // Defaults must not overwrite an explicitly saved Precision/Off choice on resume.
    await page.getByLabel('Compression',{exact:true}).selectOption('off');
    await expect(page.getByLabel('Cut method',{exact:true})).toHaveValue('fast');
    await page.getByLabel('Cut method',{exact:true}).selectOption('precision');
    await expect.poll(async()=>{const result=await (await page.request.get('/api/projects/'+id)).json();return {compression:result.project.settings.compression,method:result.project.settings.cutStrategy}}).toEqual({compression:'off',method:'precision'});
    await expect(page.getByRole('status').first()).toContainText('Saved');
    await page.reload();
    const resumed=page.locator('input[aria-label="Reconnect video"]:visible');await expect(resumed).toBeEnabled();await resumed.setInputFiles(input);
    await expect(page.locator('select[aria-label="Compression"]:visible')).toHaveValue('off');
    await expect(page.locator('select[aria-label="Cut method"]:visible')).toHaveValue('precision');
    await expect(page.locator('p:visible').filter({hasText:'This saved project restored Precision Cut.'})).toBeVisible();
    // Another real verified account cannot read, mutate, duplicate or delete the first user's project.
    other = await browser.newContext();
    const otherPage = await other.newPage();
    const otherEmail="other-"+randomUUID()+"@example.test";
    await register(otherPage,otherEmail);
    for (const method of ["get", "patch", "delete"] as const) {
      const response = await otherPage.request[method]("/api/projects/" + id, {
        data: { revision: saved.revision, title: "not mine" },
        headers: { Origin: "http://localhost:3000" },
      });
      expect(response.status()).toBe(404);
    }
    const duplicateForbidden = await otherPage.request.post(
      "/api/projects/" + id + "/duplicate",
      { data: {}, headers: { Origin: "http://localhost:3000" } },
    );
    expect(duplicateForbidden.status()).toBe(404);
    const localEnv=readFileSync('.env.local','utf8');
    expect(localEnv).toContain('NEXT_PUBLIC_SUPABASE_URL=http://localhost:55321');
    const anon=localEnv.match(/^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.+)$/m)![1];
    const firstClient=createClient('http://localhost:55321',anon,{auth:{persistSession:false,autoRefreshToken:false}});
    const secondClient=createClient('http://localhost:55321',anon,{auth:{persistSession:false,autoRefreshToken:false}});
    const ownerLogin=await firstClient.auth.signInWithPassword({email,password});expect(ownerLogin.error).toBeNull();
    const secondLogin=await secondClient.auth.signInWithPassword({email:otherEmail,password});expect(secondLogin.error).toBeNull();
    const own=await firstClient.from('projects').select('id,owner_id').eq('id',id).single();expect(own.error).toBeNull();expect(own.data!.id).toBe(id);
    const foreignRead=await secondClient.from('projects').select('id').eq('id',id);expect(foreignRead.error).toBeNull();expect(foreignRead.data).toEqual([]);
    const foreignUpdate=await secondClient.from('projects').update({title:'RLS bypass attempt'}).eq('id',id).select('id');expect(foreignUpdate.error).toBeNull();expect(foreignUpdate.data).toEqual([]);
    const foreignDelete=await secondClient.from('projects').delete().eq('id',id).select('id');expect(foreignDelete.error).toBeNull();expect(foreignDelete.data).toEqual([]);
    const ownerMutation=await firstClient.from('projects').update({owner_id:secondLogin.data.user!.id}).eq('id',id);expect(ownerMutation.error).not.toBeNull();
    const ownerSpoof=await secondClient.from('projects').insert({title:'Spoofed owner',owner_id:own.data!.owner_id});expect(ownerSpoof.error).not.toBeNull();
    const otherList = await otherPage.request.get("/api/projects");
    expect((await otherList.json()).projects).toHaveLength(0);
    await otherPage.goto(projectURL);
    await expect(
      otherPage.getByText("This page could not be found."),
    ).toBeVisible();
    await page.getByRole("link", { name: "My projects", exact: true }).click();
    await page.getByRole("button", { name: "Rename", exact: true }).click();
    await page.getByLabel("New project title").fill("Renamed footage");
    await page
      .getByRole("button", { name: "Rename project", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Renamed footage" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Duplicate", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Renamed footage (copy)",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByLabel("Search projects").fill("(copy)");
    await expect(page.locator("article")).toHaveCount(1);
    await page.getByLabel("Sort projects").selectOption("name");
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.locator("article")).toHaveCount(1);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("button", { name: "Confirm delete" }).click();
    await expect(
      page.getByRole("heading", { name: "No projects found" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/forgot-password");
    const after = Date.now() - 1000;
    await page.getByLabel("Email address").fill(email);
    await page.getByRole("button", { name: "Send recovery link" }).click();
    await expect(page.getByRole("status")).toContainText(
      "If an account exists",
    );
    await page.goto(await emailLink(email, after));
    await expect(page).toHaveURL(/\/reset-password$/);
    await page
      .getByLabel("New password", { exact: true })
      .fill(password + "changed");
    await page.getByLabel("Confirm password").fill(password + "changed");
    await page
      .getByRole("button", { name: "Reset password", exact: true })
      .click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.getByLabel("Email address").fill(email);
    await page
      .getByLabel("Password", { exact: true })
      .fill(password + "changed");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  } finally {
    await other?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('browser renews an expiring session and protected pages remain accessible',async({page})=>{
 const refreshed=page.waitForResponse(response=>{const url=new URL(response.url());return url.pathname==='/auth/v1/token'&&url.searchParams.get('grant_type')==='refresh_token'&&response.status()===200},{timeout:95000});
 await register(page,'refresh-'+randomUUID()+'@example.test');
 await refreshed;
 await page.reload();await expect(page.getByRole('heading',{name:'Welcome back, Local Creator'})).toBeVisible();
});

test('overlay cloud drafts autosave, duplicate, reconnect exact local media and remain owner-only',async({page,browser})=>{
 const dir=mkdtempSync(join(tmpdir(),'econtent-overlay-account-'));let other:Awaited<ReturnType<typeof browser.newContext>>|undefined;
 try{
  const input=join(dir,'main.mp4'),photo=join(dir,'photo.png'),wrong=join(dir,'wrong.mp4');
  for(const [path,color]of [[input,'red'],[wrong,'blue']])execFileSync('ffmpeg',['-v','error','-f','lavfi','-i',`color=${color}:size=320x180:rate=24`,'-t','4','-c:v','libx264',path]);
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=blue:size=160x160','-frames:v','1',photo]);
  await register(page,'overlay-'+randomUUID()+'@example.test');await page.goto('/overlay-studio');await page.getByLabel('Composition project title').fill('Saved overlay draft');
  await page.getByLabel('Upload main video',{exact:true}).setInputFiles(input);await page.getByLabel('Upload photo',{exact:true}).setInputFiles(photo);await page.getByLabel('Main trim start',{exact:true}).fill('0.5');await page.getByLabel('Main trim end',{exact:true}).fill('2.5');await page.getByLabel('Layer ends at / image duration end',{exact:true}).fill('2');await page.getByLabel('Composition layout',{exact:true}).selectOption('pip');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByText('Saved settings · source files remain local',{exact:true})).toBeVisible();
  const url=await page.getByRole('link',{name:'Open saved project',exact:true}).getAttribute('href');expect(url).toMatch(/^\/projects\/[a-f0-9-]+$/);const id=url!.split('/').at(-1)!;
  await page.getByLabel('Layer opacity',{exact:true}).fill('0.5');
  await expect.poll(async()=>((await(await page.request.get('/api/projects/'+id)).json()).project.composition.settings.opacity)).toBe(.5);
  const duplicate=await page.request.post('/api/projects/'+id+'/duplicate',{headers:{origin:'http://localhost:3000'}});expect(duplicate.status()).toBe(201);const copy=(await duplicate.json()).project;expect(copy.composition.settings.layout).toBe('pip');const renamed=await page.request.patch('/api/projects/'+copy.id,{headers:{origin:'http://localhost:3000'},data:{revision:copy.revision,title:'Renamed overlay'}});expect(renamed.status()).toBe(200);expect((await renamed.json()).project.composition.settings.layout).toBe('pip');
  await page.goto(url!);await expect(page.getByText(/Reconnect both original local files/)).toBeVisible();await expect(page.getByLabel('Main composition video')).toHaveCount(0);await expect(page.getByLabel('Composition layout')).toHaveValue('pip');await expect(page.getByLabel('Main trim start')).toHaveValue('0.5');
  await page.getByLabel('Upload main video',{exact:true}).setInputFiles(wrong);await expect(page.locator('p[role="alert"]')).toContainText('different original');await expect(page.getByLabel('Main composition video')).toHaveCount(0);
  await page.getByLabel('Upload main video',{exact:true}).setInputFiles(input);await page.getByLabel('Upload photo',{exact:true}).setInputFiles(photo);await expect(page.getByLabel('Main composition video')).toBeVisible();await expect(page.getByLabel('Layer opacity')).toHaveValue('0.5');
  await page.getByLabel('Approve local composition encoding').check();await page.getByRole('button',{name:'Export MP4',exact:true}).click();await expect(page.getByRole('heading',{name:'Completed',exact:true})).toBeVisible({timeout:60000});
  other=await browser.newContext();const otherPage=await other.newPage();const otherEmail='overlay-other-'+randomUUID()+'@example.test';await register(otherPage,otherEmail);expect((await otherPage.request.get('/api/projects/'+id)).status()).toBe(404);expect((await otherPage.request.delete('/api/projects/'+id,{headers:{origin:'http://localhost:3000'}})).status()).toBe(404);
  const config=readFileSync('.env.local','utf8'),key=config.match(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.+)/)![1];
  const outsider=createClient('http://localhost:55321',key,{auth:{persistSession:false,autoRefreshToken:false}});expect((await outsider.auth.signInWithPassword({email:otherEmail,password})).error).toBeNull();const privateRead=await outsider.from('projects').select('composition').eq('id',id);expect(privateRead.error).toBeNull();expect(privateRead.data).toEqual([]);const update=await outsider.from('projects').update({composition:null}).eq('id',id).select('id');expect(update.data).toEqual([]);await outsider.auth.signOut();
 }finally{await other?.close();rmSync(dir,{recursive:true,force:true});}
});

test('phase 2 drafts restore timed text/music and verify every reattached audio file',async({page})=>{
 const dir=mkdtempSync(join(tmpdir(),'econtent-phase2-account-'));
 try{
  const run=(args:string[])=>execFileSync('ffmpeg',['-v','error','-y',...args],{cwd:dir});
  run(['-f','lavfi','-i','color=black:size=160x90:rate=24','-t','4','-c:v','libx264','main.mp4']);run(['-f','lavfi','-i','color=black:size=160x90','-frames:v','1','photo.png']);for(const [name,freq]of [['music.wav',880],['wrong.wav',440]] as const)run(['-f','lavfi','-i',`sine=frequency=${freq}:sample_rate=48000`,'-t','3',name]);
  await register(page,'tracks-'+randomUUID()+'@example.test');await page.goto('/overlay-studio');await page.getByLabel('Upload main video',{exact:true}).setInputFiles(join(dir,'main.mp4'));await expect(page.getByLabel('Main composition video')).toBeVisible();await page.getByLabel('Upload photo',{exact:true}).setInputFiles(join(dir,'photo.png'));
  await page.getByRole('button',{name:'Add text clip',exact:true}).click();await page.getByLabel('Text 1 content',{exact:true}).fill('Saved title');await page.getByLabel('Text 1 start',{exact:true}).fill('1');await page.getByLabel('Text 1 color',{exact:true}).fill('#00ff00');
  await page.getByLabel('Import music or narration',{exact:true}).setInputFiles(join(dir,'music.wav'));await expect(page.getByLabel('Music 1 start',{exact:true})).toBeVisible();await page.getByLabel('Music 1 start',{exact:true}).fill('1');await page.getByLabel('Music 1 end',{exact:true}).fill('2');await page.getByLabel('Mute original video audio').check();
  await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByText('Saved settings · source files remain local',{exact:true})).toBeVisible();const url=await page.getByRole('link',{name:'Open saved project',exact:true}).getAttribute('href');const id=url!.split('/').at(-1)!;
  await page.getByLabel('Text 1 x',{exact:true}).fill('0.4');await page.getByLabel('Text 1 y',{exact:true}).fill('0.6');await page.getByLabel('Text 1 rotation',{exact:true}).fill('10');await page.getByLabel('Text 1 outline',{exact:true}).fill('2');await page.getByLabel('Text 1 shadow',{exact:true}).check();await page.getByLabel('Text 1 alignment',{exact:true}).selectOption('right');
  await page.getByLabel('Timeline position',{exact:true}).fill('1.5');const directText=page.locator('[data-testid^="Text layer "]');await directText.scrollIntoViewIfNeeded();const textBox=await directText.boundingBox();await page.mouse.move(textBox!.x+textBox!.width/2,textBox!.y+textBox!.height/2);await page.mouse.down();await page.mouse.move(textBox!.x+textBox!.width/2+20,textBox!.y+textBox!.height/2+15,{steps:4});await page.mouse.up();const savedX=Number(await page.getByLabel('Text 1 x',{exact:true}).inputValue()),savedY=Number(await page.getByLabel('Text 1 y',{exact:true}).inputValue());expect(savedX).toBeGreaterThan(.4);
  await page.getByLabel('Text 1 fontSize',{exact:true}).fill('40');await expect.poll(async()=>((await(await page.request.get('/api/projects/'+id)).json()).project.studioTracks.settings.text[0].fontSize)).toBe(40);
  const savedStyle=(await(await page.request.get('/api/projects/'+id)).json()).project.studioTracks.settings.text[0];expect(savedStyle).toMatchObject({x:savedX,y:savedY,rotation:10,outline:2,shadow:true,align:'right'});
  const dup=await page.request.post('/api/projects/'+id+'/duplicate',{headers:{origin:'http://localhost:3000'}});expect(dup.status()).toBe(201);expect((await dup.json()).project.studioTracks.settings.text[0].text).toBe('Saved title');
  await page.goto(url!);await expect(page.getByLabel('Text 1 content',{exact:true})).toHaveValue('Saved title');await expect(page.getByLabel('Text 1 fontSize',{exact:true})).toHaveValue('40');await expect(page.getByLabel('Text 1 rotation',{exact:true})).toHaveValue('10');expect(Number(await page.getByLabel('Text 1 x',{exact:true}).inputValue())).toBeCloseTo(savedX,6);await expect(page.getByLabel('Text 1 shadow',{exact:true})).toBeChecked();await expect(page.getByLabel('Mute original video audio')).toBeChecked();
  await page.getByLabel('Upload main video',{exact:true}).setInputFiles(join(dir,'main.mp4'));await expect(page.getByLabel('Main composition video')).toBeVisible();await page.getByLabel('Upload photo',{exact:true}).setInputFiles(join(dir,'photo.png'));
  await page.getByLabel('Reconnect music music.wav',{exact:true}).setInputFiles(join(dir,'wrong.wav'));await expect(page.locator('p[role="alert"]').filter({hasText:'different music file'})).toBeVisible();await page.getByLabel('Reconnect music music.wav',{exact:true}).setInputFiles(join(dir,'music.wav'));await expect(page.getByLabel('Reconnect music music.wav',{exact:true})).toHaveCount(0);
  await page.getByLabel('Approve local composition encoding').check();await page.getByRole('button',{name:'Render Preview',exact:true}).click();await expect(page.getByRole('heading',{name:'Completed',exact:true})).toBeVisible({timeout:60000});
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('shared shell keeps protected sidebar navigation, saved project URLs and mobile account navigation working',async({page})=>{
 await register(page,'shell-'+randomUUID()+'@example.test');
 const nav=()=>page.getByRole('navigation',{name:'Workspace navigation',exact:true});
 for(const [name,path,heading] of [['My projects','/projects','My projects'],['Settings','/settings','Settings'],['Dashboard','/dashboard','Welcome back, Local Creator'],['Overlay Studio','/overlay-studio','Video Overlay Studio']] as const){
  await nav().getByRole('link',{name,exact:true}).click();await expect(page).toHaveURL(new RegExp(path+'$'));await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();await expect(nav().getByRole('link',{name,exact:true})).toHaveAttribute('aria-current','page');
  await expect(page.locator('[data-testid="workspace-shell"]:visible')).toHaveCount(1);await expect(page.locator('main main')).toHaveCount(0);
 }
 await nav().getByRole('link',{name:'Dashboard',exact:true}).click();await page.getByRole('link',{name:'Create new project',exact:true}).click();await expect(page).toHaveURL(/\/projects\/new$/);
 await page.getByLabel('Project title').fill('Shell saved project');await page.getByRole('button',{name:'Create project',exact:true}).click();await expect(page).toHaveURL(/\/projects\/[a-f0-9-]+$/);const savedURL=page.url();
 await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();await page.setViewportSize({width:390,height:844});
 const opener=page.getByRole('button',{name:'Open workspace navigation',exact:true});await opener.click();await page.getByRole('dialog').getByRole('link',{name:'Settings',exact:true}).click();await expect(page.getByRole('heading',{name:'Settings',exact:true})).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'Open workspace navigation',exact:true}).click();await page.getByRole('dialog').getByRole('link',{name:'My projects',exact:true}).click();await page.getByRole('link',{name:'Continue',exact:true}).click();await expect(page).toHaveURL(savedURL);await expect(page.getByLabel('Project title')).toHaveValue('Shell saved project');
 await page.getByRole('button',{name:'Open workspace navigation',exact:true}).click();await page.getByRole('dialog').getByRole('link',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page).toHaveURL(/\/login$/);
 await page.goto('/settings');await expect(page).toHaveURL(/\/login\?next=/);await expect(page.getByTestId('workspace-shell')).toHaveCount(0);
});
