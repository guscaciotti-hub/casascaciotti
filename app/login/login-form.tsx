'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { usernameToEmail } from '@/lib/auth'
import { describeAnonKey } from '@/lib/supabase/env'

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') || '/'

  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    })

    if (signInError) {
      setError(translateAuthError(signInError.message))
      setPending(false)
      return
    }

    router.replace(next)
    router.refresh()
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Usuário</Label>
            <Input
              id="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="gustavo"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Entrar
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

/**
 * Traduz o erro do Supabase para algo acionável.
 *
 * "Invalid API key" quase sempre significa chave errada ou truncada na
 * variável de ambiente — não um problema de senha. A descrição da chave em uso
 * (formato e tamanho, nunca o valor) é o que permite comparar com o painel do
 * Supabase sem precisar abrir o console do navegador.
 */
function translateAuthError(message: string): string {
  if (message === 'Invalid login credentials') return 'Usuário ou senha incorretos.'

  if (/invalid api key/i.test(message)) {
    return `Chave do Supabase inválida. A que está configurada é: ${describeAnonKey()}. Confira NEXT_PUBLIC_SUPABASE_ANON_KEY no painel da Vercel.`
  }

  if (/failed to fetch|networkerror/i.test(message)) {
    return 'Não foi possível falar com o servidor. Confira NEXT_PUBLIC_SUPABASE_URL no painel da Vercel.'
  }

  return message
}
