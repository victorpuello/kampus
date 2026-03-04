from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.conf import settings
from django.db import IntegrityError
from django.template import Context, Engine

from core.models import Institution

from .email_service import EmailSendResult, send_email
from .models import EmailTemplate


_TEMPLATE_ENGINE = Engine(autoescape=True)


_DEFAULT_BASE_HTML = """
<!doctype html>
<html lang=\"es\">
  <head>
    <meta charset=\"utf-8\" />
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
    <title>{{ subject }}</title>
  </head>
  <body style=\"margin:0;background:#f1f5f9;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;\">
    <table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;\">
      <tr>
        <td style=\"padding:24px 24px 12px 24px;border-bottom:1px solid #e2e8f0;background:#f8fafc;\">
          {% if institution_logo_url %}
          <img src=\"{{ institution_logo_url }}\" alt=\"Logo institución\" style=\"max-height:60px;max-width:220px;display:block;margin-bottom:12px;\" />
          {% endif %}
          <div style=\"font-size:20px;font-weight:700;color:#0f172a;\">{{ institution_name }}</div>
          <div style=\"font-size:13px;color:#475569;margin-top:4px;\">{{ preheader }}</div>
        </td>
      </tr>
      <tr>
        <td style=\"padding:24px;\">
          {{ content_html|safe }}
          {% if primary_action_url %}
          <div style=\"margin-top:16px;padding:12px;border:1px dashed #cbd5e1;border-radius:10px;background:#f8fafc;font-size:12px;line-height:1.55;color:#475569;\">
            Si el botón no funciona, usa este enlace de respaldo:<br />
            <a href=\"{{ primary_action_url }}\" style=\"color:#0284c7;word-break:break-all;\">{{ primary_action_url }}</a>
          </div>
          {% endif %}
        </td>
      </tr>
      <tr>
        <td style=\"padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;\">
          {{ institution_name }} · {{ institution_email }}
        </td>
      </tr>
    </table>
  </body>
</html>
""".strip()


_DEFAULT_TEMPLATES: dict[str, dict[str, Any]] = {
    "password-reset": {
        "name": "Recuperar contraseña",
        "description": "Plantilla transaccional para restablecimiento de contraseña.",
        "template_type": EmailTemplate.TYPE_TRANSACTIONAL,
        "category": "password-reset",
        "allowed_variables": ["reset_url", "user_email", "ttl_hours"],
        "subject_template": "Restablecer contraseña - Kampus",
        "body_text_template": (
            "Hola,\n\n"
            "Recibimos una solicitud para restablecer tu contraseña en {{ institution_name }}.\n"
            "Usa este enlace para continuar: {{ reset_url }}\n\n"
            "Si no solicitaste este cambio, ignora este mensaje.\n"
            "Este enlace vence en {{ ttl_hours }} hora(s)."
        ),
        "body_html_template": (
            "<h2 style=\"margin:0 0 12px 0;font-size:22px;color:#0f172a;\">Restablecer contraseña</h2>"
            "<p style=\"margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#334155;\">"
            "Recibimos una solicitud para restablecer tu contraseña en <strong>{{ institution_name }}</strong>."
            "</p>"
            "<p style=\"margin:0 0 20px 0;\">"
            "<a href=\"{{ reset_url }}\" style=\"display:inline-block;padding:12px 18px;border-radius:8px;background:#0ea5e9;color:#ffffff;text-decoration:none;font-weight:600;\">"
            "Cambiar contraseña"
            "</a>"
            "</p>"
            "<p style=\"margin:0;font-size:13px;line-height:1.6;color:#64748b;\">"
            "Si no solicitaste este cambio, ignora este mensaje. Este enlace vence en {{ ttl_hours }} hora(s)."
            "</p>"
        ),
    },
    "mail-settings-test": {
        "name": "Correo de prueba Mailgun",
        "description": "Plantilla para validar configuración de correo.",
        "template_type": EmailTemplate.TYPE_TRANSACTIONAL,
        "category": "transactional",
        "allowed_variables": ["environment"],
        "subject_template": "[Kampus] Prueba de configuración de correo",
        "body_text_template": (
            "Este es un correo de prueba para validar la configuración de envío.\n"
            "Entorno: {{ environment }}"
        ),
        "body_html_template": (
            "<h2 style=\"margin:0 0 12px 0;font-size:22px;color:#0f172a;\">Correo de prueba</h2>"
            "<p style=\"margin:0 0 8px 0;font-size:14px;line-height:1.6;color:#334155;\">"
            "La configuración de correo está funcionando correctamente."
            "</p>"
            "<p style=\"margin:0;font-size:13px;color:#64748b;\">"
            "Entorno: <strong>{{ environment }}</strong>"
            "</p>"
        ),
    },
    "marketing-campaign-generic": {
        "name": "Campaña marketing genérica",
        "description": "Plantilla base para boletines y campañas.",
        "template_type": EmailTemplate.TYPE_MARKETING,
        "category": "marketing-news",
        "allowed_variables": ["campaign_title", "campaign_message", "cta_url", "cta_label"],
        "subject_template": "{{ campaign_title }}",
        "body_text_template": (
            "{{ campaign_title }}\n\n"
            "{{ campaign_message }}\n\n"
            "Más información: {{ cta_url }}"
        ),
        "body_html_template": (
            "<h2 style=\"margin:0 0 12px 0;font-size:22px;color:#0f172a;\">{{ campaign_title }}</h2>"
            "<p style=\"margin:0 0 20px 0;font-size:14px;line-height:1.7;color:#334155;\">{{ campaign_message }}</p>"
            "<p style=\"margin:0;\">"
            "<a href=\"{{ cta_url }}\" style=\"display:inline-block;padding:12px 18px;border-radius:8px;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:600;\">"
            "{{ cta_label|default:'Ver más' }}"
            "</a>"
            "</p>"
        ),
    },
    "marketing-monthly-newsletter": {
        "name": "Boletín mensual",
        "description": "Plantilla de newsletter mensual para comunidad educativa.",
        "template_type": EmailTemplate.TYPE_MARKETING,
        "category": "marketing-news",
        "allowed_variables": ["campaign_title", "campaign_message", "cta_url", "cta_label", "month_label"],
        "subject_template": "{{ campaign_title }} · {{ month_label }}",
        "body_text_template": (
            "{{ campaign_title }}\n"
            "Resumen mensual: {{ month_label }}\n\n"
            "{{ campaign_message }}\n\n"
            "Conoce más aquí: {{ cta_url }}"
        ),
        "body_html_template": (
            "<h2 style=\"margin:0 0 8px 0;font-size:22px;color:#0f172a;\">{{ campaign_title }}</h2>"
            "<p style=\"margin:0 0 16px 0;font-size:13px;color:#64748b;\">Resumen mensual · {{ month_label }}</p>"
            "<p style=\"margin:0 0 20px 0;font-size:14px;line-height:1.7;color:#334155;\">{{ campaign_message }}</p>"
            "<p style=\"margin:0;\">"
            "<a href=\"{{ cta_url }}\" style=\"display:inline-block;padding:12px 18px;border-radius:8px;background:#0ea5e9;color:#ffffff;text-decoration:none;font-weight:600;\">"
            "{{ cta_label|default:'Ver boletín completo' }}"
            "</a>"
            "</p>"
        ),
    },
    "marketing-urgent-announcement": {
        "name": "Comunicado urgente",
        "description": "Plantilla para avisos institucionales urgentes.",
        "template_type": EmailTemplate.TYPE_MARKETING,
        "category": "marketing-alert",
        "allowed_variables": ["campaign_title", "campaign_message", "cta_url", "cta_label"],
        "subject_template": "[Comunicado] {{ campaign_title }}",
        "body_text_template": (
            "COMUNICADO INSTITUCIONAL\n\n"
            "{{ campaign_title }}\n\n"
            "{{ campaign_message }}\n\n"
            "Más información: {{ cta_url }}"
        ),
        "body_html_template": (
            "<div style=\"display:inline-block;padding:4px 10px;border-radius:999px;background:#fee2e2;color:#b91c1c;font-size:11px;font-weight:700;letter-spacing:.3px;text-transform:uppercase;\">"
            "Comunicado urgente"
            "</div>"
            "<h2 style=\"margin:12px 0 12px 0;font-size:22px;color:#7f1d1d;\">{{ campaign_title }}</h2>"
            "<p style=\"margin:0 0 20px 0;font-size:14px;line-height:1.7;color:#334155;\">{{ campaign_message }}</p>"
            "<p style=\"margin:0;\">"
            "<a href=\"{{ cta_url }}\" style=\"display:inline-block;padding:12px 18px;border-radius:8px;background:#dc2626;color:#ffffff;text-decoration:none;font-weight:600;\">"
            "{{ cta_label|default:'Ver comunicado' }}"
            "</a>"
            "</p>"
        ),
    },
    "in-app-notification-generic": {
        "name": "Notificación in-app genérica",
        "description": "Plantilla transaccional base para correos derivados de notificaciones in-app.",
        "template_type": EmailTemplate.TYPE_TRANSACTIONAL,
        "category": "in-app-notification",
        "allowed_variables": ["recipient_name", "title", "body", "action_url"],
        "subject_template": "[Kampus] {{ title }}",
        "body_text_template": (
            "Hola {{ recipient_name }},\n\n"
            "{{ title }}\n\n"
            "{{ body }}\n\n"
            "Ver detalle: {{ action_url }}"
        ),
        "body_html_template": (
            "<h2 style=\"margin:0 0 12px 0;font-size:22px;color:#0f172a;\">{{ title }}</h2>"
            "<p style=\"margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#334155;\">Hola <strong>{{ recipient_name }}</strong>,</p>"
            "<p style=\"margin:0 0 20px 0;font-size:14px;line-height:1.7;color:#334155;\">{{ body }}</p>"
            "<p style=\"margin:0;\">"
            "<a href=\"{{ action_url }}\" style=\"display:inline-block;padding:12px 18px;border-radius:8px;background:#0ea5e9;color:#ffffff;text-decoration:none;font-weight:600;\">"
            "Ver detalle"
            "</a>"
            "</p>"
        ),
    },
    "novelty-sla-teacher": {
        "name": "Novedades SLA docente",
        "description": "Plantilla para notificar pendientes SLA al docente responsable.",
        "template_type": EmailTemplate.TYPE_TRANSACTIONAL,
        "category": "in-app-notification",
        "allowed_variables": ["recipient_name", "title", "body", "action_url"],
        "subject_template": "[Kampus] {{ title }}",
        "body_text_template": (
            "Hola {{ recipient_name }},\n\n"
            "{{ title }}\n\n"
            "{{ body }}\n\n"
            "Revisa tus casos aquí: {{ action_url }}"
        ),
        "body_html_template": (
            "<h2 style=\"margin:0 0 12px 0;font-size:22px;color:#0f172a;\">{{ title }}</h2>"
            "<p style=\"margin:0 0 20px 0;font-size:14px;line-height:1.7;color:#334155;\">{{ body }}</p>"
            "<p style=\"margin:0;\">"
            "<a href=\"{{ action_url }}\" style=\"display:inline-block;padding:12px 18px;border-radius:8px;background:#0ea5e9;color:#ffffff;text-decoration:none;font-weight:600;\">"
            "Ir a Novedades"
            "</a>"
            "</p>"
        ),
    },
    "novelty-sla-admin": {
        "name": "Novedades SLA administrativo",
        "description": "Plantilla para escalamiento SLA a administración.",
        "template_type": EmailTemplate.TYPE_TRANSACTIONAL,
        "category": "in-app-notification",
        "allowed_variables": ["recipient_name", "title", "body", "action_url"],
        "subject_template": "[Kampus] {{ title }}",
        "body_text_template": (
            "Hola {{ recipient_name }},\n\n"
            "{{ title }}\n\n"
            "{{ body }}\n\n"
            "Ver tablero de novedades: {{ action_url }}"
        ),
        "body_html_template": (
            "<h2 style=\"margin:0 0 12px 0;font-size:22px;color:#7c2d12;\">{{ title }}</h2>"
            "<p style=\"margin:0 0 20px 0;font-size:14px;line-height:1.7;color:#334155;\">{{ body }}</p>"
            "<p style=\"margin:0;\">"
            "<a href=\"{{ action_url }}\" style=\"display:inline-block;padding:12px 18px;border-radius:8px;background:#ea580c;color:#ffffff;text-decoration:none;font-weight:600;\">"
            "Revisar escalamiento"
            "</a>"
            "</p>"
        ),
    },
    "novelty-sla-coordinator": {
        "name": "Novedades SLA coordinación",
        "description": "Plantilla para escalamiento SLA crítico a coordinación.",
        "template_type": EmailTemplate.TYPE_TRANSACTIONAL,
        "category": "in-app-notification",
        "allowed_variables": ["recipient_name", "title", "body", "action_url"],
        "subject_template": "[Kampus] {{ title }}",
        "body_text_template": (
            "Hola {{ recipient_name }},\n\n"
            "{{ title }}\n\n"
            "{{ body }}\n\n"
            "Atiende estos casos: {{ action_url }}"
        ),
        "body_html_template": (
            "<h2 style=\"margin:0 0 12px 0;font-size:22px;color:#991b1b;\">{{ title }}</h2>"
            "<p style=\"margin:0 0 20px 0;font-size:14px;line-height:1.7;color:#334155;\">{{ body }}</p>"
            "<p style=\"margin:0;\">"
            "<a href=\"{{ action_url }}\" style=\"display:inline-block;padding:12px 18px;border-radius:8px;background:#dc2626;color:#ffffff;text-decoration:none;font-weight:600;\">"
            "Gestionar novedades"
            "</a>"
            "</p>"
        ),
    },
}


@dataclass
class RenderedEmailTemplate:
    template: EmailTemplate
    subject: str
    body_text: str
    body_html: str


def _render_string(template_string: str, context: dict[str, Any]) -> str:
    if not template_string:
        return ""
    template = _TEMPLATE_ENGINE.from_string(template_string)
    return template.render(Context(context)).strip()


def _absolute_media_url(url: str) -> str:
    clean = str(url or "").strip()
    if not clean:
        return ""
    if clean.startswith("http://") or clean.startswith("https://"):
        return clean
    base = (
        str(getattr(settings, "PUBLIC_SITE_URL", "") or "").strip().rstrip("/")
        or str(getattr(settings, "KAMPUS_BACKEND_BASE_URL", "") or "").strip().rstrip("/")
    )
    if not base:
        return clean
    if clean.startswith("/"):
        return f"{base}{clean}"
    return f"{base}/{clean}"


def _get_institution_branding() -> dict[str, str]:
    institution = Institution.objects.first()
    logo_url = ""
    institution_name = "Kampus"
    institution_email = ""

    if institution is not None:
        institution_name = str(getattr(institution, "name", "") or institution_name).strip() or institution_name
        institution_email = str(getattr(institution, "email", "") or "").strip()
        try:
            if getattr(institution, "logo", None) and getattr(institution.logo, "url", None):
                logo_url = _absolute_media_url(institution.logo.url)
        except Exception:
            logo_url = ""

    return {
        "institution_name": institution_name,
        "institution_logo_url": logo_url,
        "institution_email": institution_email,
    }


def _ensure_default_template(slug: str) -> EmailTemplate | None:
    defaults = _DEFAULT_TEMPLATES.get(slug)
    if defaults is None:
        return None

    existing = EmailTemplate.objects.filter(slug=slug).first()
    if existing is not None:
        return existing

    try:
        return EmailTemplate.objects.create(slug=slug, **defaults)
    except IntegrityError:
        return EmailTemplate.objects.filter(slug=slug).first()


def get_or_create_email_template(slug: str) -> EmailTemplate | None:
    template = EmailTemplate.objects.filter(slug=slug).first()
    if template is not None:
        return template
    return _ensure_default_template(slug)


def list_template_defaults() -> list[dict[str, Any]]:
    return [{"slug": slug, **data} for slug, data in _DEFAULT_TEMPLATES.items()]


def render_email_template(*, slug: str, context: dict[str, Any] | None = None) -> RenderedEmailTemplate:
    template = get_or_create_email_template(slug)
    if template is None:
        raise ValueError(f"No existe plantilla para slug '{slug}'.")

    input_context = context or {}
    allowed = set(template.allowed_variables or [])
    filtered_context = {k: v for k, v in input_context.items() if not allowed or k in allowed}

    primary_action_url = ""
    for key in ("reset_url", "cta_url", "action_url", "link_url"):
        value = str(filtered_context.get(key) or "").strip()
        if value:
            primary_action_url = value
            break
    if not primary_action_url:
        for key, value in filtered_context.items():
            if str(key).lower().endswith("_url") and str(value or "").strip():
                primary_action_url = str(value).strip()
                break

    branding_context = _get_institution_branding()
    render_context = {
        **branding_context,
        **filtered_context,
        "primary_action_url": primary_action_url,
        "preheader": template.name,
    }

    subject = _render_string(template.subject_template, render_context)
    body_text = _render_string(template.body_text_template, render_context)
    html_content = _render_string(template.body_html_template, render_context)

    if html_content:
        body_html = _render_string(
            _DEFAULT_BASE_HTML,
            {
                **render_context,
                "subject": subject,
                "content_html": html_content,
            },
        )
    else:
        body_html = ""

    return RenderedEmailTemplate(
        template=template,
        subject=subject,
        body_text=body_text,
        body_html=body_html,
    )


def send_templated_email(
    *,
    slug: str,
    recipient_email: str,
    context: dict[str, Any] | None = None,
    category: str | None = None,
    idempotency_key: str = "",
    from_email: str | None = None,
    environment: str | None = None,
) -> EmailSendResult:
    rendered = render_email_template(slug=slug, context=context)
    resolved_category = str(category or rendered.template.category or "transactional").strip() or "transactional"

    return send_email(
        recipient_email=recipient_email,
        subject=rendered.subject,
        body_text=rendered.body_text,
        body_html=rendered.body_html,
        category=resolved_category,
        idempotency_key=idempotency_key,
        from_email=from_email,
        environment=environment,
    )
