import assert from 'node:assert/strict'
import test from 'node:test'
import {parseSubtitles, serializeSubtitles, validateSubtitleSegments} from '../lib/transcription/subtitles'

test('SRT uses numbered cues and comma milliseconds', () => {
  assert.equal(serializeSubtitles([{start:1.2,end:3.45,text:'Hello'}], 'srt'),
    '1\n00:00:01,200 --> 00:00:03,450\nHello\n')
})

test('VTT has a header and dot milliseconds', () => {
  assert.equal(serializeSubtitles([{start:0,end:2,text:'Hi'}], 'vtt'),
    'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHi\n')
})

test('TXT exports text in chronological order', () => {
  assert.equal(serializeSubtitles([
    {start:2,end:3,text:'Second'}, {start:0,end:1,text:'First'},
  ], 'txt'), 'First\nSecond')
})

test('invalid timing is rejected', () => {
  assert.throws(() => validateSubtitleSegments([{start:3,end:2,text:'Bad'}]))
  assert.throws(() => validateSubtitleSegments([{start:-1,end:2,text:'Bad'}]))
  assert.throws(() => validateSubtitleSegments([{start:NaN,end:2,text:'Bad'}]))
})

test('SRT round trip preserves text and millisecond timings', () => {
  const source = [{start:1.25,end:3.5,text:'Hello world'},{start:4,end:5.2,text:'Next line'}]
  assert.deepEqual(parseSubtitles(serializeSubtitles(source,'srt'),'srt'),source)
})

test('VTT round trip preserves cues', () => {
  const source = [{start:0,end:1.2,text:'Hello'}]
  assert.deepEqual(parseSubtitles(serializeSubtitles(source,'vtt'),'vtt'),source)
})

test('reject malformed subtitle timing and missing VTT header', () => {
  assert.throws(() => parseSubtitles('WEBVTT\n\n00:00:04.000 --> 00:00:02.000\nBad','vtt'))
  assert.throws(() => parseSubtitles('00:00:01.000 --> 00:00:02.000\nHello','vtt'))
})
