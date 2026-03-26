import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SDR Explorer - Software Defined Radio',
  description: 'Explore radio frequencies with spectrum waterfall visualization',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
