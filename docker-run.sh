#!/usr/bin/env bash
# Build the Docker image and run the container exposing port 5000.
set -euo pipefail

IMAGE_NAME="${IMAGE_NAME:-test-manager-creator-ui}"
CONTAINER_NAME="${CONTAINER_NAME:-test-manager-creator-ui}"
HOST_PORT="${HOST_PORT:-5000}"
CONTAINER_PORT="${CONTAINER_PORT:-5000}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Building Docker image: ${IMAGE_NAME}"
docker build -t "${IMAGE_NAME}" "${SCRIPT_DIR}"

# Remove any existing container with the same name so we can re-run cleanly.
if docker ps -a --format '{{.Names}}' | grep -Fxq "${CONTAINER_NAME}"; then
    echo "Removing existing container: ${CONTAINER_NAME}"
    docker rm -f "${CONTAINER_NAME}" >/dev/null
fi

echo "Running container ${CONTAINER_NAME} on http://localhost:${HOST_PORT}"
docker run -d \
    --name "${CONTAINER_NAME}" \
    -p "${HOST_PORT}:${CONTAINER_PORT}" \
    "${IMAGE_NAME}"

echo "Done. Container '${CONTAINER_NAME}' is running."
echo "Logs: docker logs -f ${CONTAINER_NAME}"
echo "Stop: docker rm -f ${CONTAINER_NAME}"
