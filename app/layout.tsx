import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import { ToastProvider } from '@/components/ui/toast'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })

export const metadata: Metadata = {
  title: 'Casa Scaciotti',
  description: 'Controle financeiro da Casa Scaciotti',
  // Adicionado à tela de início do celular, abre sem a barra do navegador.
  appleWebApp: { capable: true, title: 'Casa Scaciotti', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Sem isto, `env(safe-area-inset-*)` vale sempre zero — e a barra de
  // navegação inferior fica embaixo do indicador de home do iPhone, com os
  // ícones parcialmente inalcançáveis. O zoom fica liberado de propósito:
  // travá-lo quebra a acessibilidade de quem precisa aumentar a letra.
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fcfbf9' },
    { media: '(prefers-color-scheme: dark)', color: '#101319' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
