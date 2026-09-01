/**
 * Login por nome de usuário.
 *
 * O Supabase Auth só identifica conta por e-mail, mas na Casa Scaciotti o
 * login é um nome simples ("gustavo"). A ponte é este domínio interno: o que
 * o usuário digita vira `<usuario>@casascaciotti.local` antes de ir para o
 * Supabase.
 *
 * `.local` é um TLD reservado e nunca resolve na internet — de propósito.
 * Nenhum e-mail é enviado para esses endereços; eles existem só como
 * identificador interno.
 */

export const USERNAME_DOMAIN = 'casascaciotti.local'

/** `gustavo` -> `gustavo@casascaciotti.local`. Um e-mail completo passa direto. */
export function usernameToEmail(input: string): string {
  const value = input.trim().toLowerCase()
  if (!value) return ''
  if (value.includes('@')) return value
  return `${value}@${USERNAME_DOMAIN}`
}

/** Caminho inverso, para exibir o usuário na interface. */
export function emailToUsername(email: string | null | undefined): string {
  if (!email) return ''
  const [username, domain] = email.split('@')
  return domain === USERNAME_DOMAIN ? username : email
}
