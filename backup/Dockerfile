FROM registry.access.redhat.com/ubi9/ubi-minimal:9.5

RUN microdnf install -y \
  tar \
  gzip \
  findutils \
  ca-certificates \
  && microdnf clean all

ADD https://dl.min.io/client/mc/release/linux-amd64/mc /usr/local/bin/mc
RUN chmod 0755 /usr/local/bin/mc

WORKDIR /workspace

COPY scripts/backup.sh /workspace/backup.sh
RUN chmod 0755 /workspace/backup.sh

# OpenShift-compatible writable dirs
RUN mkdir -p /tmp /workspace && chmod -R g=u /tmp /workspace

USER 1001

ENTRYPOINT ["/bin/sh"]
