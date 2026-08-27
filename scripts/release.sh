#!/usr/bin/env bash
set -Eeuo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

readonly REGISTRY_IMAGE="ghcr.io/shlomiporush/pirut"

usage() {
  cat <<'USAGE'
Usage: scripts/release.sh --target <ghcr> --version <x.y.z> [--execute]

  --target    Required. The only supported target today is 'ghcr'.
  --version   Required. The exact immutable version to release.
  --execute   Perform the release. Without it the script previews and changes nothing.

The preview is always non-mutating. Execution requires a clean, synchronized main,
a full verification pass, an updated changelog, an unused tag, and an unpublished
image version. This script never merges a pull request or deploys the application.
USAGE
}

TARGET=""
VERSION=""
EXECUTE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      shift
      TARGET="${1:-}"
      ;;
    --version)
      shift
      VERSION="${1:-}"
      ;;
    --execute) EXECUTE=1 ;;
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

[[ -n "${TARGET}" ]] || {
  usage >&2
  fail "--target is required. Production is never selected implicitly."
}
[[ "${TARGET}" == "ghcr" ]] || fail "Unsupported target: ${TARGET}"
[[ -n "${VERSION}" ]] || {
  usage >&2
  fail "--version is required."
}
[[ "${VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "Version must look like x.y.z, got: ${VERSION}"

readonly TAG="v${VERSION}"
readonly IMAGE_REF="${REGISTRY_IMAGE}:${VERSION}"

check_source_state() {
  local branch
  branch="$(git -C "${REPO_ROOT}" rev-parse --abbrev-ref HEAD)"
  [[ "${branch}" == "main" ]] || fail "Releases run from main; currently on ${branch}."

  git -C "${REPO_ROOT}" diff --quiet && git -C "${REPO_ROOT}" diff --cached --quiet ||
    fail "The working tree has uncommitted changes."

  git -C "${REPO_ROOT}" fetch origin main --quiet
  local local_head remote_head
  local_head="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
  remote_head="$(git -C "${REPO_ROOT}" rev-parse origin/main)"
  [[ "${local_head}" == "${remote_head}" ]] ||
    fail "main is not synchronized with origin/main."

  git -C "${REPO_ROOT}" rev-parse --verify --quiet "refs/tags/${TAG}" >/dev/null &&
    fail "Tag ${TAG} already exists. Published versions are immutable."

  grep -q '^## \[Unreleased\]' "${REPO_ROOT}/CHANGELOG.md" ||
    fail "CHANGELOG.md has no Unreleased section to close."

  # An Unreleased section with no entries means nothing to release.
  awk '/^## \[Unreleased\]/{flag=1; next} /^## /{flag=0} flag' "${REPO_ROOT}/CHANGELOG.md" |
    grep -q '^- ' || fail "The Unreleased section has no entries."
}

check_image_not_published() {
  if docker manifest inspect "${IMAGE_REF}" >/dev/null 2>&1; then
    fail "${IMAGE_REF} is already published. Versions are immutable."
  fi
}

preview() {
  log "Release preview (nothing is modified)"
  printf '  target:  %s\n' "${TARGET}"
  printf '  version: %s\n' "${VERSION}"
  printf '  tag:     %s\n' "${TAG}"
  printf '  image:   %s\n' "${IMAGE_REF}"
  printf '  commit:  %s\n' "$(git -C "${REPO_ROOT}" rev-parse --short HEAD)"
  echo
  log "Unreleased changelog entries"
  awk '/^## \[Unreleased\]/{flag=1; next} /^## /{flag=0} flag' "${REPO_ROOT}/CHANGELOG.md" |
    sed 's/^/  /'
  echo
  log "Re-run with --execute to perform the release."
}

execute() {
  log "Verifying source state"
  check_source_state
  check_image_not_published

  log "Running full verification"
  "${REPO_ROOT}/scripts/verify.sh" --full

  log "Updating version and changelog"
  node - "${REPO_ROOT}" "${VERSION}" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const [, , root, version] = process.argv;

const manifestPath = path.join(root, "package.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.version = version;
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const changelogPath = path.join(root, "CHANGELOG.md");
const changelog = fs.readFileSync(changelogPath, "utf8");
const stamp = new Date().toISOString().slice(0, 10);
fs.writeFileSync(
  changelogPath,
  changelog.replace(
    "## [Unreleased]",
    `## [Unreleased]\n\n## [${version}] - ${stamp}`,
  ),
);
NODE

  log "Building the release image"
  docker build -t "${IMAGE_REF}" "${REPO_ROOT}"

  log "Committing the release"
  # Explicit paths only: a blanket 'git add .' could sweep in unrelated work.
  git -C "${REPO_ROOT}" add package.json CHANGELOG.md
  git -C "${REPO_ROOT}" commit -m "release: ${VERSION}"
  git -C "${REPO_ROOT}" tag -a "${TAG}" -m "Pirut ${VERSION}"

  log "Publishing ${IMAGE_REF}"
  docker push "${IMAGE_REF}"

  log "Pushing the commit and tag"
  git -C "${REPO_ROOT}" push origin main
  git -C "${REPO_ROOT}" push origin "${TAG}"

  log "Released ${VERSION}. Deployment is a separate, explicit action."
}

if [[ "${EXECUTE}" == "1" ]]; then
  execute
else
  preview
fi
