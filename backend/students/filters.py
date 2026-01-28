import django_filters

from .models import Student


class StudentFilter(django_filters.FilterSet):
    current_enrollment_status = django_filters.CharFilter(method="filter_current_enrollment_status")

    class Meta:
        model = Student
        fields: list[str] = []

    def filter_current_enrollment_status(self, queryset, name, value):
        status_value = (value or "").strip().upper()
        if not status_value:
            return queryset

        if status_value in {"NONE", "NO_ENROLLMENT", "SIN_MATRICULA", "SIN_MATRÍCULA"}:
            try:
                return queryset.filter(current_enrollment_status__isnull=True)
            except Exception:
                return queryset

        try:
            return queryset.filter(current_enrollment_status=status_value)
        except Exception:
            # Best-effort: if annotation isn't present for some reason, don't break listing.
            return queryset
