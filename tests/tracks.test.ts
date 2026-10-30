import {test} from 'node:test';import assert from 'node:assert/strict';
import {EMPTY_TRACKS,parseTracks,editClip} from '../lib/composition/tracks';
import {parseStudioDraft} from '../lib/composition/studio-draft';
test('timed tracks enforce identities, bounds, colors and music source ranges',()=>{
 const text={id:'textA',text:'Title',start:1,end:2,fontSize:32,color:'#ffffff',x:0,y:0,bold:true,italic:false};
 const music={id:'musicA',sourceId:'song',start:1,end:2,sourceStart:0,volume:.5,muted:false};const value={...EMPTY_TRACKS,text:[text],audio:[music]};assert.equal(parseTracks(value,4).text[0].text,'Title');
 for(const invalid of [{...value,text:[{...text,end:5}]},{...value,text:[{...text,color:'url(x)'}]},{...value,text:[text,text]},{...value,audio:[{...music,volume:2}]}])assert.throws(()=>parseTracks(invalid,4));
 assert.throws(()=>parseStudioDraft({settings:value,sources:[]},4));
 assert.deepEqual(editClip(music,'move',50,4),{...music,start:3,end:4});assert.equal(editClip(music,'start',.25,4).sourceStart,.25);
});
