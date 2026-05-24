# Развертывание

В этом разделе описаны процессы развертывания приложения VoxLibris в различных окружениях.

## Обзор

VoxLibris поддерживает развертывание в нескольких конфигурациях:

- **Local Development** - локальная разработка
- **Staging** - тестовое окружение
- **Production** - производственное окружение
- **Docker** - контейнеризированное развертывание

## Платформы развертывания

### Поддерживаемые платформы
- **Docker & Docker Compose** - основная платформа
- **Kubernetes** - для масштабируемых развертываний
- **VPS** - виртуальные серверы
- **Cloud platforms** - AWS, Google Cloud, Azure

## Docker развертывание

### Основные файлы

```
├── Dockerfile                 # Основной образ
├── docker-compose.yml         # Локальная разработка
├── docker-compose.prod.yml    # Production конфигурация
├── .dockerignore             # Исключения для Docker
└── nginx/                    # Nginx конфигурация
    └── nginx.conf
```

### Локальная разработка

```bash
# Запуск всех сервисов
docker-compose up -d

# Запуск с пересборкой
docker-compose up -d --build

# Просмотр логов
docker-compose logs -f

# Остановка всех сервисов
docker-compose down

# Полная очистка (включая volumes)
docker-compose down -v
```

### Production развертывание

```bash
# Используем production конфигурацию
docker-compose -f docker-compose.prod.yml up -d

# Масштабирование
docker-compose -f docker-compose.prod.yml up -d --scale app=3

# Обновление
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d
```

## Переменные окружения

### Основные переменные

```bash
# База данных
DATABASE_URL=postgresql://user:password@localhost:5432/voxlibris
REDIS_URL=redis://localhost:6379

# Файловое хранилище
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=voxlibris

# Аутентификация
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=7d

# Email
RESEND_API_KEY=your-resend-api-key
FROM_EMAIL=noreply@voxlibris.ru

# External services
ICECAST_URL=http://localhost:8000/icecast
ICECAST_MOUNT=live

# Приложение
NODE_ENV=production
PORT=5000
CLIENT_URL=http://localhost:5173
```

### Файл .env.example

```bash
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/voxlibris
REDIS_URL=redis://localhost:6379

# MinIO
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123
MINIO_BUCKET=voxlibris
MINIO_USE_SSL=false

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d

# Email
RESEND_API_KEY=re_123456789
FROM_EMAIL=noreply@voxlibris.ru

# Icecast
ICECAST_URL=http://localhost:8000/icecast
ICECAST_MOUNT=live
ICECAST_PASSWORD=icecast_password

# App
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:5173

# Features
ENABLE_GUEST_MODE=true
ENABLE_REGISTRATION=true
ENABLE_CLUB_CREATION=true

# Security
CORS_ORIGIN=http://localhost:5173
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## CI/CD процесс

### GitHub Actions workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Run tests
        run: pnpm test
      
      - name: Build
        run: pnpm build

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to server
        uses: appleboy/ssh-action@v0.1.5
        with:
          host: ${{ secrets.HOST }}
          username: ${{ secrets.USERNAME }}
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd /opt/voxlibris
            git pull origin main
            docker-compose -f docker-compose.prod.yml down
            docker-compose -f docker-compose.prod.yml pull
            docker-compose -f docker-compose.prod.yml up -d --build
```

## HTTPS и SSL

### Nginx конфигурация с SSL

```nginx
# nginx/nginx.ssl.conf
server {
    listen 80;
    server_name voxlibris.ru www.voxlibris.ru;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name voxlibris.ru www.voxlibris.ru;

    ssl_certificate /etc/letsencrypt/live/voxlibris.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/voxlibris.ru/privkey.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    ssl_prefer_server_ciphers off;

    # Frontend
    location / {
        proxy_pass http://client:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API
    location /api/ {
        proxy_pass http://server:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSockets
    location /socket.io/ {
        proxy_pass http://server:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Статические файлы
    location /uploads/ {
        proxy_pass http://minio:9000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Автоматическое обновление SSL сертификатов

```bash
# scripts/renew-ssl.sh
#!/bin/bash

# Обновление Let's Encrypt сертификатов
docker run --rm \
  -v /etc/letsencrypt:/etc/letsencrypt \
  -v /var/lib/letsencrypt:/var/lib/letsencrypt \
  -p 80:80 \
  certbot/certbot renew

# Перезапуск Nginx
docker-compose restart nginx
```

Добавить в crontab:
```bash
# Ежедневная проверка в 3 утра
0 3 * * * /opt/voxlibris/scripts/renew-ssl.sh
```

## Мониторинг и логирование

### Логирование

```yaml
# docker-compose.prod.yml (дополнительные секции)
services:
  app:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
  
  nginx:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### Мониторинг с Prometheus

```yaml
# monitoring/docker-compose.monitoring.yml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana

volumes:
  prometheus_data:
  grafana_data:
```

## Резервное копирование

### Backup скрипт

```bash
# scripts/backup.sh
#!/bin/bash

BACKUP_DIR="/opt/backups/voxlibris"
DATE=$(date +%Y%m%d_%H%M%S)

# Создаем директорию
mkdir -p $BACKUP_DIR/$DATE

# Backup базы данных
docker exec voxlibris_postgres pg_dump -U postgres voxlibris > $BACKUP_DIR/$DATE/database.sql

# Backup файлов
docker run --rm -v voxlibris_minio_data:/data -v $BACKUP_DIR/$DATE:/backup alpine tar czf /backup/minio.tar.gz -C /data .

# Backup конфигураций
cp -r /opt/voxlibris/docker-compose.prod.yml $BACKUP_DIR/$DATE/
cp -r /opt/voxlibris/.env $BACKUP_DIR/$DATE/

# Удаляем старые бэкапы (оставляем последние 7 дней)
find $BACKUP_DIR -type d -mtime +7 -exec rm -rf {} \;

echo "Backup completed: $BACKUP_DIR/$DATE"
```

### Восстановление из backup

```bash
# scripts/restore.sh
#!/bin/bash

BACKUP_DIR=$1

if [ -z "$BACKUP_DIR" ]; then
    echo "Usage: $0 /opt/backups/voxlibris/20240524_120000"
    exit 1
fi

# Останавливаем сервисы
docker-compose -f docker-compose.prod.yml down

# Восстанавливаем базу данных
docker-compose -f docker-compose.prod.yml up -d postgres
sleep 10
docker exec voxlibris_postgres psql -U postgres -c "DROP DATABASE IF EXISTS voxlibris;"
docker exec voxlibris_postgres psql -U postgres -c "CREATE DATABASE voxlibris;"
docker exec -i voxlibris_postgres psql -U postgres voxlibris < $BACKUP_DIR/database.sql

# Восстанавливаем файлы
docker-compose -f docker-compose.prod.yml up -d minio
sleep 5
docker run --rm -v voxlibris_minio_data:/data -v $BACKUP_DIR:/backup alpine tar xzf /backup/minio.tar.gz -C /data

# Запускаем все сервисы
docker-compose -f docker-compose.prod.yml up -d

echo "Restore completed from: $BACKUP_DIR"
```

## Производительность

### Оптимизация Nginx

```nginx
# Оптимизация производительности
worker_processes auto;
worker_connections 1024;

gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

# Кэширование статики
location ~* \.(jpg|jpeg|png|gif|ico|css|js|woff|woff2|ttf|svg)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}

# Ограничение запросов
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/s;

location /api/ {
    limit_req zone=api burst=20 nodelay;
    # ... остальная конфигурация
}

location /api/auth/ {
    limit_req zone=auth burst=10 nodelay;
    # ... остальная конфигурация
}
```

## Безопасность

### Базовые меры безопасности

1. **Регулярные обновления**
   ```bash
   # Обновление образов
   docker-compose pull
   docker-compose up -d
   ```

2. **Ограничение доступа**
   ```yaml
   # Только внутренние сети для некоторых сервисов
   services:
     postgres:
       networks:
         - internal
     
     redis:
       networks:
         - internal
   ```

3. **Контроль секретов**
   ```bash
   # Использование Docker secrets (в Swarm)
   echo "your-jwt-secret" | docker secret create jwt_secret -
   ```

4. **Мониторинг безопасности**
   ```bash
   # Сканирование контейнеров
   docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
     aquasec/trivy image voxlibris_app:latest
   ```

## Troubleshooting

### Частые проблемы

1. **Проблемы с подключением к БД**
   ```bash
   # Проверка статуса
   docker-compose ps postgres
   
   # Просмотр логов
   docker-compose logs postgres
   
   # Подключение к БД
   docker exec -it voxlibris_postgres psql -U postgres voxlibris
   ```

2. **Проблемы с файловым хранилищем**
   ```bash
   # Проверка MinIO
   docker-compose exec minio mc ls local/
   
   # Проверка прав доступа
   docker-compose exec minio mc policy get local/voxlibris
   ```

3. **Проблемы с SSL**
   ```bash
   # Проверка сертификата
   openssl x509 -in /etc/letsencrypt/live/voxlibris.ru/cert.pem -text -noout
   
   # Проверка конфигурации Nginx
   docker-compose exec nginx nginx -t
   ```

### Полезные команды

```bash
# Статус всех сервисов
docker-compose -f docker-compose.prod.yml ps

# Логи конкретного сервиса
docker-compose -f docker-compose.prod.yml logs -f app

# Перезапуск сервиса
docker-compose -f docker-compose.prod.yml restart app

# Вход в контейнер
docker-compose -f docker-compose.prod.yml exec app sh

# Мониторинг ресурсов
docker stats
```

## Заключение

Для получения дополнительной информации:

- [Docker документация](https://docs.docker.com/)
- [Nginx документация](https://nginx.org/en/docs/)
- [Let's Encrypt](https://letsencrypt.org/)

---

Если у вас есть вопросы по развертыванию, обращайтесь к DevOps команде или создавайте issues.