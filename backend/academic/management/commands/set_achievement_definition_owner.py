from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Set created_by for AchievementDefinition (bank achievement) by code or id."

    def add_arguments(self, parser):
        parser.add_argument(
            "--username",
            required=True,
            help="Username del usuario (docente/admin) que será el owner.",
        )
        group = parser.add_mutually_exclusive_group(required=True)
        group.add_argument("--code", help="Código del logro (ej. LOG-0007)")
        group.add_argument("--id", type=int, help="ID del logro (AchievementDefinition.id)")
        parser.add_argument(
            "--force",
            action="store_true",
            help="Permite sobreescribir created_by si ya está seteado.",
        )

    def handle(self, *args, **options):
        from users.models import User
        from academic.models import AchievementDefinition

        username = options["username"]
        code = options.get("code")
        obj_id = options.get("id")
        force = bool(options.get("force"))

        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist as e:
            raise CommandError(f"Usuario no encontrado: {username}") from e

        qs = AchievementDefinition.objects.all()
        if code:
            qs = qs.filter(code=code)
        if obj_id:
            qs = qs.filter(id=obj_id)

        try:
            obj = qs.get()
        except AchievementDefinition.DoesNotExist as e:
            key = code or obj_id
            raise CommandError(f"AchievementDefinition no encontrado: {key}") from e

        if obj.created_by_id is not None and not force:
            raise CommandError(
                f"created_by ya está seteado (user_id={obj.created_by_id}). Usa --force para sobreescribir."
            )

        obj.created_by = user
        obj.save(update_fields=["created_by"])

        self.stdout.write(
            self.style.SUCCESS(
                f"OK: {obj.code} (id={obj.id}) ahora tiene created_by={user.username} (id={user.id})"
            )
        )
