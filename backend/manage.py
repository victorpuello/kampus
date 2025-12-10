#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys
from pathlib import Path

def main():
    """Run administrative tasks."""
    # Load .env from backend/ or project root
    try:
        from dotenv import load_dotenv
        # Try backend/.env first (for Docker)
        current_dir = Path(__file__).resolve().parent
        if (current_dir / '.env').exists():
            load_dotenv(current_dir / '.env')
        else:
            # Try root .env (for local dev)
            load_dotenv(current_dir.parent / '.env')
    except ImportError:
        pass

    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "kampus_backend.settings")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
