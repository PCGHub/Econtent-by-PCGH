import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
interface Packet { codec_type: string; pts_time: string; data_hash: string }
const packets = (path: string): Packet[] => JSON.parse(execFileSync('ffprobe', ['-v','error','-show_packets','-show_data_hash','sha256','-show_entries','packet=codec_type,pts_time,data_hash','-of','json',path], {encoding:'utf8',maxBuffer:16*1024*1024})).packets

/** Compare the same encoded packets: preroll can make first audio/video PTS differ without desynchronization. */
export function assertStreamCopySync(source: string, output: string): number {
  const matches = new Map<string, number[]>()
  for (const packet of packets(source)) {
    const key = `${packet.codec_type}:${packet.data_hash}`, value = Number(packet.pts_time)
    if (!Number.isFinite(value)) continue
    matches.set(key, [...(matches.get(key) ?? []), value])
  }
  const offsets: number[] = [], types = new Set<string>()
  for (const packet of packets(output)) {
    const timestamps = matches.get(`${packet.codec_type}:${packet.data_hash}`)
    if (timestamps?.length !== 1 || !Number.isFinite(Number(packet.pts_time))) continue
    offsets.push(Number(packet.pts_time) - timestamps[0]); types.add(packet.codec_type)
  }
  assert.ok(types.has('video') && types.has('audio'), 'Must match original packets in both streams')
  const spread = Math.max(...offsets) - Math.min(...offsets)
  assert.ok(spread < 0.003, `Copied audio/video timestamps must share one offset; drift=${spread}s`)
  return spread
}
