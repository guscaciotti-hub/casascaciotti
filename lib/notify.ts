import 'server-only'

import { createClient } from '@/lib/supabase/server'

/**
 * Aviso por e-mail de recado novo.
 *
 * A casa não vive dentro do sistema o dia inteiro. Um recado que só existe
 * atrás de um login espera até alguém lembrar de entrar — e "me manda a
 * fatura" não pode esperar isso. O e-mail é o que traz a pessoa de volta.
 *
 * Nada aqui pode derrubar o envio da mensagem: o recado já está gravado
 * quando esta função roda, e servidor de e-mail fora do ar não é motivo para
 * a pessoa achar que não conseguiu falar com a outra. Toda falha é engolida e
 * registrada no log.
 *
 * Dois transportes, o que estiver configurado:
 *
 *   SMTP_URL       smtps://usuario%40gmail.com:senha-de-app@smtp.gmail.com:465
 *   RESEND_API_KEY re_...  (com MAIL_FROM num domínio verificado)
 *
 * Sem nenhum dos dois, o aviso é silenciosamente pulado — o sistema continua
 * funcionando inteiro, só sem e-mail.
 */

export interface NotificationTarget {
  username: string
  email: string
  /** Como esta pessoa chama quem mandou a mensagem. */
  nickname: string
}

/** Quem deve ser avisado de um recado, tirando quem escreveu. */
export async function notificationTargets(
  authorUsername: string,
): Promise<NotificationTarget[]> {
  const supabase = createClient()

  const { data } = await supabase
    .from('notification_prefs')
    .select('username, nickname, email, email_enabled')
    .eq('email_enabled', true)
    .not('email', 'is', null)
    .neq('username', authorUsername)

  return (data ?? []).map((row) => ({
    username: row.username as string,
    email: row.email as string,
    nickname: (row.nickname as string | null) ?? authorUsername,
  }))
}

/**
 * Avisa quem precisa saber que chegou recado.
 *
 * O assunto é o que aparece na notificação do celular, então ele já diz tudo:
 * quem mandou e sobre o quê. Abrir o e-mail é opcional.
 */
export async function notifyNewMessage(input: {
  authorUsername: string
  body: string
  isRequest: boolean
  attachmentCount: number
}): Promise<void> {
  try {
    const targets = await notificationTargets(input.authorUsername)
    if (targets.length === 0) return

    await Promise.all(
      targets.map((target) =>
        sendEmail({
          to: target.email,
          subject: `${target.nickname} ${
            input.isRequest ? 'te pediu uma coisa' : 'mandou msg'
          } sobre as contas`,
          text: plainBody(input),
        }).catch((error) => {
          console.error('[notify] falha ao avisar', target.username, error)
        }),
      ),
    )
  } catch (error) {
    // Aviso é acessório. O recado já está gravado.
    console.error('[notify] falha ao montar os avisos', error)
  }
}

function plainBody(input: { body: string; isRequest: boolean; attachmentCount: number }): string {
  const lines = [input.body]

  if (input.attachmentCount > 0) {
    lines.push(
      '',
      input.attachmentCount === 1
        ? '(1 anexo)'
        : `(${input.attachmentCount} anexos)`,
    )
  }

  if (input.isRequest) lines.push('', 'Isso é um pedido — fica em aberto até ser marcado como feito.')

  const url = appUrl()
  if (url) lines.push('', `Responder: ${url}/recados`)

  return lines.join('\n')
}

/** Endereço público do sistema, para o link do e-mail. */
function appUrl(): string | null {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  return vercel ? `https://${vercel}` : null
}

// ---------------------------------------------------------------------------
// Transportes
// ---------------------------------------------------------------------------

async function sendEmail(message: { to: string; subject: string; text: string }): Promise<void> {
  const smtpUrl = process.env.SMTP_URL?.trim()
  const resendKey = process.env.RESEND_API_KEY?.trim()

  if (smtpUrl) return sendViaSmtp(smtpUrl, message)
  if (resendKey) return sendViaResend(resendKey, message)

  // Sem transporte configurado não é erro: o sistema roda inteiro sem e-mail.
  console.warn('[notify] nenhum transporte de e-mail configurado; aviso pulado')
}

async function sendViaSmtp(
  smtpUrl: string,
  message: { to: string; subject: string; text: string },
): Promise<void> {
  // Import tardio: quem não configurou SMTP não carrega o nodemailer.
  const nodemailer = (await import('nodemailer')).default
  const transport = nodemailer.createTransport(smtpUrl)

  await transport.sendMail({
    from: mailFrom(smtpUrl),
    to: message.to,
    subject: message.subject,
    text: message.text,
  })
}

async function sendViaResend(
  apiKey: string,
  message: { to: string; subject: string; text: string },
): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM?.trim() || 'Casa Scaciotti <onboarding@resend.dev>',
      to: [message.to],
      subject: message.subject,
      text: message.text,
    }),
  })

  if (!response.ok) {
    throw new Error(`Resend respondeu ${response.status}: ${await response.text()}`)
  }
}

/**
 * Remetente. Sem `MAIL_FROM`, usa o próprio usuário do SMTP — o Gmail rejeita
 * remetente que não seja a conta autenticada, então esse é o padrão que
 * funciona sem configuração extra.
 */
function mailFrom(smtpUrl: string): string {
  const explicit = process.env.MAIL_FROM?.trim()
  if (explicit) return explicit

  try {
    const user = decodeURIComponent(new URL(smtpUrl).username)
    return user ? `Casa Scaciotti <${user}>` : 'Casa Scaciotti'
  } catch {
    return 'Casa Scaciotti'
  }
}
