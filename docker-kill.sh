#!/usr/bin/env bash
# Stop and remove the running container started by docker-run.sh.
set -euo pipefail

CONTAINER_NAME="${CONTAINER_NAME:-test-manager-creator-ui}"

if docker ps -a --format '{{.Names}}' | grep -Fxq "${CONTAINER_NAME}"; then
    echo "Stopping and removing container: ${CONTAINER_NAME}"
    docker rm -f "${CONTAINER_NAME}" >/dev/null
    echo "Container '${CONTAINER_NAME}' removed."
else
    echo "No container named '${CONTAINER_NAME}' found."
fi
