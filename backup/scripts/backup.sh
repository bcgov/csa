#!/bin/sh
set -eu

echo "Starting csa-backend PVC backup..."

SOURCE_DIR="${FILE_STORAGE_PATH:-/data/files}"
WORK_DIR="${WORK_DIR:-/tmp}"
BACKUP_NAME="${BACKUP_NAME:-csa-backend}"
TIMESTAMP="$(date +%Y-%m-%d-%H-%M-%S)"
ARCHIVE_NAME="${BACKUP_NAME}-${TIMESTAMP}.tar.gz"
ARCHIVE_PATH="${WORK_DIR}/${ARCHIVE_NAME}"

: "${s3URI:?s3URI is required}"
: "${s3BucketName:?s3BucketName is required}"
: "${S3_PREFIX:?S3_PREFIX is required}"
: "${MC_CONFIG_DIR:?MC_CONFIG_DIR is required}"

if [ ! -d "${SOURCE_DIR}" ]; then
  echo "ERROR: Source directory does not exist: ${SOURCE_DIR}"
  exit 1
fi

mkdir -p "${WORK_DIR}"
mkdir -p "${MC_CONFIG_DIR}"

echo "Source directory: ${SOURCE_DIR}"
echo "Work directory: ${WORK_DIR}"
echo "Archive path: ${ARCHIVE_PATH}"
echo "Bucket: ${s3BucketName}"
echo "Prefix: ${S3_PREFIX}"

echo "Extracting credentials and endpoint from s3URI..."

RAW_URI="${s3URI}"
NO_SCHEME="${RAW_URI#https://}"
NO_SCHEME="${NO_SCHEME#http://}"
CREDS="${NO_SCHEME%@*}"
HOST="${NO_SCHEME#*@}"

ACCESS_KEY="${CREDS%%:*}"
SECRET_KEY="${CREDS#*:}"

case "${RAW_URI}" in
  https://*) ENDPOINT_URL="https://${HOST}" ;;
  http://*)  ENDPOINT_URL="http://${HOST}" ;;
  *)
    echo "ERROR: s3URI must start with http:// or https://"
    exit 1
    ;;
esac

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

TARGET_PATH="objstore/${s3BucketName}/${S3_PREFIX}/${ARCHIVE_NAME}"

echo "Uploading archive to ${TARGET_PATH} ..."
mc cp "${ARCHIVE_PATH}" "${TARGET_PATH}"

echo "Backup completed successfully."
