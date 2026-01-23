# Formato oficial — Informe IA (Estado del grupo)

Este repositorio incluye un **formato oficial** para el PDF del informe de IA “Estado del grupo”.

## Dónde vive el formato

- Template (HTML → PDF con WeasyPrint):
  - `backend/teachers/templates/teachers/reports/teacher_statistics_ai_pdf.html`
- Endpoint que lo genera:
  - `GET /api/teachers/me/statistics/ai/pdf`

## Qué estandariza este formato

- Tamaño **A4** con márgenes tipo APA (~1 pulgada).
- Tipografía **Arial** y espaciado (interlineado 2) para lectura “documento oficial”.
- Encabezado con membrete/escudos simétricos y datos institucionales.
- Pie de página con numeración **abajo a la izquierda**.

## Configuración (se guarda en la institución)

La personalización (membrete, textos, tamaño de logos) se toma desde el modelo `Institution` y se administra en:

- Django Admin → **Institution** → **Membrete para reportes PDF**

Campos usados:

- `pdf_letterhead_image`: imagen de membrete (izquierda)
- `logo` + `pdf_show_logo`: escudo/logo (derecha)
- `pdf_logo_height_px`: alto de ambos logos (para mantener simetría)
- `pdf_header_line1`, `pdf_header_line2`, `pdf_header_line3`: líneas del encabezado
- `pdf_footer_text`: texto opcional al final del documento

## Respaldo / restauración (recomendado)

Si vas a reemplazar data o mover ambientes, respalda también esta configuración.

- Exportar fixture + media (incluye logos/membretes):
  - `python backend/manage.py export_dev_data --yes --include-media`

Esto genera por defecto:

- `backend/fixtures/dev-data.json.gz`
- `backend/fixtures/dev-media.zip`

Para restaurar:

- `python backend/manage.py import_dev_data --input backend/fixtures/dev-data.json.gz --media-input backend/fixtures/dev-media.zip`

> Nota: el export puede incluir PII (usuarios/estudiantes). Compártelo solo de forma segura.
