from __future__ import annotations

import json
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import Count
from django.utils import timezone

from communications.models import WhatsAppTemplateMap
from notifications.models import Notification, NotificationType


class Command(BaseCommand):
    help = "Reporte de cobertura de tipos de notificacion (catalogo y mappings WA)."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=30)
        parser.add_argument("--top", type=int, default=20)

    def handle(self, *args, **options):
        days = max(1, int(options.get("days") or 30))
        top = max(1, int(options.get("top") or 20))
        since = timezone.now() - timedelta(days=days)

        top_types = list(
            Notification.objects.filter(created_at__gte=since)
            .exclude(type="")
            .values("type")
            .annotate(total=Count("id"))
            .order_by("-total")[:top]
        )

        catalog_map = {
            x.code: x
            for x in NotificationType.objects.filter(
                code__in=[str(row["type"]).strip().upper() for row in top_types]
            )
        }
        active_wa_map = {
            str(code).strip().upper()
            for code in WhatsAppTemplateMap.objects.filter(
                is_active=True,
                approval_status=WhatsAppTemplateMap.APPROVAL_STATUS_APPROVED,
            ).values_list("notification_type", flat=True)
        }

        rows = []
        missing_catalog = 0
        missing_wa_mapping = 0
        for row in top_types:
            code = str(row["type"] or "").strip().upper()
            cfg = catalog_map.get(code)
            has_catalog = cfg is not None
            has_wa_mapping = code in active_wa_map
            if not has_catalog:
                missing_catalog += 1
            if not has_wa_mapping:
                missing_wa_mapping += 1
            rows.append(
                {
                    "notification_type": code,
                    "total": int(row["total"]),
                    "cataloged": has_catalog,
                    "email_enabled": bool(cfg.email_enabled) if cfg else None,
                    "whatsapp_enabled": bool(cfg.whatsapp_enabled) if cfg else None,
                    "whatsapp_requires_template": bool(cfg.whatsapp_requires_template) if cfg else None,
                    "has_active_whatsapp_template_map": has_wa_mapping,
                }
            )

        payload = {
            "generated_at": timezone.now().isoformat(),
            "window_days": days,
            "top_limit": top,
            "total_cataloged_types": NotificationType.objects.count(),
            "top_types": rows,
            "missing_catalog_count": missing_catalog,
            "missing_whatsapp_mapping_count": missing_wa_mapping,
        }

        self.stdout.write(json.dumps(payload, ensure_ascii=True, sort_keys=True, indent=2))
