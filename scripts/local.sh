#!/usr/bin/env bash
set -Eeuo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

usage() {
  cat <<'USAGE'
Usage: scripts/local.sh <operation>

Operations:
  init          Create the machine-local .env and docker-compose-dev.yml from tracked templates.
  build         Install from the lockfile and build the development image.
  up            Build, then start in the foreground.
  up-detached   Build, start detached, and verify readiness, runtime identity, and image identity.
  down          Stop services and remove orphans. Durable data is preserved.
  status        Show service health, image identities, mounts, and port bindings.
  nuke          Delete the validated development data directory after interactive confirmation.
USAGE
}

op_init() {
  local data_dir
  if [[ -f "${ENV_FILE}" ]]; then
    log ".env already exists; leaving it unchanged."
  else
    data_dir="$(default_data_dir)"
    sed "s|__PIRUT_DATA_DIR__|${data_dir}|" "${DEV_ENV_TEMPLATE}" >"${ENV_FILE}"
    log "Created .env with PIRUT_DATA_DIR=${data_dir}"
  fi

  if [[ -f "${DEV_COMPOSE_FILE}" ]]; then
    log "docker-compose-dev.yml already exists; leaving it unchanged."
  else
    cp "${DEV_COMPOSE_TEMPLATE}" "${DEV_COMPOSE_FILE}"
    log "Created docker-compose-dev.yml"
  fi

  data_dir="$(resolve_data_dir)"
  mkdir -p "${data_dir}/postgres" "${data_dir}/backups"
  log "Durable data directory ready at ${data_dir}"
}

op_build() {
  require_dev_compose
  require_docker
  require_node_toolchain

  log "Installing dependencies from the lockfile"
  (cd "${REPO_ROOT}" && pnpm install --frozen-lockfile)

  log "Building ${DEV_IMAGE}"
  docker build -t "${DEV_IMAGE}" "${REPO_ROOT}"
}

wait_for_health() {
  local service="$1" attempts="${2:-40}" state
  for ((i = 1; i <= attempts; i++)); do
    state="$(dev_compose ps --format '{{.Service}} {{.Health}}' | awk -v s="${service}" '$1 == s {print $2}')"
    case "${state}" in
      healthy) return 0 ;;
      unhealthy) fail "Service ${service} reported unhealthy." ;;
    esac
    sleep 3
  done
  fail "Service ${service} did not become healthy in time."
}

verify_runtime() {
  local uid image
  uid="$(dev_compose exec -T web id -u | tr -d '\r')"
  [[ "${uid}" != "0" ]] || fail "The web container is running as root. UID 0 is forbidden."

  image="$(dev_compose ps --format '{{.Service}} {{.Image}}' | awk '$1 == "web" {print $2}')"
  [[ "${image}" == "${DEV_IMAGE}" ]] ||
    fail "The web service runs unexpected image '${image}'; expected '${DEV_IMAGE}'."

  log "Runtime verified: image ${image}, effective UID ${uid}"
}

op_up() {
  op_build
  require_dev_compose
  log "Starting in the foreground. Press Ctrl+C to stop."
  dev_compose up
}

op_up_detached() {
  op_build
  require_dev_compose
  dev_compose up -d
  wait_for_health db
  wait_for_health web
  verify_runtime
  log "Ready on http://127.0.0.1:$(env_value PIRUT_WEB_PORT || echo 4610)/"
}

op_down() {
  require_dev_compose
  require_docker
  # No -v: durable directories and any named volumes must survive an ordinary stop.
  dev_compose down --remove-orphans
  log "Stopped. Durable data was preserved."
}

op_status() {
  require_dev_compose
  require_docker

  log "Services"
  dev_compose ps --format 'table {{.Service}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'

  log "Durable data directory"
  printf '  %s\n' "$(resolve_data_dir)"

  log "Web runtime identity"
  if dev_compose exec -T web id 2>/dev/null; then :; else
    printf '  web is not running\n'
  fi

  log "Applied migrations"
  if dev_compose exec -T db psql -U "$(env_value POSTGRES_USER)" -d "$(env_value POSTGRES_DB)" \
    -tAc "select count(*) from drizzle.__drizzle_migrations" 2>/dev/null; then :; else
    printf '  migration table not present yet\n'
  fi
}

op_nuke() {
  require_dev_compose
  require_docker

  local data_dir
  data_dir="$(resolve_data_dir)"

  local expected_parent
  expected_parent="$(dirname "$(default_data_dir)")"
  [[ "${data_dir}" == "$(default_data_dir)" || "${data_dir}" == "${expected_parent}"/* ]] ||
    fail "Refusing to delete ${data_dir}: it is outside the project-owned data location $(default_data_dir)."

  printf 'This permanently deletes all local Pirut database data at:\n  %s\n' "${data_dir}"
  printf "Type the exact path to confirm: "
  local answer
  read -r answer
  [[ "${answer}" == "${data_dir}" ]] || fail "Confirmation did not match. Nothing was deleted."

  dev_compose down --remove-orphans

  # PostgreSQL files belong to the container's postgres user, so deletion runs as
  # root inside a throwaway container instead of requiring sudo on the host.
  docker run --rm -v "${data_dir}:/target" alpine:3.22 \
    sh -c 'rm -rf /target/postgres /target/backups'
  mkdir -p "${data_dir}/postgres" "${data_dir}/backups"
  log "Deleted and recreated ${data_dir}"
}

main() {
  case "${1:-}" in
    init) op_init ;;
    build) op_build ;;
    up) op_up ;;
    up-detached) op_up_detached ;;
    down) op_down ;;
    status) op_status ;;
    nuke) op_nuke ;;
    -h | --help | help | "") usage ;;
    *)
      usage >&2
      fail "Unknown operation: $1"
      ;;
  esac
}

main "$@"
