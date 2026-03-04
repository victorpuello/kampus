import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Button } from '../ui/Button'
import {
  systemApi,
  type EmailTemplateItem,
  type EmailTemplatePayload,
  type EmailTemplatePreviewResponse,
} from '../../services/system'

const parseError = (error: unknown, fallback: string): string => {
  const data = (error as { response?: { data?: unknown } } | undefined)?.response?.data
  if (typeof data === 'string' && data.trim()) return data
  if (data && typeof data === 'object') {
    const detail = (data as Record<string, unknown>).detail
    const backendError = (data as Record<string, unknown>).error
    if (typeof backendError === 'string' && backendError.trim()) return backendError
    if (typeof detail === 'string' && detail.trim()) return detail
  }
  return fallback
}

const EMPTY_TEMPLATE: EmailTemplatePayload = {
  slug: '',
  name: '',
  description: '',
  template_type: 'transactional',
  category: 'transactional',
  subject_template: '',
  body_text_template: '',
  body_html_template: '',
  allowed_variables: [],
  is_active: true,
}

const DEFAULT_PREVIEW_CONTEXT = {
  reset_url: 'http://localhost:5173/reset-password?token=demo-token',
  user_email: 'usuario@example.com',
  ttl_hours: 1,
  environment: 'development',
  campaign_title: 'Comunicado institucional',
  campaign_message: 'Este es un mensaje de campaña de ejemplo.',
  cta_url: 'http://localhost:5173',
  cta_label: 'Ir a Kampus',
}

export function EmailTemplateSettingsCard() {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)

  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [templates, setTemplates] = useState<EmailTemplateItem[]>([])
  const [selectedSlug, setSelectedSlug] = useState('')
  const [form, setForm] = useState<EmailTemplatePayload>(EMPTY_TEMPLATE)

  const [previewContextRaw, setPreviewContextRaw] = useState(JSON.stringify(DEFAULT_PREVIEW_CONTEXT, null, 2))
  const [previewResult, setPreviewResult] = useState<EmailTemplatePreviewResponse | null>(null)
  const [testEmail, setTestEmail] = useState('')

  const selectedTemplate = useMemo(() => templates.find((item) => item.slug === selectedSlug) || null, [templates, selectedSlug])

  const loadTemplates = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await systemApi.listEmailTemplates()
      const results = response.data.results || []
      setTemplates(results)
      if (!selectedSlug && results.length > 0) {
        const first = results[0]
        setSelectedSlug(first.slug)
        setForm({
          slug: first.slug,
          name: first.name,
          description: first.description,
          template_type: first.template_type,
          category: first.category,
          subject_template: first.subject_template,
          body_text_template: first.body_text_template,
          body_html_template: first.body_html_template,
          allowed_variables: first.allowed_variables || [],
          is_active: first.is_active,
        })
      }
    } catch (err) {
      setError(parseError(err, 'No se pudieron cargar las plantillas.'))
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }

  const loadTemplateDetail = async (slug: string) => {
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const response = await systemApi.getEmailTemplate(slug)
      const item = response.data
      setSelectedSlug(item.slug)
      setForm({
        slug: item.slug,
        name: item.name,
        description: item.description,
        template_type: item.template_type,
        category: item.category,
        subject_template: item.subject_template,
        body_text_template: item.body_text_template,
        body_html_template: item.body_html_template,
        allowed_variables: item.allowed_variables || [],
        is_active: item.is_active,
      })
      setPreviewResult(null)
    } catch (err) {
      setError(parseError(err, 'No se pudo cargar la plantilla.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadTemplates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const parsePreviewContext = (): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(previewContextRaw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
      setError('El contexto de preview debe ser un objeto JSON.')
      return null
    } catch {
      setError('El contexto de preview no es JSON válido.')
      return null
    }
  }

  const saveTemplate = async () => {
    if (!form.slug.trim()) {
      setError('El slug es requerido.')
      return
    }
    if (!form.name.trim()) {
      setError('El nombre es requerido.')
      return
    }
    if (!form.subject_template.trim()) {
      setError('El asunto es requerido.')
      return
    }

    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const payload: EmailTemplatePayload = {
        ...form,
        allowed_variables: form.allowed_variables,
      }
      const response = await systemApi.upsertEmailTemplate(selectedSlug || form.slug, payload)
      const saved = response.data
      await loadTemplates()
      setSelectedSlug(saved.slug)
      setMessage('Plantilla guardada correctamente.')
    } catch (err) {
      setError(parseError(err, 'No se pudo guardar la plantilla.'))
    } finally {
      setSaving(false)
    }
  }

  const runPreview = async () => {
    const context = parsePreviewContext()
    if (!context) return
    const slug = form.slug.trim()
    if (!slug) {
      setError('Selecciona una plantilla para previsualizar.')
      return
    }

    setPreviewLoading(true)
    setError(null)
    try {
      const response = await systemApi.previewEmailTemplate(slug, context)
      setPreviewResult(response.data)
    } catch (err) {
      setError(parseError(err, 'No se pudo generar la previsualización.'))
      setPreviewResult(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  const sendTest = async () => {
    const context = parsePreviewContext()
    if (!context) return
    const slug = form.slug.trim()
    if (!slug) {
      setError('Selecciona una plantilla para enviar prueba.')
      return
    }
    if (!testEmail.trim()) {
      setError('Ingresa un correo de prueba.')
      return
    }

    setSendingTest(true)
    setError(null)
    setMessage(null)
    try {
      const response = await systemApi.sendEmailTemplateTest(slug, testEmail.trim(), context)
      setMessage(response.data.detail || 'Correo de prueba enviado correctamente.')
    } catch (err) {
      setError(parseError(err, 'No se pudo enviar el correo de prueba.'))
    } finally {
      setSendingTest(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <CardTitle className="text-slate-900 dark:text-slate-100">Plantillas de correo</CardTitle>
        <Button variant="outline" size="sm" className="min-h-10" onClick={loadTemplates} disabled={loading || saving}>
          Actualizar
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-200">
            {message}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Plantillas</div>
            <div className="space-y-2">
              {templates.map((item) => (
                <button
                  key={item.slug}
                  type="button"
                  onClick={() => void loadTemplateDetail(item.slug)}
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${selectedSlug === item.slug
                    ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-200'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                    }`}
                >
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs opacity-75">{item.slug}</div>
                </button>
              ))}
              {!templates.length && !loading ? (
                <div className="text-xs text-slate-500 dark:text-slate-400">No hay plantillas registradas.</div>
              ) : null}
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
                Slug
                <input
                  className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  value={form.slug}
                  onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))}
                />
              </label>

              <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
                Nombre
                <input
                  className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                />
              </label>

              <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
                Tipo
                <select
                  className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  value={form.template_type}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      template_type: e.target.value === 'marketing' ? 'marketing' : 'transactional',
                    }))
                  }
                >
                  <option value="transactional">Transactional</option>
                  <option value="marketing">Marketing</option>
                </select>
              </label>

              <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
                Categoría de envío
                <input
                  className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  value={form.category}
                  onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                />
              </label>
            </div>

            <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
              Descripción
              <input
                className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-950 dark:focus:ring-sky-400"
                checked={form.is_active}
                onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
              />
              Plantilla activa
            </label>

            <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
              Variables permitidas (separadas por coma)
              <input
                className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={form.allowed_variables.join(', ')}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    allowed_variables: e.target.value
                      .split(',')
                      .map((item) => item.trim())
                      .filter(Boolean),
                  }))
                }
              />
            </label>

            <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
              Asunto (template)
              <input
                className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={form.subject_template}
                onChange={(e) => setForm((prev) => ({ ...prev, subject_template: e.target.value }))}
              />
            </label>

            <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
              Texto plano
              <textarea
                className="min-h-28 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={form.body_text_template}
                onChange={(e) => setForm((prev) => ({ ...prev, body_text_template: e.target.value }))}
              />
            </label>

            <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
              HTML del contenido (se incrusta en plantilla base con logo)
              <textarea
                className="min-h-44 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={form.body_html_template}
                onChange={(e) => setForm((prev) => ({ ...prev, body_html_template: e.target.value }))}
              />
            </label>

            <div className="flex justify-end">
              <Button onClick={saveTemplate} disabled={saving || loading} className="min-h-11">
                {saving ? 'Guardando…' : 'Guardar plantilla'}
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Preview y prueba de envío</div>
          <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
            Contexto JSON
            <textarea
              className="min-h-36 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              value={previewContextRaw}
              onChange={(e) => setPreviewContextRaw(e.target.value)}
            />
          </label>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button variant="outline" onClick={runPreview} disabled={previewLoading} className="min-h-11">
              {previewLoading ? 'Generando preview…' : 'Previsualizar'}
            </Button>
            <input
              type="email"
              className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              placeholder="correo@destino.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
            />
            <Button onClick={sendTest} disabled={sendingTest} className="min-h-11">
              {sendingTest ? 'Enviando…' : 'Enviar prueba'}
            </Button>
          </div>

          {previewResult ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-950/40">
                <div className="font-semibold text-slate-900 dark:text-slate-100">Asunto renderizado</div>
                <div className="mt-1 text-slate-700 dark:text-slate-300">{previewResult.subject}</div>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-950/40">
                <div className="font-semibold text-slate-900 dark:text-slate-100">Texto renderizado</div>
                <pre className="mt-1 whitespace-pre-wrap text-slate-700 dark:text-slate-300">{previewResult.body_text}</pre>
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950/40">
                <div className="mb-2 font-semibold text-slate-900 dark:text-slate-100">HTML renderizado</div>
                <div className="overflow-auto rounded border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-white" dangerouslySetInnerHTML={{ __html: previewResult.body_html }} />
              </div>
            </div>
          ) : null}
        </div>

        {selectedTemplate ? (
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Última edición registrada para <strong>{selectedTemplate.slug}</strong>: {new Date(selectedTemplate.updated_at).toLocaleString()}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
