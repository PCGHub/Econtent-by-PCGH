import ts from 'typescript'
import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises'
import {resolve,basename,join} from 'node:path'
const [source,target]=process.argv.slice(2)
async function compile(input,output,video=false){
 await mkdir(output,{recursive:true})
 for(const name of await readdir(input)){
  if(!name.endsWith('.ts'))continue
  let code=ts.transpileModule(await readFile(join(input,name),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
  if(video)code=code.replaceAll('../composition/','./composition/')
  code=code.replace(/(from\s+['"])(\.\.?\/[^'"]+)(['"])/g,(_,a,b,c)=>a+b+(b.endsWith('.js')?'':'.js')+c)
  await writeFile(join(output,name.replace(/\.ts$/,'.js')),code)
 }
}
await compile(source,target,basename(source)==='video')
if(basename(source)==='video')await compile(resolve(source,'../composition'),join(target,'composition'))
