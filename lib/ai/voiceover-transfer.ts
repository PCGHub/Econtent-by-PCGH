const DB_NAME = "econtent-ai-transfer";
const STORE = "pending-audio";
const KEY = "voiceover";
function openDb():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB_NAME,1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
 });
}
export async function saveVoiceover(file:File):Promise<void>{
 const db=await openDb();
 try{await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction(STORE,"readwrite");
  tx.objectStore(STORE).put(file,KEY);
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
 });}finally{db.close();}
}
export async function consumeVoiceover():Promise<File|null>{
 const db=await openDb();
 try{return await new Promise<File|null>((resolve,reject)=>{
  const tx=db.transaction(STORE,"readwrite");
  const request=tx.objectStore(STORE).get(KEY);
  let result:File|null=null;
  request.onsuccess=()=>{result=request.result instanceof File?request.result:null;tx.objectStore(STORE).delete(KEY);};
  tx.oncomplete=()=>resolve(result);
  tx.onerror=()=>reject(tx.error);
 });}finally{db.close();}
}
