import 'server-only'
import pdfParse from 'pdf-parse/lib/pdf-parse.js'

/**
 * Extrai o texto de um PDF de fatura. Sempre server-side — o `pdf-parse`
 * depende de APIs de Node e o arquivo nunca deve ser processado no browser.
 *
 * Importamos direto de `lib/pdf-parse.js` porque o `index.js` do pacote roda
 * um bloco de debug que tenta ler um PDF de teste do disco.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer)
  return result.text ?? ''
}
