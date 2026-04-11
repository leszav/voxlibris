#!/bin/sh
set -e

# --- Валидация обязательных переменных ---
if [ -z "$ICECAST_SOURCE_PASSWORD" ]; then
  echo "ERROR: ICECAST_SOURCE_PASSWORD is not set. Aborting." >&2
  exit 1
fi
if [ -z "$ICECAST_ADMIN_PASSWORD" ]; then
  echo "ERROR: ICECAST_ADMIN_PASSWORD is not set. Aborting." >&2
  exit 1
fi

# --- Параметры с дефолтами ---
ADMIN_USERNAME="${ICECAST_ADMIN_USERNAME:-admin}"
HOSTNAME="${ICECAST_HOSTNAME:-radio.voxlibris.ru}"
MAX_CLIENTS="${ICECAST_MAX_CLIENTS:-1000}"
MAX_SOURCES="${ICECAST_MAX_SOURCES:-20}"
BURST_SIZE="${ICECAST_BURST_SIZE:-65536}"

# --- Генерация конфига из переменных окружения ---
cat > /etc/icecast2/icecast.xml << EOF
<icecast>
  <location>VoxLibris</location>
  <admin>admin@voxlibris.ru</admin>

  <limits>
    <clients>${MAX_CLIENTS}</clients>
    <sources>${MAX_SOURCES}</sources>
    <queue-size>524288</queue-size>
    <client-timeout>30</client-timeout>
    <header-timeout>15</header-timeout>
    <source-timeout>10</source-timeout>
    <burst-size>${BURST_SIZE}</burst-size>
  </limits>

  <authentication>
    <source-password>${ICECAST_SOURCE_PASSWORD}</source-password>
    <relay-password>${ICECAST_SOURCE_PASSWORD}</relay-password>
    <admin-user>${ADMIN_USERNAME}</admin-user>
    <admin-password>${ICECAST_ADMIN_PASSWORD}</admin-password>
  </authentication>

  <hostname>${HOSTNAME}</hostname>

  <listen-socket>
    <port>8000</port>
  </listen-socket>

  <!-- Запись только для авторизованных source-клиентов -->
  <mount type="default">
    <hidden>1</hidden>
    <max-listeners>${MAX_CLIENTS}</max-listeners>
    <burst-size>${BURST_SIZE}</burst-size>
  </mount>

  <paths>
    <logdir>/var/log/icecast</logdir>
    <webroot>/usr/share/icecast/web</webroot>
    <adminroot>/usr/share/icecast/admin</adminroot>
  </paths>

  <logging>
    <accesslog>-</accesslog>
    <errorlog>-</errorlog>
    <loglevel>3</loglevel>
  </logging>

  <security>
    <chroot>0</chroot>
  </security>
</icecast>
EOF

echo "INFO: Icecast config generated. Starting icecast on port 8000..."
exec icecast -c /etc/icecast2/icecast.xml
