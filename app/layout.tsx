import type { Metadata, Viewport } from 'next'
import './globals.css'
import {AccountProvider} from '@/components/account/provider'

export const metadata: Metadata = {
  title: 'Econtent by PCGH — Cut. Create. Transform.',
  description: 'A focused, free video cutting and compression workspace for creators.',
}

export const viewport: Viewport = { themeColor: '#f8fafc', width: 'device-width', initialScale: 1, userScalable: false }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><AccountProvider>{children}</AccountProvider></body></html>
}
