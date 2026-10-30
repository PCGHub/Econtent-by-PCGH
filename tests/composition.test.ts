import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_COMPOSITION,geometry,parseComposition} from '../lib/composition/model';
import {compositionArgs} from '../lib/composition/command';
const c={...DEFAULT_COMPOSITION,trimStart:2,trimEnd:6,overlayStart:1,overlayEnd:3};
test('composition validates bounded fields, rectangles and time ranges',()=>{
 assert.deepEqual(parseComposition(c),c);
 for(const change of [{x:1},{opacity:NaN},{trimEnd:1},{overlayEnd:5},{version:2},{url:'https://example.com'}])assert.throws(()=>parseComposition({...c,...change}));
 for(const ratio of ['9:16','16:9','1:1','4:5'] as const){const g=geometry({...c,ratio,layout:'pip'});assert.ok(g.overlay.x+g.overlay.w<=g.w);assert.ok(g.overlay.y+g.overlay.h<=g.h);assert.equal(g.w%2,0);assert.equal(g.h%2,0);}
});
test('composition seeks both inputs before decoding and always explicitly encodes H264/AAC',()=>{
 const info={duration:100,hasAudio:true,timelineStart:0};const args=compositionArgs(c,info,info,false);assert.ok(args.indexOf('-ss')<args.indexOf('-i'));assert.equal(args.filter(x=>x==='-ss').length,2);assert.ok(args.includes('libx264'));assert.ok(!args.includes('copy'));assert.ok(args.includes('aac'));assert.ok(args[args.indexOf('-filter_complex')+1].includes("lt(t,3)"));
 assert.throws(()=>compositionArgs(c,info,{...info,duration:1},false));
 assert.throws(()=>compositionArgs({...c,audio:'secondary'},info,undefined,true));
 const silent=compositionArgs({...c,audio:'none'},info,info,false);assert.ok(silent.includes('-an'));assert.ok(!silent.includes('aac'));
});
