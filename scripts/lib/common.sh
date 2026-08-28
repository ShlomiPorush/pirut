#!/usr/bin/env bash
# Shared helpers for the Pirut workflow scripts. Source this file; do not execute it.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly REPO_ROOT

# Everything Docker-related lives under config/docker, including the machine-local
# .env and docker-compose-dev.yml that scripts/local.sh init generates there. Compose is
# always invoked with that directory as its project directory, so `env_file: .env` and
# ${VAR} interpolation resolve against the .env beside the Compose files.
readonly DOCKER_DIR="${REPO_ROOT}/config/docker"
readonly DOCKERFILE="${DOCKER_DIR}/Dockerfile"
readonly DEV_COMPOSE_FILE="${DOCKER_DIR}/docker-compose-dev.yml"
readonly PROD_COMPOSE_FILE="${DOCKER_DIR}/docker-compose.yml"
readonly DEV_COMPOSE_TEMPLATE="${DOCKER_DIR}/docker-compose-dev.example.yml"
readonly DEV_ENV_TEMPLATE="${DOCKER_DIR}/.env.development.example"
readonly PROD_ENV_TEMPLATE="${DOCKER_DIR}/.env.example"
readonly ENV_FILE="${DOCKER_DIR}/.env"
readonly DEV_IMAGE="pirut-web:dev"

log() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
fail() {
  printf '\033[1;31merror:\033[0m %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1. $2"
}

require_docker() {
  require_command docker "Install Docker Engine and run this script inside WSL."
  docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required."
}

require_node_toolchain() {
  require_command node "Install the Node.js version required by engines.node in package.json."
  require_command pnpm "Enable pnpm with: corepack enable pnpm"
}

# Reads a key from the machine-local .env file without sourcing it.
env_value() {
  local key="$1"
  [[ -f "${ENV_FILE}" ]] || return 1
  sed -n "s/^${key}=//p" "${ENV_FILE}" | tail -n 1
}

require_dev_compose() {
  [[ -f "${DEV_COMPOSE_FILE}" ]] ||
    fail "Missing ${DEV_COMPOSE_FILE}. Run 'scripts/local.sh init' first. This script never falls back to the production Compose file."
  [[ -f "${ENV_FILE}" ]] ||
    fail "Missing ${ENV_FILE}. Run 'scripts/local.sh init' first."
}

dev_compose() {
  docker compose --project-directory "${DOCKER_DIR}" -f "${DEV_COMPOSE_FILE}" "$@"
}

# Builds the application image with the repository root as the build context.
build_image() {
  local tag="$1" context="${2:-${REPO_ROOT}}"
  docker build -f "${context}/config/docker/Dockerfile" -t "${tag}" "${context}"
}

# Resolves the durable development data directory declared in .env.
# Prints the absolute path; fails when the value is missing or unusable.
resolve_data_dir() {
  local raw
  raw="$(env_value PIRUT_DATA_DIR || true)"
  [[ -n "${raw}" ]] || fail "PIRUT_DATA_DIR is not set in ${ENV_FILE}."
  [[ "${raw}" != *'__PIRUT_DATA_DIR__'* ]] || fail "PIRUT_DATA_DIR still holds the template placeholder."

  local resolved="${raw}"
  [[ "${resolved}" = /* ]] || resolved="${REPO_ROOT}/${resolved}"
  # realpath -m resolves symlinks and '..' without requiring the path to exist.
  resolved="$(realpath -m "${resolved}")"

  [[ "${resolved}" != "/" ]] || fail "PIRUT_DATA_DIR must not resolve to the filesystem root."
  [[ "${resolved}" != "${HOME}" ]] || fail "PIRUT_DATA_DIR must not resolve to the home directory."
  [[ "${resolved}" != "${REPO_ROOT}" ]] || fail "PIRUT_DATA_DIR must not resolve to the repository root."
  [[ "${resolved}" != /mnt/* ]] ||
    fail "PIRUT_DATA_DIR resolves to a Windows drive (${resolved}). A PostgreSQL cluster cannot live there: the DrvFs mount rejects the ownership changes initdb requires. Use a Linux-native path."

  printf '%s\n' "${resolved}"
}

default_data_dir() {
  printf '%s\n' "${XDG_DATA_HOME:-${HOME}/.local/share}/pirut/data"
}
