import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { render } from '@react-email/render'
import { TEMPLATE_DEFINITIONS, type CompiledTemplate } from '../src'

function extractBodyContent(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (!bodyMatch) {
    throw new Error('No se pudo extraer <body> del HTML renderizado.')
  }
  return bodyMatch[1].trim()
}

function normalizeDjangoTemplateExpressions(html: string): string {
  return html.replace(/{{[^}]+}}/g, (expr) => {
    return expr
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
  })
}

function assertUniqueSlugs() {
  const seen = new Set<string>()
  for (const template of TEMPLATE_DEFINITIONS) {
    if (seen.has(template.slug)) {
      throw new Error(`Slug duplicado detectado: ${template.slug}`)
    }
    seen.add(template.slug)
  }
}

function assertAllowedVariables(template: CompiledTemplate) {
  const merged = `${template.subjectTemplate}\n${template.bodyTextTemplate}\n${template.bodyHtmlTemplate}`

  for (const variable of template.allowedVariables) {
    const pattern = new RegExp(`{{\\s*${variable}\\b`, 'm')
    if (!pattern.test(merged)) {
      throw new Error(
        `La variable '${variable}' no aparece en slug '${template.slug}'. Verifica subject/body_text/body_html.`
      )
    }
  }
}

async function compileTemplates(): Promise<CompiledTemplate[]> {
  const compiledTemplates: CompiledTemplate[] = []

  for (const template of TEMPLATE_DEFINITIONS) {
    const html = await render(template.render())

    const compiled: CompiledTemplate = {
      slug: template.slug,
      name: template.name,
      description: template.description,
      templateType: template.templateType,
      category: template.category,
      allowedVariables: template.allowedVariables,
      subjectTemplate: template.subjectTemplate,
      bodyTextTemplate: template.bodyTextTemplate,
      bodyHtmlTemplate: normalizeDjangoTemplateExpressions(extractBodyContent(html)),
    }

    assertAllowedVariables(compiled)

    compiledTemplates.push(compiled)
  }

  return compiledTemplates
}

function writeOutput(templates: CompiledTemplate[]) {
  const output = {
    generatedAt: new Date().toISOString(),
    templates,
  }

  const outputPath = resolve(process.cwd(), 'email-templates/dist/templates.json')
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8')

  console.log(`[email-templates] Generadas ${templates.length} plantillas en ${outputPath}`)
}

async function main() {
  assertUniqueSlugs()
  const compiled = await compileTemplates()
  writeOutput(compiled)
}

main().catch((error) => {
  console.error('[email-templates] Error al generar plantillas:', error)
  process.exit(1)
})
