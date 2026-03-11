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

config_output="$(docker compose "${COMPOSE_ARGS[@]}" config)"

extract_service_block() {
  local service_name="$1"
  printf '%s\n' "$config_output" | awk -v service="$service_name" '
    $0 ~ "^  " service ":$" {in_service=1; next}
    in_service && $0 ~ "^  [A-Za-z0-9_-]+:$" {exit}
    in_service {print}
  '
}

for service in "${required_services[@]}"; do
  service_block="$(extract_service_block "$service")"
  if [[ -z "$service_block" ]]; then
    echo "Missing service in rendered compose config: $service" >&2
    exit 1
  fi

  for var_name in "${required_vars[@]}"; do
    line="$(printf '%s\n' "$service_block" | grep -E "^[[:space:]]+$var_name:" || true)"
    if [[ -z "$line" ]]; then
      echo "Missing $var_name for service $service in rendered compose config" >&2
      exit 1
    fi

    value="$(printf '%s\n' "$line" | sed -E 's/^[^:]+:[[:space:]]*//')"
    value="${value%\"}"
    value="${value#\"}"
    if [[ -z "$value" || "$value" == "null" ]]; then
      echo "$var_name is empty for service $service in rendered compose config" >&2
      exit 1
    fi
  done
done

echo "Compose production config includes required public URL vars for backend, backend_worker, and backend_beat."