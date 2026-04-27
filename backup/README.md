# CSA Backup Utility Image

This folder contains the Docker image and supporting script used for backing up the `csa-backend`
persistent volume claim (PVC) to object storage in the BC Gov OpenShift environment.

## Purpose

The `csa-backend` PVC uses file-based storage and does not support snapshot-based backup. To protect
persistent application files, this utility image is used by a Kubernetes/OpenShift CronJob to:

1. Mount the `csa-backend` PVC
2. Package the required files
3. Upload the backup to S3-compatible object storage
4. Support restore by retrieving the backup artifact later

## Contents

- `Dockerfile` Builds the backup utility image using an approved UBI base image.

- `scripts/backup.sh` Backup script executed by the CronJob. It creates a compressed archive of the
  mounted PVC contents and uploads it to object storage.

## Expected Runtime Inputs

The backup job expects the following environment variables:

- `AWS_ACCESS_KEY_ID` Access key for object storage

- `AWS_SECRET_ACCESS_KEY` Secret key for object storage

- `ENDPOINT_URL` S3-compatible object storage endpoint

- `S3_BUCKET` Target bucket name

- `S3_PREFIX` Object storage path/prefix for backup files

Optional:

- `SOURCE_DIR` Mounted PVC path to back up. Defaults to `/data`

## Example Backup Flow

The backup job performs the following steps:

1. Validate required environment variables
2. Archive the contents of the mounted PVC
3. Configure the object storage client
4. Upload the archive to the target bucket/path
5. Exit with success/failure

## Example CronJob Usage

The image is intended to be used by a CronJob or one-off Job in OpenShift.

Typical mounted paths:

- PVC mounted at `/data`
- script runs from `/workspace` or `/tmp`

## Notes

- This image is environment-agnostic
- It should be built once per source change, not once per environment
- Secrets should be injected using Kubernetes Secret or ExternalSecret
- NetworkPolicy must allow egress from the backup pod to object storage on TCP 443
- Restore testing is required for the backup solution to be considered complete

## Validation

This folder is validated in CI by building the Docker image without pushing it.

## Future Enhancements

Potential future improvements include:

- retention cleanup
- checksum validation
- restore script
- backup success metrics
- alerting integration
