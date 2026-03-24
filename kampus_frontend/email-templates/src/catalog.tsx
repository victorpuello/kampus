import React from 'react'
import type { ReactElement } from 'react'
import { TemplateLayout } from './layout'

export type CompiledTemplate = {
  slug: string
  name: string
  description: string
  templateType: 'transactional' | 'marketing'
  category: string
  allowedVariables: string[]
  subjectTemplate: string
  bodyTextTemplate: string
  bodyHtmlTemplate: string
}

type TemplateDefinition = Omit<CompiledTemplate, 'bodyHtmlTemplate'> & {
  render: () => ReactElement
}

const VAR = {
  resetUrl: '{{ reset_url }}',
  userEmail: '{{ user_email }}',
  ttlHours: '{{ ttl_hours }}',
  environment: '{{ environment }}',
  campaignTitle: '{{ campaign_title }}',
  campaignMessage: '{{ campaign_message }}',
  ctaUrl: '{{ cta_url }}',
  ctaLabelDefaultMore: "{{ cta_label|default:'Ver mas' }}",
  ctaLabelDefaultNewsletter: "{{ cta_label|default:'Ver boletin completo' }}",
  ctaLabelDefaultNotice: "{{ cta_label|default:'Ver comunicado' }}",
  recipientName: '{{ recipient_name }}',
  title: '{{ title }}',
  body: '{{ body }}',
  actionUrl: '{{ action_url }}',
  monthLabel: '{{ month_label }}',
}

export const TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
  {
    slug: 'password-reset',
    name: 'Recuperar contrasena',
    description: 'Plantilla transaccional para restablecimiento de contrasena.',
    templateType: 'transactional',
    category: 'password-reset',
    allowedVariables: ['reset_url', 'user_email', 'ttl_hours'],
    subjectTemplate: 'Restablecer contrasena - Kampus',
    bodyTextTemplate:
      'Hola,\n\nRecibimos una solicitud para restablecer tu contrasena en {{ institution_name }}.\nUsa este enlace para continuar: {{ reset_url }}\n\nSi no solicitaste este cambio, ignora este mensaje.\nEste enlace vence en {{ ttl_hours }} hora(s).',
    render: () => (
      <TemplateLayout
        preview="Restablecer contrasena"
        title="Restablecer contrasena"
        intro="Recibimos una solicitud para restablecer tu contrasena en {{ institution_name }}."
        body={`Correo asociado: ${VAR.userEmail}\n\nSi no solicitaste este cambio, ignora este mensaje. Este enlace vence en ${VAR.ttlHours} hora(s).`}
        ctaUrl={VAR.resetUrl}
        ctaLabel="Cambiar contrasena"
        accent="blue"
      />
    ),
  },
  {
    slug: 'mail-settings-test',
    name: 'Correo de prueba Mailgun',
    description: 'Plantilla para validar configuracion de correo.',
    templateType: 'transactional',
    category: 'transactional',
    allowedVariables: ['environment'],
    subjectTemplate: '[Kampus] Prueba de configuracion de correo',
    bodyTextTemplate: 'Este es un correo de prueba para validar la configuracion de envio.\nEntorno: {{ environment }}',
    render: () => (
      <TemplateLayout
        preview="Correo de prueba"
        title="Correo de prueba"
        body="La configuracion de correo esta funcionando correctamente.\n\nEntorno: {{ environment }}"
        accent="blue"
      />
    ),
  },
  {
    slug: 'marketing-campaign-generic',
    name: 'Campana marketing generica',
    description: 'Plantilla base para boletines y campanas.',
    templateType: 'marketing',
    category: 'marketing-news',
    allowedVariables: ['campaign_title', 'campaign_message', 'cta_url', 'cta_label'],
    subjectTemplate: '{{ campaign_title }}',
    bodyTextTemplate: '{{ campaign_title }}\n\n{{ campaign_message }}\n\nMas informacion: {{ cta_url }}',
    render: () => (
      <TemplateLayout
        preview={VAR.campaignTitle}
        title={VAR.campaignTitle}
        body={VAR.campaignMessage}
        ctaUrl={VAR.ctaUrl}
        ctaLabel={VAR.ctaLabelDefaultMore}
        accent="green"
      />
    ),
  },
  {
    slug: 'marketing-monthly-newsletter',
    name: 'Boletin mensual',
    description: 'Plantilla de newsletter mensual para comunidad educativa.',
    templateType: 'marketing',
    category: 'marketing-news',
    allowedVariables: ['campaign_title', 'campaign_message', 'cta_url', 'cta_label', 'month_label'],
    subjectTemplate: '{{ campaign_title }} · {{ month_label }}',
    bodyTextTemplate:
      '{{ campaign_title }}\nResumen mensual: {{ month_label }}\n\n{{ campaign_message }}\n\nConoce mas aqui: {{ cta_url }}',
    render: () => (
      <TemplateLayout
        preview={VAR.campaignTitle}
        title={VAR.campaignTitle}
        intro={`Resumen mensual · ${VAR.monthLabel}`}
        body={VAR.campaignMessage}
        ctaUrl={VAR.ctaUrl}
        ctaLabel={VAR.ctaLabelDefaultNewsletter}
        accent="blue"
      />
    ),
  },
  {
    slug: 'marketing-urgent-announcement',
    name: 'Comunicado urgente',
    description: 'Plantilla para avisos institucionales urgentes.',
    templateType: 'marketing',
    category: 'marketing-alert',
    allowedVariables: ['campaign_title', 'campaign_message', 'cta_url', 'cta_label'],
    subjectTemplate: '[Comunicado] {{ campaign_title }}',
    bodyTextTemplate:
      'COMUNICADO INSTITUCIONAL\n\n{{ campaign_title }}\n\n{{ campaign_message }}\n\nMas informacion: {{ cta_url }}',
    render: () => (
      <TemplateLayout
        preview={VAR.campaignTitle}
        title={VAR.campaignTitle}
        badge="Comunicado urgente"
        body={VAR.campaignMessage}
        ctaUrl={VAR.ctaUrl}
        ctaLabel={VAR.ctaLabelDefaultNotice}
        accent="red"
      />
    ),
  },
  {
    slug: 'in-app-notification-generic',
    name: 'Notificacion in-app generica',
    description: 'Plantilla transaccional base para correos derivados de notificaciones in-app.',
    templateType: 'transactional',
    category: 'in-app-notification',
    allowedVariables: ['recipient_name', 'title', 'body', 'action_url'],
    subjectTemplate: '[Kampus] {{ title }}',
    bodyTextTemplate:
      'Hola {{ recipient_name }},\n\n{{ title }}\n\n{{ body }}\n\nVer detalle: {{ action_url }}',
    render: () => (
      <TemplateLayout
        preview={VAR.title}
        title={VAR.title}
        intro={`Hola ${VAR.recipientName},`}
        body={VAR.body}
        ctaUrl={VAR.actionUrl}
        ctaLabel="Ver detalle"
        accent="blue"
      />
    ),
  },
  {
    slug: 'novelty-sla-teacher',
    name: 'Novedades SLA docente',
    description: 'Plantilla para notificar pendientes SLA al docente responsable.',
    templateType: 'transactional',
    category: 'in-app-notification',
    allowedVariables: ['recipient_name', 'title', 'body', 'action_url'],
    subjectTemplate: '[Kampus] {{ title }}',
    bodyTextTemplate:
      'Hola {{ recipient_name }},\n\n{{ title }}\n\n{{ body }}\n\nRevisa tus casos aqui: {{ action_url }}',
    render: () => (
      <TemplateLayout
        preview={VAR.title}
        title={VAR.title}
        intro={`Hola ${VAR.recipientName},`}
        body={VAR.body}
        ctaUrl={VAR.actionUrl}
        ctaLabel="Ir a Novedades"
        accent="blue"
      />
    ),
  },
  {
    slug: 'novelty-sla-admin',
    name: 'Novedades SLA administrativo',
    description: 'Plantilla para escalamiento SLA a administracion.',
    templateType: 'transactional',
    category: 'in-app-notification',
    allowedVariables: ['recipient_name', 'title', 'body', 'action_url'],
    subjectTemplate: '[Kampus] {{ title }}',
    bodyTextTemplate:
      'Hola {{ recipient_name }},\n\n{{ title }}\n\n{{ body }}\n\nVer tablero de novedades: {{ action_url }}',
    render: () => (
      <TemplateLayout
        preview={VAR.title}
        title={VAR.title}
        intro={`Hola ${VAR.recipientName},`}
        body={VAR.body}
        ctaUrl={VAR.actionUrl}
        ctaLabel="Revisar escalamiento"
        accent="orange"
      />
    ),
  },
  {
    slug: 'novelty-sla-coordinator',
    name: 'Novedades SLA coordinacion',
    description: 'Plantilla para escalamiento SLA critico a coordinacion.',
    templateType: 'transactional',
    category: 'in-app-notification',
    allowedVariables: ['recipient_name', 'title', 'body', 'action_url'],
    subjectTemplate: '[Kampus] {{ title }}',
    bodyTextTemplate:
      'Hola {{ recipient_name }},\n\n{{ title }}\n\n{{ body }}\n\nAtiende estos casos: {{ action_url }}',
    render: () => (
      <TemplateLayout
        preview={VAR.title}
        title={VAR.title}
        intro={`Hola ${VAR.recipientName},`}
        body={VAR.body}
        ctaUrl={VAR.actionUrl}
        ctaLabel="Gestionar novedades"
        accent="red"
      />
    ),
  },
]
