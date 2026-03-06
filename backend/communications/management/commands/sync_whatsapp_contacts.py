from __future__ import annotations

import re
from dataclasses import dataclass

from django.core.management.base import BaseCommand

from communications.models import WhatsAppContact
from users.models import User


def _normalize_whatsapp_phone(value: str) -> str:
    clean = re.sub(r"[^0-9+]", "", str(value or "").strip())
    if clean.startswith("00"):
        clean = f"+{clean[2:]}"
    elif clean and not clean.startswith("+"):
        if len(clean) == 10 and clean.startswith("3"):
            # Colombia local mobile number -> E.164.
            clean = f"+57{clean}"
        else:
            clean = f"+{clean}"

    if not re.fullmatch(r"\+[1-9][0-9]{7,14}", clean):
        return ""
    return clean


@dataclass
class Candidate:
    user_id: int
    source: str
    raw_phone: str


class Command(BaseCommand):
    help = (
        "Sincroniza WhatsAppContact desde telefonos de Student, Teacher y FamilyMember(user ligado). "
        "Normaliza a E.164 y evita sobrescribir por defecto."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            default=False,
            help="Simula cambios sin persistir.",
        )
        parser.add_argument(
            "--overwrite",
            action="store_true",
            default=False,
            help="Permite actualizar phone_number de contactos existentes del usuario.",
        )
        parser.add_argument(
            "--activate",
            action="store_true",
            default=False,
            help="Reactiva contactos existentes inactivos.",
        )

    def handle(self, *args, **options):
        dry_run = bool(options.get("dry_run"))
        overwrite = bool(options.get("overwrite"))
        activate = bool(options.get("activate"))

        candidates: list[Candidate] = []

        # Resolve phone candidates from the real domain relationship rooted in User.
        users = User.objects.all()
        for user in users:
            # Student profile: User -> student.phone
            student_profile = getattr(user, "student", None)
            if student_profile is not None:
                student_phone = str(getattr(student_profile, "phone", "") or "").strip()
                if student_phone:
                    candidates.append(
                        Candidate(
                            user_id=int(user.id),
                            source="student.phone",
                            raw_phone=student_phone,
                        )
                    )

            # Teacher profile: User -> teacher_profile.phone
            teacher_profile = getattr(user, "teacher_profile", None)
            if teacher_profile is not None:
                teacher_phone = str(getattr(teacher_profile, "phone", "") or "").strip()
                if teacher_phone:
                    candidates.append(
                        Candidate(
                            user_id=int(user.id),
                            source="teacher.phone",
                            raw_phone=teacher_phone,
                        )
                    )

            # Family member profile linked to a user: User -> familymember.phone
            family_member = getattr(user, "familymember", None)
            if family_member is not None:
                family_phone = str(getattr(family_member, "phone", "") or "").strip()
                if family_phone:
                    candidates.append(
                        Candidate(
                            user_id=int(user.id),
                            source="family_member.phone",
                            raw_phone=family_phone,
                        )
                    )

        # Prioritize source order: family_member -> teacher -> student
        source_priority = {
            "family_member.phone": 0,
            "teacher.phone": 1,
            "student.phone": 2,
        }

        by_user: dict[int, Candidate] = {}
        for candidate in sorted(candidates, key=lambda item: source_priority.get(item.source, 99)):
            if candidate.user_id not in by_user:
                by_user[candidate.user_id] = candidate

        created = 0
        updated = 0
        reactivated = 0
        skipped_invalid = 0
        skipped_existing = 0
        skipped_conflict = 0

        for user_id, candidate in by_user.items():
            normalized = _normalize_whatsapp_phone(candidate.raw_phone)
            if not normalized:
                skipped_invalid += 1
                self.stdout.write(
                    self.style.WARNING(
                        f"SKIP invalid phone user_id={user_id} source={candidate.source} raw='{candidate.raw_phone}'"
                    )
                )
                continue

            contact = WhatsAppContact.objects.filter(user_id=user_id).first()
            phone_owner = WhatsAppContact.objects.filter(phone_number=normalized).exclude(user_id=user_id).first()
            if phone_owner is not None:
                skipped_conflict += 1
                self.stdout.write(
                    self.style.WARNING(
                        f"SKIP conflict user_id={user_id} phone={normalized} owned_by_user={phone_owner.user_id}"
                    )
                )
                continue

            if contact is None:
                created += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f"CREATE user_id={user_id} phone={normalized} source={candidate.source}"
                    )
                )
                if not dry_run:
                    WhatsAppContact.objects.create(
                        user_id=user_id,
                        phone_number=normalized,
                        is_active=True,
                    )
                continue

            was_inactive = not bool(contact.is_active)
            changed = False
            if overwrite and contact.phone_number != normalized:
                contact.phone_number = normalized
                changed = True

            if activate and not contact.is_active:
                contact.is_active = True
                changed = True

            if changed:
                updated += 1
                if activate and was_inactive:
                    reactivated += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f"UPDATE user_id={user_id} phone={contact.phone_number} source={candidate.source}"
                    )
                )
                if not dry_run:
                    contact.save(update_fields=["phone_number", "is_active", "updated_at"])
            else:
                skipped_existing += 1

        summary = (
            f"done dry_run={dry_run} candidates={len(by_user)} created={created} updated={updated} "
            f"reactivated={reactivated} skipped_invalid={skipped_invalid} "
            f"skipped_conflict={skipped_conflict} skipped_existing={skipped_existing}"
        )
        self.stdout.write(self.style.SUCCESS(summary))
