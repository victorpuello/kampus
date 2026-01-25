from __future__ import annotations

import argparse
import os


def main() -> int:
    try:
        parser = argparse.ArgumentParser(description="Smoke test for observer annotation automation")
        parser.add_argument("--gradesheet-id", type=int, required=True)
        args = parser.parse_args()

        print("debug_observer_annotations: start", flush=True)

        os.environ.setdefault("DJANGO_SETTINGS_MODULE", "kampus_backend.settings")
        print("debug_observer_annotations: env_set", flush=True)

        import django  # noqa: PLC0415

        django.setup()
        print("debug_observer_annotations: django_setup_ok", flush=True)

        from academic.models import GradeSheet  # noqa: PLC0415
        from students.models import ObserverAnnotation  # noqa: PLC0415
        from students.services.observer_annotations import (  # noqa: PLC0415
            maybe_generate_group_period_annotations,
        )

        gs = GradeSheet.objects.select_related("period").get(id=args.gradesheet_id)
        print(f"debug_observer_annotations: loaded_gradesheet id={gs.id} period_id={gs.period_id}", flush=True)

        before_total = ObserverAnnotation.objects.filter(period_id=gs.period_id, is_deleted=False).count()
        before_auto = ObserverAnnotation.objects.filter(period_id=gs.period_id, is_deleted=False, is_automatic=True).count()
        print(f"debug_observer_annotations: before total={before_total} auto={before_auto}", flush=True)

        maybe_generate_group_period_annotations(gradesheet_id=int(gs.id))
        print("debug_observer_annotations: generator_done", flush=True)

        after_total = ObserverAnnotation.objects.filter(period_id=gs.period_id, is_deleted=False).count()
        after_auto = ObserverAnnotation.objects.filter(period_id=gs.period_id, is_deleted=False, is_automatic=True).count()

        print(f"GradeSheet={gs.id} period={gs.period_id} ({gs.period.name})")
        print(f"ObserverAnnotation count before total={before_total} auto={before_auto}")
        print(f"ObserverAnnotation count after  total={after_total} auto={after_auto}")
        return 0

        print(f"GradeSheet={gs.id} period={gs.period_id} ({gs.period.name})")
        print(f"ObserverAnnotation count before={before} after={after}")
        return 0
    except BaseException:  # noqa: BLE001
        import traceback

        traceback.print_exc()
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
