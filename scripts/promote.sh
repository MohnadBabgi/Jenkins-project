#!/usr/bin/env bash
#
# Promote a build from one environment overlay to another.
#
#   ./scripts/promote.sh dev staging
#   ./scripts/promote.sh staging prod
#
# Copies the image tag AND the build metadata (version, commit, build number,
# links) from the source overlay to the target overlay. Both have to move
# together: bump only the tag and the status page reports a different build
# than the image actually running.
#
# Environment-specific settings in the target (replica count, nodePort) are
# left alone -- only the five env values and newTag are rewritten.
#
# This script does NOT commit or push. Review the diff, then commit yourself.

set -euo pipefail

usage() {
    cat >&2 <<EOF
Usage: $(basename "$0") <source-env> <target-env>

  $(basename "$0") dev staging
  $(basename "$0") staging prod
EOF
    exit 1
}

[ $# -eq 2 ] || usage

SOURCE=$1
TARGET=$2

if [ "$SOURCE" = "$TARGET" ]; then
    echo "error: source and target are the same overlay ($SOURCE)" >&2
    exit 1
fi

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
OVERLAYS="$REPO_ROOT/app/k8s/overlays"

SRC_KUST="$OVERLAYS/$SOURCE/kustomization.yaml"
TGT_KUST="$OVERLAYS/$TARGET/kustomization.yaml"
SRC_PATCH="$OVERLAYS/$SOURCE/patch-deployment.yaml"
TGT_PATCH="$OVERLAYS/$TARGET/patch-deployment.yaml"

for f in "$SRC_KUST" "$TGT_KUST" "$SRC_PATCH" "$TGT_PATCH"; do
    if [ ! -f "$f" ]; then
        echo "error: missing file: $f" >&2
        exit 1
    fi
done

# Values carried forward on a promotion. Anything not listed here (replicas,
# nodePort, resource limits) stays at the target's own setting.
VARS="APP_VERSION GIT_COMMIT BUILD_NUMBER REPO_URL BUILD_URL"

read_tag() {
    sed -nE 's/^[[:space:]]*newTag:[[:space:]]*"?([^"]*)"?[[:space:]]*$/\1/p' "$1" | head -1
}

# Reads the `value:` on the line following `- name: <VAR>`.
read_env_value() {
    local file=$1 var=$2
    sed -nE "/- name: ${var}\$/{n;s/^[[:space:]]*value:[[:space:]]*\"?([^\"]*)\"?[[:space:]]*\$/\1/p;}" "$file" | head -1
}

write_env_value() {
    local file=$1 var=$2 value=$3
    # `|` as the delimiter: these values are URLs and contain `/`.
    sed -i -E "/- name: ${var}\$/{n;s|^([[:space:]]*value:[[:space:]]*).*|\1\"${value}\"|;}" "$file"
}

NEW_TAG=$(read_tag "$SRC_KUST")
OLD_TAG=$(read_tag "$TGT_KUST")

if [ -z "$NEW_TAG" ]; then
    echo "error: could not read newTag from $SRC_KUST" >&2
    exit 1
fi

echo "Promoting $SOURCE -> $TARGET"
echo "  image tag: ${OLD_TAG:-<unset>} -> $NEW_TAG"

for var in $VARS; do
    src_value=$(read_env_value "$SRC_PATCH" "$var")
    if [ -z "$src_value" ]; then
        echo "error: $var not found in $SRC_PATCH" >&2
        exit 1
    fi
    if [ -z "$(read_env_value "$TGT_PATCH" "$var")" ]; then
        echo "error: $var not found in $TGT_PATCH (add it before promoting)" >&2
        exit 1
    fi
    write_env_value "$TGT_PATCH" "$var" "$src_value"
    echo "  $var: $src_value"
done

sed -i -E "s|^([[:space:]]*newTag:[[:space:]]*).*|\1\"${NEW_TAG}\"|" "$TGT_KUST"

# Catch a malformed patch before it ever reaches the cluster.
if command -v kubectl >/dev/null 2>&1; then
    if ! kubectl kustomize "$OVERLAYS/$TARGET" >/dev/null; then
        echo "error: $TARGET overlay no longer builds -- review the changes above" >&2
        exit 1
    fi
    echo "  overlay builds cleanly"
fi

echo
git -C "$REPO_ROOT" --no-pager diff -- "$OVERLAYS/$TARGET"

cat <<EOF

Next:
  git add app/k8s/overlays/$TARGET
  git commit -m "Promote build $NEW_TAG to $TARGET"
  git push

Then Sync the '$TARGET' Application in ArgoCD (it is manual-sync on purpose):
  kubectl patch app devops-status-app-$TARGET -n argocd --type merge -p '{"operation":{"sync":{}}}'
EOF
