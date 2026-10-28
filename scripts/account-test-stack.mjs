import {spawnSync} from 'node:child_process'
import {readFileSync,readdirSync} from 'node:fs'
const env={...process.env};for(const name of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[name]
const base=['--host','unix:///var/run/docker.sock'];const compose=['compose','-f','tests/database/compose.yml']
function docker(args,input){const result=spawnSync('docker',[...base,...args],{env,encoding:'utf8',input,stdio:input?['pipe','inherit','inherit']:'inherit'});if(result.status!==0)throw new Error('Local Econtent test stack command failed')}
if(process.argv[2]==='stop'){docker([...compose,'down','-v']);process.exit(0)}
docker([...compose,'up','-d'])
for(let attempt=0;attempt<60;attempt++){try{const response=await fetch('http://127.0.0.1:55325/health');if(response.ok)break}catch{}if(attempt===59)throw new Error('Local GoTrue failed to become ready');await new Promise(resolve=>setTimeout(resolve,1000))}
function sql(text){docker(['exec','-i','econtent-auth-tests-db-1','psql','-U','postgres','-v','ON_ERROR_STOP=1'],text)}
sql(readFileSync('tests/database/modern-claims.sql','utf8'))
// A fresh disposable database is required; never point this harness at hosted Supabase.
for(const file of readdirSync('supabase/migrations').filter(name=>name.endsWith('.sql')).sort())sql(readFileSync('supabase/migrations/'+file,'utf8'))
sql(readFileSync('tests/database/ownership.sql','utf8'))
sql("NOTIFY pgrst, 'reload schema'")
console.log('Local real Auth/PostgreSQL/Mailpit stack and ownership isolation checks ready.')
