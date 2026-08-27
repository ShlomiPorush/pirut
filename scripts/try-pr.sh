#!/usr/bin/env bash
set -Eeuo pipefail

# shellcheck source=scripts/lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

# Trials run in a disposable worktree so the user's checkout is never touched.
readonly WORKTREE_PARENT="${REPO_ROOT}/../.pirut-pr-trials"
readonly TRIAL_IMAGE_PREFIX="pirut-web:pr-"
readonly STATE_FILE="${REPO_ROOT}/tmp/try-pr.state"

usage() {
  cat <<'USAGE'
Usage: scripts/try-pr.sh <operation> [pr-number]

Operations:
  start <pr-number>   Fetch the pull request into a disposable worktree, build a trial
                      image, and run it against a disposable database.
  status              Show the active trial, its worktree, and its running services.
  restore             Stop the trial, remove its worktree and image, and leave the
                      user's checkout and durable development data untouched.

The trial never merges, pushes, edits the working tree, or deletes durable data.
USAGE
}

trial_project() { printf 'pirut-pr-%s\n' "$1"; }
trial_worktree() { printf '%s/pr-%s\n' "${WORKTREE_PARENT}" "$1"; }
trial_image() { printf '%s%s\n' "${TRIAL_IMAGE_PREFIX}" "$1"; }

require_pr_number() {
  [[ "${1:-}" =~ ^[0-9]+$ ]] || fail "A numeric pull request number is required."
}

read_active_pr() {
  [[ -f "${STATE_FILE}" ]] || return 1
  cat "${STATE_FILE}"
}

op_start() {
  local pr="$1"
  require_pr_number "${pr}"
  require_docker
  require_command git "Install Git."

  if read_active_pr >/dev/null 2>&1; then
    fail "Trial for PR #$(read_active_pr) is still active. Run 'scripts/try-pr.sh restore' first."
  fi

  local worktree parent_resolved
  worktree="$(trial_worktree "${pr}")"
  mkdir -p "${WORKTREE_PARENT}"
  parent_resolved="$(realpath "${WORKTREE_PARENT}")"
  [[ "${parent_resolved}" != "/" && "${parent_resolved}" != "${HOME}" ]] ||
    fail "Refusing to use ${parent_resolved} as a worktree parent."
  [[ "${parent_resolved}" != "${REPO_ROOT}" ]] ||
    fail "The worktree parent must sit outside the repository."

  log "Fetching pull request #${pr}"
  git -C "${REPO_ROOT}" fetch origin "pull/${pr}/head:refs/pirut-trials/pr-${pr}" --force

  log "Creating disposable worktree at ${worktree}"
  git -C "${REPO_ROOT}" worktree add --detach "${worktree}" "refs/pirut-trials/pr-${pr}"

  log "Building trial image $(trial_image "${pr}")"
  docker build -t "$(trial_image "${pr}")" "${worktree}"

  # The trial gets its own database directory. Durable development data is never reused,
  # so a migration in the pull request cannot damage it.
  local trial_data="${worktree}/.trial-data"
  mkdir -p "${trial_data}/postgres"

  log "Starting the trial stack"
  PIRUT_IMAGE="$(trial_image "${pr}")" \
    PIRUT_DATA_DIR="${trial_data}" \
    PIRUT_WEB_PORT="$((4700 + pr % 100))" \
    docker compose --project-directory "${worktree}" \
    -p "$(trial_project "${pr}")" \
    -f "${worktree}/config/docker/docker-compose-verify.yml" up -d

  mkdir -p "$(dirname "${STATE_FILE}")"
  printf '%s\n' "${pr}" >"${STATE_FILE}"

  log "Trial for PR #${pr} is starting on http://127.0.0.1:$((4700 + pr % 100))/"
  log "Run 'scripts/try-pr.sh status' to check readiness, then 'restore' when finished."
}

op_status() {
  local pr
  if ! pr="$(read_active_pr 2>/dev/null)"; then
    log "No active trial."
    return 0
  fi

  log "Active trial: PR #${pr}"
  printf '  worktree: %s\n' "$(trial_worktree "${pr}")"
  printf '  image:    %s\n' "$(trial_image "${pr}")"

  docker compose --project-directory "$(trial_worktree "${pr}")" \
    -p "$(trial_project "${pr}")" \
    -f "$(trial_worktree "${pr}")/config/docker/docker-compose-verify.yml" \
    ps --format 'table {{.Service}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null ||
    printf '  the trial stack is not running\n'
}

op_restore() {
  local pr
  if ! pr="$(read_active_pr 2>/dev/null)"; then
    log "No active trial to restore."
    return 0
  fi

  local worktree
  worktree="$(trial_worktree "${pr}")"

  log "Stopping the trial stack"
  PIRUT_IMAGE="$(trial_image "${pr}")" PIRUT_DATA_DIR="${worktree}/.trial-data" \
    docker compose --project-directory "${worktree}" \
    -p "$(trial_project "${pr}")" \
    -f "${worktree}/config/docker/docker-compose-verify.yml" down --remove-orphans -v ||
    warn "The trial stack was already stopped."

  if [[ -d "${worktree}/.trial-data" ]]; then
    log "Removing disposable trial database"
    docker run --rm -v "${worktree}/.trial-data:/target" alpine:3.22 sh -c 'rm -rf /target/*'
  fi

  log "Removing worktree"
  git -C "${REPO_ROOT}" worktree remove --force "${worktree}" || warn "Worktree was already removed."
  git -C "${REPO_ROOT}" update-ref -d "refs/pirut-trials/pr-${pr}" 2>/dev/null || true
  rmdir "${WORKTREE_PARENT}" 2>/dev/null || true

  log "Removing trial image"
  docker image rm "$(trial_image "${pr}")" >/dev/null 2>&1 || true

  rm -f "${STATE_FILE}"
  log "Restored. The checkout and durable development data were not modified."
}

main() {
  case "${1:-}" in
    start)
      shift
      op_start "${1:-}"
      ;;
    status) op_status ;;
    restore) op_restore ;;
    -h | --help | help | "") usage ;;
    *)
      usage >&2
      fail "Unknown operation: $1"
      ;;
  esac
}

main "$@"
