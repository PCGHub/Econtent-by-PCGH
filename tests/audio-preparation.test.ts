import assert from 'node:assert/strict'
import test from 'node:test'
import { toMono16k } from '../lib/transcription/audio-preparation'

test('keeps 16 kHz mono samples unchanged', () => {
  const samples = new Float32Array([0, 0.5, -0.5, 1])
  assert.deepEqual([...toMono16k([samples], 16000)], [...samples])
})

test('downmixes stereo to mono', () => {
  const left = new Float32Array([1, 0])
  const right = new Float32Array([-1, 0.5])
  assert.deepEqual([...toMono16k([left, right], 16000)], [0, 0.25])
})

test('resamples 32 kHz samples to 16 kHz', () => {
  const input = new Float32Array([0, 0.25, 0.5, 0.75, 1, 0.75, 0.5, 0.25])
  assert.deepEqual([...toMono16k([input], 32000)], [0, 0.5, 1, 0.5])
})

test('rejects invalid audio channels', () => {
  assert.throws(() => toMono16k([], 16000), /Invalid audio/)
  assert.throws(() => toMono16k([new Float32Array([1]), new Float32Array([1, 2])], 16000), /inconsistent/)
})
