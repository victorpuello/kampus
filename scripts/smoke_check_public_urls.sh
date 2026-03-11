#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ $# -gt 0 ]]; then
  COMPOSE_ARGS=("$@")
else
  COMPOSE_ARGS=(-f "$ROOT_DIR/docker-compose.yml" -f "$ROOT_DIR/docker-compose.prod.yml")
fi

required_services=(backend backend_worker backend_beat)
required_vars=(KAMPUS_PUBLIC_SITE_URL KAMPUS_FRONTEND_BASE_URL KAMPUS_BACKEND_BASE_URL)

for service in "${required_services[@]}"; do
  echo "Checking public URL env vars in $service"
  service_env="$(docker compose "${COMPOSE_ARGS[@]}" exec -T "$service" env)"

  for var_name in "${required_vars[@]}"; do
    line="$(printf '%s\n' "$service_env" | grep -E "^${var_name}=" || true)"
    if [[ -z "$line" ]]; then
      echo "Missing $var_name in running service $service" >&2
      exit 1
    fi

    value="${line#*=}"
    if [[ -z "$value" ]]; then
      echo "$var_name is empty in running service $service" >&2
      exit 1
    fi

    if [[ "$value" == *"localhost"* || "$value" == *"127.0.0.1"* ]]; then
      echo "$var_name points to localhost in running service $service: $value" >&2
      exit 1
    fi
  done
done

echo "Public URL smoke check passed for backend, backend_worker, and backend_beat."