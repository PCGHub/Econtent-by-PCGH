import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {source:'/ffmpeg/releases/:release/:path*', headers:[{key:'Cache-Control',value:'public, max-age=31536000, immutable'}]},
      {source:'/ffmpeg/releases/:release/core/ffmpeg-core.wasm', headers:[
        {key:'Content-Type',value:'application/wasm'}, {key:'Content-Encoding',value:'br'},
      ]},
    ]
  },
}
export default nextConfig
