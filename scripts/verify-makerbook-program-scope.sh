#!/usr/bin/env bash
set -euo pipefail

readonly UPSTREAM_BASE="ec9cd449857c837a993e348df8b734dfc3717a49"
readonly UPSTREAM_PROGRAM_ID="MNFSTqtC93rEfYHB6hF82sKdZpUDFWkViLByLd1k1Ms"
readonly MAKERBOOK_PROGRAM_ID="HcdpMTGRaKNaZEzRiPWyegVMzbw1rK92zhf6uDgBfGzJ"

git cat-file -e "${UPSTREAM_BASE}^{commit}"

# Include shared code and build inputs: checking only the core src directory
# would miss changes to the tree library, dependencies, or compiler settings.
unexpected="$({
  git diff --name-only "${UPSTREAM_BASE}" -- \
    programs/manifest lib Cargo.toml Cargo.lock \
    rust-toolchain rust-toolchain.toml .cargo
} | while IFS= read -r path; do
  case "${path}" in
    programs/manifest/src/lib.rs | \
    programs/manifest/src/program/processor/claim_seat.rs | \
    programs/manifest/src/utils.rs)
      ;;
    *)
      printf '%s\n' "${path}"
      ;;
  esac
done)"

if [[ -n "${unexpected}" ]]; then
  printf 'Unexpected core source or build-input changes relative to %s:\n%s\n' \
    "${UPSTREAM_BASE}" "${unexpected}" >&2
  exit 1
fi

expected_client="$(mktemp -d)"
trap 'rm -rf "${expected_client}"' EXIT

git archive "${UPSTREAM_BASE}" \
  client/idl/manifest.json client/ts/src/manifest \
  | tar -x -C "${expected_client}"

while IFS= read -r -d '' path; do
  sed -i "s/${UPSTREAM_PROGRAM_ID}/${MAKERBOOK_PROGRAM_ID}/g" "${path}"
done < <(find "${expected_client}" -type f -print0)

yarn --silent prettier --config package.json \
  "${expected_client}/client/ts/src/manifest" --write >/dev/null

if ! diff -qr \
  "${expected_client}/client/idl/manifest.json" client/idl/manifest.json >/dev/null \
  || ! diff -qr \
    "${expected_client}/client/ts/src/manifest" client/ts/src/manifest >/dev/null; then
  printf 'Generated client changes exceed the mechanical Makerbook program-ID binding.\n' >&2
  exit 1
fi

printf 'Core/build-input changes are limited to the three reviewed Makerbook source files; generated bindings match the program-ID substitution.\n'
