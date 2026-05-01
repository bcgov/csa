---
status: accepted
date: 2026-02-14
decision-makers: [CSA development team, operations team]
---

# 0006: CRA File Exchange via S3 + Manual Operations (File Transfer Service Deferred)

## Context and Problem Statement

The CRA requires encrypted file exchange: outbound CSA application/cancellation files must be encrypted with CRA's public certificate before delivery, and CRA response files arrive encrypted and must be decrypted before processing. A dedicated **File Transfer Service** microservice was designed and implemented to handle this encryption/decryption lifecycle automatically. However, enabling it in the OpenShift environment proved impossible within the initial delivery timeline.

## Decision Drivers

- CRA requires PKCS#7 / CMS-format encryption (AES-256) using Entrust-compatible tooling
- The operations team uses **Entrust** software for certificate management and CMS operations
- Entrust is not compatible with the OpenShift container environment (no supported container image; binary cannot run in a rootless, restricted pod)
- The system must be able to exchange files with CRA before the encryption challenge is resolved
- The File Transfer Service code must remain intact so it can be activated without code changes once the issue is resolved

## Considered Options

- **S3 + manual operations**:system writes/reads unencrypted files to/from S3; operations team handles encryption/decryption externally using Entrust
- **File Transfer Service (HTTP mode)**:dedicated microservice encrypts with OpenSSL CMS before upload and decrypts after download; fully automated
- **Encrypt inside the API pod using OpenSSL CLI**:run OpenSSL commands directly in the API container, bypassing Entrust

## Decision Outcome

**Chosen: S3 + manual operations (interim)**

The File Transfer Service cannot be activated because the Entrust tooling it relies on for CMS operations does not run inside OpenShift containers. Rather than block the initial deployment, the system is configured with `CRA_TRANSFER_MODE=s3`:

1. The `SEND_CRA_FILE` job writes the outbound flat file to `{CRA_S3_PREFIX}/OUTBOUND/` in S3 (unencrypted)
2. The operations team picks up the file, encrypts it with Entrust, and delivers it to CRA
3. CRA processes the batch and returns an encrypted response
4. The operations team decrypts the response using Entrust and places the plaintext file in `{CRA_S3_PREFIX}/INBOUND/`
5. The `POLL_CRA_RESPONSE` job picks up and processes the file

The File Transfer Service remains fully implemented in the codebase. Switching to it requires only changing `CRA_TRANSFER_MODE=http` and pointing `FILE_TRANSFER_SERVICE_URL` at a deployed instance, no code changes.

### Consequences

- **Good:** CRA file exchange is operational without resolving the Entrust/OpenShift compatibility issue
- **Good:** No plaintext files are exposed beyond the S3 bucket (access-controlled by IAM policies)
- **Good:** The automation path is ready; activation is a configuration change
- **Bad:** Manual intervention required for every file exchange cycle; operations team bottleneck
- **Bad:** Response processing is delayed until operations manually processes the decrypted file
- **Bad:** Human error risk in the manual encryption/decryption step

### Future Activation

When the encryption tooling challenge is resolved, activating the File Transfer Service requires:
1. Deploy the File Transfer Service with valid `CRA_PUB_CERT_PATH` and `CRA_PRIVATE_KEY_PATH`
2. Set `ENCRYPTION_ENABLED=true`
3. Set `CRA_TRANSFER_MODE=http` on the CSA backend
4. Set `FILE_TRANSFER_SERVICE_URL` to the File Transfer Service URL

## Pros and Cons of the Options

### S3 + manual operations (chosen interim)

**Pros:**
- Unblocks initial deployment
- No dependency on unresolved tooling compatibility

**Cons:**
- Manual process; operations team must act for every send/receive cycle
- Slower turnaround on CRA responses

### File Transfer Service (HTTP mode)

**Pros:**
- Fully automated encryption/decryption; no manual steps
- No plaintext ever reaches S3 or disk

**Cons:**
- Requires Entrust-compatible encryption tooling running inside OpenShift, currently not possible
- Blocked until encryption key management is resolved

### Encrypt inside the API pod using OpenSSL CLI

**Pros:**
- No separate microservice needed

**Cons:**
- OpenSSL CMS format may not be accepted by CRA if Entrust-specific certificate profiles are required
- CRA private key must be present in the API pod at runtime, security risk
- Couples encryption logic to the main application process
