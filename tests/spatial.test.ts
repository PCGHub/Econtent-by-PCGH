import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_COMPOSITION} from '../lib/composition/model';
import {EMPTY_TRACKS} from '../lib/composition/tracks';
import {restoreSpatial} from '../lib/composition/spatial';
test('layout undo restores normalized geometry and styles without undoing timestamps, content or audio',()=>{
 const text={id:'A',text:'Before',start:0,end:1,fontSize:32,color:'#ffffff',x:.2,y:.3,bold:true,italic:false};
 const before={...DEFAULT_COMPOSITION,trimEnd:4,overlayEnd:4,tracks:{...EMPTY_TRACKS,text:[text]}};
 const after={...before,x:.3,width:.4,tracks:{...before.tracks,muteMain:true,text:[{...text,text:'Changed',start:1,end:3,x:.8,fontSize:45,rotation:25}]}};
 const positioned={...before,tracks:{...before.tracks,text:[{...text,x:.8,fontSize:45}]}};assert.equal(JSON.stringify(restoreSpatial(positioned,before)),JSON.stringify(before),'Undo must preserve render signatures and allow valid MP4 reuse');
 const undone=restoreSpatial(after,before);assert.equal(undone.x,before.x);assert.equal(undone.tracks!.text[0].x,.2);assert.equal(undone.tracks!.text[0].fontSize,32);assert.equal(undone.tracks!.text[0].rotation,undefined);assert.equal(undone.tracks!.text[0].text,'Changed');assert.equal(undone.tracks!.text[0].start,1);assert.equal(undone.tracks!.muteMain,true);
 assert.equal(restoreSpatial({...after,tracks:{...after.tracks,text:[]}},before).tracks!.text.length,0);
});
