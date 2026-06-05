import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { Nav } from '@/components/nav'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'LeanLog',
  description: 'Body composition tracker',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'LeanLog',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={geist.className} style={{ colorScheme: 'dark' }}>
      <body className="bg-neutral-950 text-neutral-100 min-h-screen antialiased">
        <Nav />
        {/* lg:ml-56 offsets the desktop sidebar; pb-20 clears the mobile bottom bar */}
        <main className="lg:ml-56 pb-20 lg:pb-0 min-h-screen">
          {children}
        </main>
      </body>
    </html>
  )
}
