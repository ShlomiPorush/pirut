#!/usr/bin/env bash
set -Eeuo pipefail

# shellcheck source=scripts/lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

usage() {
  cat <<'USAGE'
Usage: scripts/verify.sh [--full | --changed] [--base <git-ref>] [--only <area>]

  --full     Run every check. This is the default and the release gate.
  --changed  Run only the areas affected by changes against the base ref.
  --base     Base ref for --changed. Defaults to origin/main, then main.
  --only     Restrict to one area: repo, app, or docker. CI uses this to split the
             same checks across jobs.

Checks are the same commands CI runs. CI must not reimplement them.
USAGE
}

MODE="full"
BASE_REF=""
ONLY=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --full) MODE="full" ;;
    --changed) MODE="changed" ;;
    --only)
      shift
      ONLY="${1:-}"
      case "${ONLY}" in
        repo | app | docker) ;;
        *) fail "--only accepts repo, app, or docker; got: ${ONLY:-empty}" ;;
      esac
      ;;
    --base)
      shift
      BASE_REF="${1:-}"
      [[ -n "${BASE_REF}" ]] || fail "--base requires a git ref."
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      fail "Unknown argument: $1"
      ;;
  esac
  shift
done

FAILURES=()

run_check() {
  local name="$1"
  shift
  log "${name}"
  if "$@"; then
    printf '\033[1;32m  pass\033[0m %s\n' "${name}"
  else
    printf '\033[1;31m  FAIL\033[0m %s\n' "${name}"
    FAILURES+=("${name}")
  fi
}

# --- change detection -------------------------------------------------------

RUN_APP=1
RUN_DOCKER=1

detect_changes() {
  local base="${BASE_REF}"
  if [[ -z "${base}" ]]; then
    if git -C "${REPO_ROOT}" rev-parse --verify --quiet origin/main >/dev/null; then
      base="origin/main"
    elif git -C "${REPO_ROOT}" rev-parse --verify --quiet main >/dev/null; then
      base="main"
    else
      warn "No base ref available; running the full suite."
      return
    fi
  fi

  local changed
  changed="$(git -C "${REPO_ROOT}" diff --name-only "${base}"...HEAD)"
  if [[ -z "${changed}" ]]; then
    log "No changes against ${base}; running the full suite anyway."
    return
  fi

  # Shared roots invalidate every area. Anything not proven docs-only runs everything.
  if grep -qE '^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig\.json|vitest\.config\.ts|eslint\.config\.mjs|\.node-version|Dockerfile|\.dockerignore|docker-compose\.yml|\.env\.example|config/|scripts/|src/|tests/|db/|\.github/)' <<<"${changed}"; then
    log "Change detector: shared or application paths touched; running the full suite."
    return
  fi

  if ! grep -qvE '^(docs/|README\.md|AGENTS\.md|CHANGELOG\.md|LICENSE)' <<<"${changed}"; then
    log "Change detector: documentation-only change; skipping application and Docker checks."
    RUN_APP=0
    RUN_DOCKER=0
    return
  fi

  log "Change detector: unclassified paths changed; running the full suite."
}

# --- individual checks ------------------------------------------------------

check_locale_completeness() {
  (cd "${REPO_ROOT}" && pnpm exec vitest run tests/locales)
}

# The repository is public-ready and English-only outside two exact paths.
#
# The pattern uses PCRE code-point escapes rather than a literal character range for two
# reasons: a literal range fails with "Invalid collation character" under the C locale
# these scripts run in, and escapes keep this file itself free of Hebrew.
check_hebrew_guard() {
  local offenders exit_code
  offenders="$(
    git -C "${REPO_ROOT}" grep -IlP '[\x{0590}-\x{05FF}]' -- \
      ':!src/locales/he/' ':!tests/fixtures/he/'
  )" && exit_code=0 || exit_code=$?

  # git grep exits 0 with matches, 1 with none, and above 1 on error. An error must fail
  # the check rather than be mistaken for a clean result.
  if [[ "${exit_code}" -gt 1 ]]; then
    printf 'The Hebrew guard failed to run (git grep exit %s).\n' "${exit_code}" >&2
    return 1
  fi
  if [[ -n "${offenders}" ]]; then
    printf 'Hebrew text outside the approved locale and fixture paths:\n%s\n' "${offenders}" >&2
    return 1
  fi
}

check_compose_contract() {
  local file rendered status=0

  # Both Compose files declare `env_file: .env`, which is machine-local and absent on a
  # clean checkout. Supply the tracked example for the duration of the check only, and
  # never touch a real .env that already exists.
  local temporary_env=0
  if [[ ! -f "${ENV_FILE}" ]]; then
    cp "${REPO_ROOT}/.env.example" "${ENV_FILE}"
    temporary_env=1
  fi
  restore_env() { [[ "${temporary_env}" == "1" ]] && rm -f "${ENV_FILE}"; }
  for file in "${PROD_COMPOSE_FILE}" "${DEV_COMPOSE_TEMPLATE}"; do
    if grep -qE '^[[:space:]]*build:' "${file}"; then
      printf 'Compose file must not contain build: %s\n' "${file}" >&2
      status=1
    fi

    # Render with the tracked example values so interpolation is exercised too.
    # The project directory is the repository root, matching how the scripts invoke
    # Compose; a service-level env_file resolves against it.
    rendered="$(mktemp)"
    if ! PIRUT_IMAGE="${DEV_IMAGE}" PIRUT_DATA_DIR=/tmp/pirut-contract-check \
      docker compose --project-directory "${REPO_ROOT}" -f "${file}" \
      --env-file "${REPO_ROOT}/.env.example" \
      config --format json >"${rendered}"; then
      printf 'Compose file failed to parse: %s\n' "${file}" >&2
      rm -f "${rendered}"
      restore_env
      return 1
    fi

    node - "${file}" "${rendered}" <<'NODE' || status=1
const fs = require("node:fs");
const [, , file, renderedPath] = process.argv;
const config = JSON.parse(fs.readFileSync(renderedPath, "utf8"));
const problems = [];

for (const [name, service] of Object.entries(config.services ?? {})) {
  const ports = service.ports ?? [];
  if (name === "db" && ports.length > 0) {
    problems.push(`service db must not publish a host port (found ${ports.length})`);
  }
  if (name === "web") {
    if (ports.length === 0) {
      problems.push("service web must publish exactly one loopback port");
    }
    for (const port of ports) {
      if (port.host_ip !== "127.0.0.1") {
        problems.push(
          `service web port must bind 127.0.0.1, found ${port.host_ip ?? "all interfaces"}`,
        );
      }
    }
    if (service.healthcheck === undefined) {
      problems.push("service web must define a health check");
    }
  }
  if (service.image === undefined || service.image === "") {
    problems.push(`service ${name} must declare an image`);
  }
}

if (config.services?.db?.healthcheck === undefined) {
  problems.push("service db must define a health check");
}

if (problems.length > 0) {
  console.error(`${file}:`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
NODE
    rm -f "${rendered}"
  done
  restore_env
  return "${status}"
}

check_dockerfile_contract() {
  grep -qE '^USER[[:space:]]+10001:10001' "${REPO_ROOT}/Dockerfile" ||
    { printf 'Dockerfile must switch to the dedicated non-root user.\n' >&2 && return 1; }
  grep -qE '^HEALTHCHECK' "${REPO_ROOT}/Dockerfile" ||
    { printf 'Dockerfile must define a health check.\n' >&2 && return 1; }
  grep -qE '^FROM node:[0-9]+\.[0-9]+\.[0-9]+-' "${REPO_ROOT}/Dockerfile" ||
    { printf 'Dockerfile base images must be pinned to an exact version.\n' >&2 && return 1; }

  # The image, the toolchain contract, and the engines range describe one decision.
  # When they drift, the failure surfaces as an unrelated build error, so check it here.
  local pinned versions unique
  pinned="$(tr -d '[:space:]' <"${REPO_ROOT}/.node-version")"
  versions="$(sed -n 's/^FROM node:\([0-9][^-]*\)-.*/\1/p' "${REPO_ROOT}/Dockerfile" | sort -u)"
  unique="$(wc -l <<<"${versions}")"
  if [[ "${unique}" -ne 1 || "${versions}" != "${pinned}" ]]; then
    printf 'Dockerfile Node version must match .node-version (%s). Found: %s\n' \
      "${pinned}" "$(tr '\n' ' ' <<<"${versions}")" >&2
    return 1
  fi

  local major="${pinned%%.*}"
  grep -q "\"node\": \">=${major} <$((major + 1))\"" "${REPO_ROOT}/package.json" ||
    {
      printf 'package.json engines.node must be ">=%s <%s" to match .node-version.\n' \
        "${major}" "$((major + 1))" >&2
      return 1
    }
}

check_env_example_is_safe() {
  # A placeholder secret is expected; a real-looking one is not.
  if grep -qiE '^(POSTGRES_PASSWORD)=.*(prod|live)' "${REPO_ROOT}/.env.example"; then
    printf '.env.example must contain placeholders only.\n' >&2
    return 1
  fi
  grep -q '^PIRUT_DATABASE_URL=' "${REPO_ROOT}/.env.example"
}

check_scripts_shell() {
  local script relative mode
  for script in "${REPO_ROOT}"/scripts/*.sh "${REPO_ROOT}"/scripts/lib/*.sh; do
    bash -n "${script}" || return 1

    # The filesystem mode is unreliable here: a Windows drive mounted into WSL reports
    # every file as executable. The recorded Git mode is what a fresh clone actually gets.
    relative="${script#"${REPO_ROOT}/"}"
    mode="$(git -C "${REPO_ROOT}" ls-files -s -- "${relative}" | awk '{print $1}')"
    [[ "${mode}" == "100755" ]] || {
      printf 'Script must be executable in Git (mode %s): %s\n' "${mode:-absent}" "${relative}" >&2
      printf '  fix with: git update-index --chmod=+x %s\n' "${relative}" >&2
      return 1
    }
    # CRLF endings break the shebang inside containers and WSL.
    if grep -qU $'\r' "${script}"; then
      printf 'Script must use LF endings: %s\n' "${script}" >&2
      return 1
    fi
  done
  # Static analysis must not be silently skipped: CI once caught real findings that a
  # local run had waved through. Fall back to the pinned container image when the
  # binary is absent rather than reporting a pass.
  if command -v shellcheck >/dev/null 2>&1; then
    shellcheck -x "${REPO_ROOT}"/scripts/*.sh || return 1
  elif command -v docker >/dev/null 2>&1; then
    log "  shellcheck is not installed; running it through Docker"
    docker run --rm -v "${REPO_ROOT}:/mnt" -w /mnt koalaman/shellcheck:v0.11.0 \
      -x scripts/local.sh scripts/verify.sh scripts/try-pr.sh scripts/release.sh || return 1
  else
    printf 'shellcheck is unavailable and Docker is not installed, so shell analysis cannot run.\n' >&2
    return 1
  fi
}

check_docker_image() {
  # `set -e` does not apply inside a function invoked as a condition, so the build result
  # is checked explicitly. Without this, a failed build fell through to inspecting a stale
  # image left by an earlier run and the check reported a pass.
  local build_log
  build_log="$(mktemp)"
  if ! docker build -t "${DEV_IMAGE}" "${REPO_ROOT}" >"${build_log}" 2>&1; then
    printf 'The image failed to build:\n' >&2
    tail -n 25 "${build_log}" >&2
    rm -f "${build_log}"
    return 1
  fi
  rm -f "${build_log}"

  local uid
  uid="$(docker run --rm --entrypoint id "${DEV_IMAGE}" -u)" || {
    printf 'The built image could not be started.\n' >&2
    return 1
  }
  [[ "${uid}" != "0" ]] || {
    printf 'Image runs as root.\n' >&2
    return 1
  }
  log "  image UID ${uid}"
}

check_migrations() {
  local journal="${REPO_ROOT}/db/migrations/meta/_journal.json"
  [[ -f "${journal}" ]] || {
    printf 'Missing migration journal.\n' >&2
    return 1
  }
  node -e "JSON.parse(require('fs').readFileSync('${journal}','utf8'))"

  # Every journal entry must have its SQL file, and every SQL file must be journalled.
  node - "${REPO_ROOT}" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const root = process.argv[2];
const dir = path.join(root, "db/migrations");
const journal = JSON.parse(fs.readFileSync(path.join(dir, "meta/_journal.json"), "utf8"));
const journalled = new Set(journal.entries.map((entry) => `${entry.tag}.sql`));
const onDisk = fs.readdirSync(dir).filter((name) => name.endsWith(".sql"));
const missing = [...journalled].filter((name) => !onDisk.includes(name));
const orphaned = onDisk.filter((name) => !journalled.has(name));
if (missing.length > 0 || orphaned.length > 0) {
  console.error("Migration journal and files disagree.", { missing, orphaned });
  process.exit(1);
}
NODE
}

check_dependency_audit() {
  # Production dependencies are held to a stricter bar: anything moderate or worse fails,
  # because that code runs against real financial data.
  (cd "${REPO_ROOT}" && pnpm audit --prod --audit-level moderate) || return 1
  # Development dependencies fail only on high and critical. A build-time advisory is
  # real but does not reach the running application, so it should not block routine work.
  (cd "${REPO_ROOT}" && pnpm audit --audit-level high) || return 1
}

# The Drizzle toolchain loads its TypeScript config through a loader whose esbuild version
# is pinned by an override. Running generate proves that chain still works, and an
# unexpected new migration means a schema change was committed without one.
check_migration_generation() {
  (cd "${REPO_ROOT}" && PIRUT_DATABASE_URL="postgres://unused" pnpm run db:generate >/dev/null) || {
    printf 'drizzle-kit could not generate migrations.\n' >&2
    return 1
  }
  local dirty
  dirty="$(git -C "${REPO_ROOT}" status --porcelain -- db/migrations)"
  if [[ -n "${dirty}" ]]; then
    printf 'Generating migrations changed db/migrations. Commit the generated migration:\n%s\n' \
      "${dirty}" >&2
    return 1
  fi
}

check_lockfile_is_current() {
  # The question is whether the lockfile agrees with the manifests, not whether it has
  # been committed yet. Comparing against HEAD would fail on legitimate uncommitted
  # dependency work, so compare the file against itself across a resolution run.
  local before after
  before="$(mktemp)"
  after="$(mktemp)"
  cp "${REPO_ROOT}/pnpm-lock.yaml" "${before}"

  if ! (cd "${REPO_ROOT}" && pnpm install --frozen-lockfile --lockfile-only >/dev/null 2>&1); then
    printf 'pnpm refused to resolve from the committed lockfile. It is out of date with the manifests.\n' >&2
    rm -f "${before}" "${after}"
    return 1
  fi

  cp "${REPO_ROOT}/pnpm-lock.yaml" "${after}"
  if ! diff -q "${before}" "${after}" >/dev/null; then
    printf 'Resolving dependencies changed pnpm-lock.yaml. Commit the updated lockfile.\n' >&2
    rm -f "${before}" "${after}"
    return 1
  fi
  rm -f "${before}" "${after}"
}

# --- integration ------------------------------------------------------------

INTEGRATION_PROJECT="pirut-verify-$$"

integration_compose() {
  docker compose --project-directory "${REPO_ROOT}" -p "${INTEGRATION_PROJECT}" \
    -f "${REPO_ROOT}/config/docker/docker-compose-verify.yml" "$@"
}

cleanup_integration() {
  local data_dir="$1"
  PIRUT_DATA_DIR="${data_dir}" PIRUT_IMAGE="${DEV_IMAGE}" \
    integration_compose down --remove-orphans -v >/dev/null 2>&1 || true
  # The cluster files belong to the container's postgres user, so removal runs as root
  # inside a throwaway container rather than requiring sudo on the host.
  docker run --rm -v "${data_dir}:/target" alpine:3.22 \
    sh -c 'rm -rf /target/postgres /target/backups' >/dev/null 2>&1 || true
  rmdir "${data_dir}" 2>/dev/null || true
}

integration_probe() {
  local data_dir="$1" port="$2" state="" body

  PIRUT_DATA_DIR="${data_dir}" PIRUT_WEB_PORT="${port}" PIRUT_IMAGE="${DEV_IMAGE}" \
    integration_compose up -d >/dev/null

  for _ in $(seq 1 40); do
    state="$(
      PIRUT_DATA_DIR="${data_dir}" PIRUT_IMAGE="${DEV_IMAGE}" \
        integration_compose ps --format '{{.Service}} {{.Health}}' |
        awk '$1 == "web" {print $2}'
    )"
    [[ "${state}" == "healthy" || "${state}" == "unhealthy" ]] && break
    sleep 3
  done

  [[ "${state}" == "healthy" ]] || {
    printf 'Integration stack did not become healthy (state: %s).\n' "${state}" >&2
    PIRUT_DATA_DIR="${data_dir}" PIRUT_IMAGE="${DEV_IMAGE}" \
      integration_compose logs --tail 30 >&2
    return 1
  }

  body="$(curl -fsS "http://127.0.0.1:${port}/api/health")"
  grep -q '"status":"ready"' <<<"${body}" || {
    printf 'Health endpoint did not report ready: %s\n' "${body}" >&2
    return 1
  }
  grep -q '"database":"connected"' <<<"${body}" || {
    printf 'Health endpoint did not report database connectivity: %s\n' "${body}" >&2
    return 1
  }
  curl -fsS "http://127.0.0.1:${port}/" | grep -q 'id="root"' || {
    printf 'The application shell was not served.\n' >&2
    return 1
  }

  log "  integration health: ${body}"
}

check_integration() {
  local data_dir port=4699 status=0
  data_dir="$(mktemp -d)"
  mkdir -p "${data_dir}/postgres" "${data_dir}/backups"

  integration_probe "${data_dir}" "${port}" || status=1
  cleanup_integration "${data_dir}"
  return "${status}"
}

# --- run --------------------------------------------------------------------

require_node_toolchain
[[ "${MODE}" == "changed" ]] && detect_changes

# --only narrows the run to one area without changing any check's definition.
if [[ -n "${ONLY}" ]]; then
  RUN_REPO=0
  RUN_APP=0
  RUN_DOCKER=0
  case "${ONLY}" in
    repo) RUN_REPO=1 ;;
    app) RUN_APP=1 ;;
    docker) RUN_DOCKER=1 ;;
  esac
else
  RUN_REPO=1
fi

if [[ "${RUN_REPO}" == "1" ]]; then
  run_check "format" bash -c "cd '${REPO_ROOT}' && pnpm run format:check"
  run_check "public-ready Hebrew guard" check_hebrew_guard
  run_check "shell scripts" check_scripts_shell
  run_check "env example safety" check_env_example_is_safe
fi

if [[ "${RUN_APP}" == "1" ]]; then
  run_check "lint" bash -c "cd '${REPO_ROOT}' && pnpm run lint"
  run_check "types" bash -c "cd '${REPO_ROOT}' && pnpm run typecheck"
  run_check "unit tests" bash -c "cd '${REPO_ROOT}' && pnpm run test"
  run_check "locale completeness" check_locale_completeness
  run_check "production build" bash -c "cd '${REPO_ROOT}' && pnpm run build"
  run_check "migration journal" check_migrations
  run_check "migration generation" check_migration_generation
  run_check "lockfile is current" check_lockfile_is_current
  run_check "dependency audit" check_dependency_audit
fi

if [[ "${RUN_DOCKER}" == "1" ]]; then
  require_docker
  run_check "Dockerfile contract" check_dockerfile_contract
  run_check "Compose contract" check_compose_contract
  run_check "Docker image" check_docker_image
  # Integration needs the image that the previous check builds. Running it anyway would
  # bury the real build error under a confusing "pull access denied" from Compose.
  if [[ " ${FAILURES[*]} " == *" Docker image "* ]]; then
    printf '\033[1;33m  skip\033[0m integration (the image did not build)\n'
  else
    run_check "integration" check_integration
  fi
fi

echo
if [[ ${#FAILURES[@]} -gt 0 ]]; then
  printf '\033[1;31mVerification failed:\033[0m\n'
  printf '  - %s\n' "${FAILURES[@]}"
  exit 1
fi
printf '\033[1;32mVerification passed.\033[0m\n'
