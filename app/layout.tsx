import type { Metadata, Viewport } from 'next'
import './globals.css'
import {AccountProvider} from '@/components/account/provider'

export const metadata: Metadata = {
  title: 'Econtent by PCGH — Cut. Create. Transform.',
  description: 'A creative workspace for video editing, cutting, overlays, cinematic titles and transcription.',
  icons: { icon: [{ url: '/pcgh-logo.webp', type: 'image/webp' }], shortcut: '/pcgh-logo.webp', apple: '/pcgh-logo.webp' },
}

export const viewport: Viewport = { themeColor: '#f8fafc', width: 'device-width', initialScale: 1, userScalable: false }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><AccountProvider>{children}</AccountProvider></body></html>
}
