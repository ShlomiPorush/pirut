#!/usr/bin/env bash
set -Eeuo pipefail

# shellcheck source=scripts/lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

usage() {
  cat <<'USAGE'
Usage: scripts/local.sh [command] [flags]

Commands:
  up              Start the development environment (default)
  build           Build the development image without starting it
  down            Stop and remove containers while preserving data
  status          Show service health, image identities, mounts, and migrations
  init            Create config/docker/.env and docker-compose-dev.yml from templates
  backup          Write a consistent pg_dump into the durable backups directory
  restore <file>  Restore a backup into a clean database after confirmation
  nuke            Stop containers and delete the development data directory

Flags for up:
  -b              Build the development image before starting
  -d              Run in detached mode, then verify readiness and runtime identity

Nuke automation:
  --confirm <data-dir>   Skip the interactive prompt by naming the exact directory

Examples:
  scripts/local.sh
  scripts/local.sh -bd
  scripts/local.sh up -b -d
  scripts/local.sh down
  scripts/local.sh nuke

Without -b, up starts the existing pirut-web:dev image and builds it only if it is
absent. A backup contains real financial data: it follows the same access and retention
rules as the live database and must never be committed or shared.
USAGE
}

op_init() {
  local data_dir
  if [[ -f "${ENV_FILE}" ]]; then
    log "config/docker/.env already exists; leaving it unchanged."
  else
    data_dir="$(default_data_dir)"
    sed "s|__PIRUT_DATA_DIR__|${data_dir}|" "${DEV_ENV_TEMPLATE}" >"${ENV_FILE}"
    log "Created config/docker/.env with PIRUT_DATA_DIR=${data_dir}"
  fi

  if [[ -f "${DEV_COMPOSE_FILE}" ]]; then
    log "config/docker/docker-compose-dev.yml already exists; leaving it unchanged."
  else
    cp "${DEV_COMPOSE_TEMPLATE}" "${DEV_COMPOSE_FILE}"
    log "Created config/docker/docker-compose-dev.yml"
  fi

  data_dir="$(resolve_data_dir)"
  mkdir -p "${data_dir}/postgres" "${data_dir}/backups"
  log "Durable data directory ready at ${data_dir}"
}

# Building the image needs Docker and nothing else: the Dockerfile installs dependencies
# from the lockfile inside the build, so the host does not need Node or pnpm at all.
op_build() {
  require_dev_compose
  require_docker

  log "Building ${DEV_IMAGE}"
  build_image "${DEV_IMAGE}"
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

# Builds only when asked with -b, or when the image does not exist yet. Compose never
# builds; the image it runs is produced only here.
ensure_image() {
  if [[ "${BUILD_REQUIRED}" == "true" ]]; then
    op_build
  elif ! docker image inspect "${DEV_IMAGE}" >/dev/null 2>&1; then
    log "${DEV_IMAGE} does not exist yet; building it first"
    op_build
  fi
}

op_up() {
  require_dev_compose
  require_docker
  ensure_image

  if [[ "${DETACHED}" != "true" ]]; then
    log "Starting in the foreground. Press Ctrl+C to stop."
    dev_compose up
    return
  fi

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

require_db_running() {
  local health
  health="$(dev_compose ps --format '{{.Service}} {{.Health}}' | awk '$1 == "db" {print $2}')"
  [[ "${health}" == "healthy" ]] ||
    fail "The db service is not healthy. Run 'scripts/local.sh up -d' first."
}

op_backup() {
  require_dev_compose
  require_docker
  require_db_running

  local user db stamp target
  user="$(env_value POSTGRES_USER)"
  db="$(env_value POSTGRES_DB)"
  # The timestamp comes from the database container so backups sort consistently
  # regardless of the host's clock or time zone.
  stamp="$(dev_compose exec -T db date -u '+%Y%m%dT%H%M%SZ' | tr -d '\r')"
  target="/backups/${db}-${stamp}.dump"

  log "Writing ${target}"
  # Custom format: compressed, and restorable into a clean database with pg_restore.
  dev_compose exec -T db pg_dump -U "${user}" -d "${db}" --format=custom --file="${target}"

  local host_path
  host_path="$(resolve_data_dir)/backups/${db}-${stamp}.dump"
  [[ -s "${host_path}" ]] || fail "The backup file is missing or empty: ${host_path}"
  log "Backup complete: ${host_path} ($(wc -c <"${host_path}") bytes)"
  printf '%s\n' "${host_path}"
}

op_restore() {
  require_dev_compose
  require_docker
  require_db_running

  local source="${1:-}"
  [[ -n "${source}" ]] || fail "Usage: scripts/local.sh restore <backup-file>"

  local data_dir backups_dir resolved
  data_dir="$(resolve_data_dir)"
  backups_dir="${data_dir}/backups"
  # Accept either a bare file name inside the backups directory or a full path,
  # but never a path outside it.
  if [[ "${source}" = /* ]]; then
    resolved="$(realpath -m "${source}")"
  else
    resolved="$(realpath -m "${backups_dir}/${source}")"
  fi
  [[ "${resolved}" == "${backups_dir}/"* ]] ||
    fail "Refusing to restore from outside ${backups_dir}: ${resolved}"
  [[ -s "${resolved}" ]] || fail "Backup file not found or empty: ${resolved}"

  local user db container_path
  user="$(env_value POSTGRES_USER)"
  db="$(env_value POSTGRES_DB)"
  container_path="/backups/${resolved#"${backups_dir}/"}"

  printf 'This replaces every row in the "%s" database with the contents of:\n  %s\n' \
    "${db}" "${resolved}"
  printf "Type the database name to confirm: "
  local answer
  read -r answer
  [[ "${answer}" == "${db}" ]] || fail "Confirmation did not match. Nothing was restored."

  # Restore into a clean database. --clean --if-exists drops existing objects first, so
  # the result reflects the backup rather than a merge with current state.
  log "Restoring into ${db}"
  dev_compose exec -T db pg_restore -U "${user}" -d "${db}" \
    --clean --if-exists --no-owner --single-transaction "${container_path}"
  log "Restore complete. Verify the expected records before removing any older backup."
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

  local answer
  if [[ -n "${CONFIRMATION}" ]]; then
    answer="${CONFIRMATION}"
  else
    printf 'This permanently deletes all local Pirut database data at:\n  %s\n' "${data_dir}"
    printf "Type the exact path to confirm: "
    read -r answer
  fi
  [[ "${answer}" == "${data_dir}" ]] || fail "Confirmation did not match. Nothing was deleted."

  dev_compose down --remove-orphans

  # PostgreSQL files belong to the container's postgres user, so deletion runs as
  # root inside a throwaway container instead of requiring sudo on the host.
  docker run --rm -v "${data_dir}:/target" alpine:3.22 \
    sh -c 'rm -rf /target/postgres /target/backups'
  mkdir -p "${data_dir}/postgres" "${data_dir}/backups"
  log "Deleted and recreated ${data_dir}"
}

COMMAND="up"
BUILD_REQUIRED="false"
DETACHED="false"
CONFIRMATION=""
RESTORE_SOURCE=""

parse_arguments() {
  # The first argument is the command unless it is a flag, in which case `up` is implied,
  # so `scripts/local.sh -bd` works like `scripts/local.sh up -b -d`.
  if (($# > 0)) && [[ "$1" != -* ]]; then
    COMMAND="$1"
    shift
  fi

  case "${COMMAND}" in
    up | build | down | status | init | backup | nuke) ;;
    up-detached)
      COMMAND="up"
      DETACHED="true"
      ;;
    restore)
      RESTORE_SOURCE="${1:-}"
      (($# > 0)) && shift
      ;;
    help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      fail "Unknown command: ${COMMAND}"
      ;;
  esac

  while (($# > 0)); do
    case "$1" in
      -b) BUILD_REQUIRED="true" ;;
      -d) DETACHED="true" ;;
      -bd | -db)
        BUILD_REQUIRED="true"
        DETACHED="true"
        ;;
      --confirm)
        shift
        (($# > 0)) || fail "--confirm requires the exact data directory."
        CONFIRMATION="$1"
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      *)
        usage >&2
        fail "Unknown flag: $1"
        ;;
    esac
    shift
  done

  if [[ "${COMMAND}" != "up" && ("${BUILD_REQUIRED}" == "true" || "${DETACHED}" == "true") ]]; then
    fail "-b and -d apply only to up."
  fi
  if [[ "${COMMAND}" != "nuke" && -n "${CONFIRMATION}" ]]; then
    fail "--confirm applies only to nuke."
  fi
}

main() {
  parse_arguments "$@"
  case "${COMMAND}" in
    init) op_init ;;
    build) op_build ;;
    up) op_up ;;
    down) op_down ;;
    status) op_status ;;
    backup) op_backup ;;
    restore) op_restore "${RESTORE_SOURCE}" ;;
    nuke) op_nuke ;;
  esac
}

main "$@"
