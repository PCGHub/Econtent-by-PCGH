import ts from 'typescript'
import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises'
const [source,target]=process.argv.slice(2)
await mkdir(target,{recursive:true})
for(const name of await readdir(source)){
 if(!name.endsWith('.ts'))continue
 const code=ts.transpileModule(await readFile(`${source}/${name}`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/(from\s+['"])(\.\/[^'"]+)(['"])/g,(_,a,b,c)=>a+b+'.js'+c)
 await writeFile(`${target}/${name.replace(/\.ts$/,'.js')}`,code)
}
