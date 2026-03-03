# Plan de implementación: Escaneo de identidad doble cara en una sola hoja PDF

Fecha: 2026-03-02
Estado: En ejecución (Sprint 1-5 implementado + hardening de compresión y UX móvil)

## Objetivo
Implementar captura de documento de identidad en modo normal o doble cara (anverso/reverso), con generación de PDF de una sola hoja, y acceso seguro para estudiante y acudiente.

## Alcance acordado
- Aplica a documentos de estudiante y acudiente.
- Flujo híbrido: pre-captura en frontend + composición final PDF en backend.
- Almacenamiento y descarga por endpoint autenticado para identidad.

## Sprints

### Sprint 0 — Diseño y contrato técnico
- Definir contrato API de composición (`front_image`, `back_image`).
- Criterios de calidad de salida PDF (centrado, proporción, legibilidad).
- Reglas de fallback para carga normal.

### Sprint 1 — Backend seguro (base)
- Añadir metadatos de archivo privado en modelos de documentos de identidad.
- Añadir endpoints autenticados de descarga para:
  - documento de estudiante
  - documento de acudiente
- Mantener compatibilidad con archivos legacy públicos existentes.

### Sprint 2 — Composición PDF doble cara
- Implementar endpoint backend para componer anverso + reverso en 1 página PDF.
- Normalización básica de imagen (orientación EXIF, autocontraste).
- Escalado proporcional y centrado vertical en hoja única.
- Detección de bordes y corrección de perspectiva (OpenCV) con fallback seguro cuando no esté disponible.

### Sprint 3 — Integración frontend móvil/iPad
- Agregar selector de modo: normal / doble cara.
- Captura por `input file` con `capture="environment"` para móviles.
- En modo doble cara: enviar ambas imágenes a backend, recibir PDF y subirlo como documento final.
- Agregar previsualización por cara (anverso/reverso) con recorte/corrección automática antes de generar el PDF.

### Sprint 4 — Validaciones y permisos
- Validar archivos y tamaños en cliente y API.
- Ajustar validaciones de acudiente principal para aceptar archivo privado.
- Verificación de permisos por roles sobre descargas.
- Implementado: validación backend de formato/tamaño para `preview` y `compose` + validación serializer para archivos de identidad.

### Sprint 5 — QA y salida
- Pruebas E2E en StudentForm, StudentDocuments y StudentProfile.
- Pruebas en Android/iOS/iPad.
- Ajustes de calidad visual y peso del PDF.
- Documentación operativa y checklist de despliegue.
- Cobertura Playwright del flujo doble cara con mocks de preview/composición/subida.

## Entregables implementados en este avance
- Campos de almacenamiento privado en backend para identidad.
- Endpoint de composición de PDF doble cara.
- Endpoint de previsualización de imagen corregida para validar captura por cara.
- Endpoints autenticados de descarga para identidad (estudiante/acudiente).
- Integración frontend de modo normal/doble cara en formularios clave.
- Pipeline backend de detección de contornos y corrección de perspectiva para mejorar recorte automático.
- Prueba E2E Playwright del flujo de escaneo doble cara (preview + PDF + upload).
- Prueba E2E de fallback: preview fallido con vista previa local + bloqueo de upload cuando falla composición.
- Compresión automática de imágenes (no PDF) al guardar documentos, incluyendo identidad privada.
- Compresión WEBP configurable por entorno (`quality` y `method`) para balancear peso/calidad por ambiente.
- Suite de pruebas backend para validar compresión de imagen, preservación de PDF y efecto real de `KAMPUS_IMAGE_WEBP_QUALITY`.

## Riesgos abiertos / siguiente iteración
- Calidad variable en condiciones de baja luz, desenfoque y reflejos del documento; requiere afinación de thresholds CV por dispositivo.
- Pendiente hardening de operación:
  - pruebas de rendimiento con imágenes de alta resolución en móviles de gama baja
  - observabilidad de errores de preview/composición en producción
  - prueba funcional end-to-end con backend real (sin mocks Playwright)

## Checklist operativo de despliegue
- Backend
  - Instalar dependencias nuevas: `opencv-python-headless`.
  - Ejecutar migraciones: `python backend/manage.py migrate`.
  - Verificar variables opcionales:
    - `KAMPUS_IDENTITY_SCAN_MAX_MB` (default: 8)
    - `KAMPUS_IDENTITY_DOCUMENT_MAX_MB` (default: 10)
    - `KAMPUS_IMAGE_WEBP_QUALITY` (1..100, default: 80)
    - `KAMPUS_IMAGE_WEBP_METHOD` (0..6, default: 6)
- Pruebas automatizadas
  - `python backend/manage.py test students.test_identity_scan`
  - `python backend/manage.py test students.test_document_compression`
  - `cd kampus_frontend && npm run lint`
  - `cd kampus_frontend && npx playwright test tests/e2e/identity-scan.spec.ts`
- Smoke manual recomendado
  - Cargar anverso/reverso desde `StudentDocuments` y confirmar previews.
  - Validar que PDF final se genera y que descarga requiere permisos.
  - Probar fallback: fallo de preview o compose no debe subir archivo corrupto.
