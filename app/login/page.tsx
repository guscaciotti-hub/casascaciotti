import { Suspense } from 'react'
import { LoginForm } from '@/app/login/login-form'
import { Skeleton } from '@/components/ui/skeleton'

export const metadata = { title: 'Entrar · Casa Scaciotti' }

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Casa Scaciotti</h1>
          <p className="mt-2 text-sm text-muted-foreground">Controle financeiro da casa</p>
        </div>

        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  )
}
