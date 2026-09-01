'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Loader2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { SOURCE_OPTIONS } from '@/lib/parsers'
import { addMonths, formatMonthLabel, toReferenceMonth } from '@/lib/format'
import { cn } from '@/lib/utils'

const MAX_FILE_BYTES = 15 * 1024 * 1024

/** Últimos 18 meses + 1 à frente, para escolher a referência da fatura. */
function monthOptions(): string[] {
  const current = toReferenceMonth()
  return Array.from({ length: 20 }, (_, index) => addMonths(current, 1 - index))
}

export function UploadForm() {
  const router = useRouter()
  const { toast } = useToast()

  const [file, setFile] = React.useState<File | null>(null)
  const [source, setSource] = React.useState('nubank')
  const [referenceMonth, setReferenceMonth] = React.useState(toReferenceMonth())
  const [dragging, setDragging] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const inputRef = React.useRef<HTMLInputElement>(null)
  const months = React.useMemo(monthOptions, [])

  function acceptFile(candidate: File | undefined) {
    setError(null)
    if (!candidate) return

    if (!candidate.name.toLowerCase().endsWith('.pdf')) {
      setError('Envie o arquivo em PDF.')
      return
    }
    if (candidate.size > MAX_FILE_BYTES) {
      setError('O PDF precisa ter no máximo 15 MB.')
      return
    }

    setFile(candidate)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!file || uploading) return

    setUploading(true)
    setError(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('source', source)
    formData.append('referenceMonth', referenceMonth)

    try {
      const response = await fetch('/api/statements/import', { method: 'POST', body: formData })
      const payload = await response.json()

      if (!response.ok) {
        setError(payload.error ?? 'Não foi possível importar a fatura.')
        setUploading(false)
        return
      }

      toast({
        variant: 'success',
        title: `${payload.inserted} lançamentos importados`,
        description: [
          `Parser ${payload.parserLabel}.`,
          payload.payments > 0
            ? `${payload.payments} pagamentos da fatura não contam como gasto.`
            : null,
          payload.duplicates > 0 ? `${payload.duplicates} ignorados por já existirem.` : null,
        ]
          .filter(Boolean)
          .join(' '),
      })

      router.push(`/revisao/${payload.statementId}`)
    } catch {
      setError('Falha de conexão ao enviar o arquivo. Tente novamente.')
      setUploading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Card>
        <CardContent className="space-y-5 pt-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="source">Banco / origem</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger id="source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_OPTIONS.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="month">Mês de referência</Label>
              <Select value={referenceMonth} onValueChange={setReferenceMonth}>
                <SelectTrigger id="month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((month) => (
                    <SelectItem key={month} value={month}>
                      {formatMonthLabel(month)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="file">PDF da fatura</Label>

            {file ? (
              <div className="flex items-center gap-3 rounded-lg border border-border px-4 py-3">
                <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remover arquivo"
                  onClick={() => setFile(null)}
                  disabled={uploading}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click()
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault()
                  setDragging(false)
                  acceptFile(event.dataTransfer.files?.[0])
                }}
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center transition-colors',
                  dragging ? 'border-primary bg-accent/60' : 'border-border hover:bg-accent/30',
                )}
              >
                <Upload className="mb-3 h-6 w-6 text-muted-foreground" />
                <p className="text-sm font-medium">Arraste o PDF aqui</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  ou toque para escolher um arquivo (até 15 MB)
                </p>
              </div>
            )}

            <input
              ref={inputRef}
              id="file"
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(event) => acceptFile(event.target.files?.[0])}
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={!file || uploading}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? 'Lendo a fatura…' : 'Importar fatura'}
        </Button>
      </div>
    </form>
  )
}
