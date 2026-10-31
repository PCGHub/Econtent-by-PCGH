import assert from 'node:assert/strict'
import test from 'node:test'
import {serializeSubtitles, validateSubtitleSegments} from '../lib/transcription/subtitles'

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
