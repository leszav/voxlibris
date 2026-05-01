FROM alpine:3.19

# Icecast + netcat для TCP healthcheck + mailcap для /etc/mime.types
RUN apk add --no-cache icecast netcat-openbsd mailcap && \
  mkdir -p /etc/icecast2 /var/log/icecast /usr/local/icecast && \
  chown -R icecast:icecast /etc/icecast2 /var/log/icecast /usr/local/icecast

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD nc -zw1 localhost 8000 || exit 1

USER icecast

ENTRYPOINT ["/entrypoint.sh"]
