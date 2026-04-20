#!/bin/sh
set -eu

echo "Starting csa-backend PVC backup..."

SOURCE_DIR="${SOURCE_DIR:-/data/files}"
WORK_DIR="${WORK_DIR:-/tmp}"
TIMESTAMP="$(date +%Y-%m-%d-%H-%M-%S)"
ARCHIVE_NAME="csa-backend-${TIMESTAMP}.tar.gz"
ARCHIVE_PATH="${WORK_DIR}/${ARCHIVE_NAME}"

: "${s3URI:?s3URI is required}"
: "${s3BucketName:?s3BucketName is required}"

if [ ! -d "${SOURCE_DIR}" ]; then
  echo "ERROR: Source directory does not exist: ${SOURCE_DIR}"
  exit 1
fi

mkdir -p "${WORK_DIR}"

echo "Source directory: ${SOURCE_DIR}"
echo "Work directory: ${WORK_DIR}"
echo "Archive path: ${ARCHIVE_PATH}"
echo "Bucket: ${s3BucketName}"

echo "Extracting credentials and endpoint from s3URI..."

NO_SCHEME="${s3URI#https://}"
CREDS="${NO_SCHEME%@*}"
HOST="${NO_SCHEME#*@}"

ACCESS_KEY="${CREDS%%:*}"
SECRET_KEY="${CREDS#*:}"
ENDPOINT_URL="https://${HOST}"

if [ -z "${ACCESS_KEY}" ] || [ -z "${SECRET_KEY}" ] || [ -z "${HOST}" ]; then
  echo "ERROR: Unable to parse s3URI"
  exit 1
fi

echo "Endpoint: ${ENDPOINT_URL}"

echo "Creating archive..."
tar -czf "${ARCHIVE_PATH}" -C "${SOURCE_DIR}" .

if [ ! -f "${ARCHIVE_PATH}" ]; then
  echo "ERROR: Archive creation failed"
  exit 1
fi

echo "Archive created:"
ls -lh "${ARCHIVE_PATH}"

echo "Configuring object storage client..."
mc alias set objstore "${ENDPOINT_URL}" "${ACCESS_KEY}" "${SECRET_KEY}"

TARGET_PATH="objstore/${s3BucketName}/csa-backend/${ARCHIVE_NAME}"

echo "Uploading archive to ${TARGET_PATH} ..."
mc cp "${ARCHIVE_PATH}" "${TARGET_PATH}"

echo "Backup completed successfully."
