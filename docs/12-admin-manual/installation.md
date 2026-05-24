# Установка

## Обзор

В этом разделе описан процесс установки приложения VoxLibris на сервере. Установка включает в себя настройку зависимостей, конфигурационных файлов и базы данных.

## Системные требования

### Аппаратные требования

- **Процессор**: 2+ ядра, 2.0 ГГц+
- **Оперативная память**: 4 ГБ (рекомендуется 8 ГБ)
- **Дисковое пространство**: 10 ГБ свободного места
- **Сеть**: Постоянное подключение к интернету

### Программное обеспечение

- **Операционная система**: Linux (Ubuntu 20.04 LTS, CentOS 8 или новее)
- **Node.js**: 20.0.0 или новее
- **pnpm**: 9.x
- **PostgreSQL**: 14.x или новее
- **Docker** (опционально): 20.10.0 или новее
- **Docker Compose** (опционально): 2.0.0 или новее

## Подготовка сервера

### Установка Node.js

```bash
# Установка Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Проверка версии
node --version
npm --version
```

### Установка pnpm

```bash
# Установка pnpm через npm
npm install -g pnpm@9

# Или установка через Corepack (если поддерживается)
corepack enable
corepack prepare pnpm@latest --activate
```

### Установка PostgreSQL

```bash
# Установка PostgreSQL
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib

# Запуск службы
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### Установка Docker (опционально)

```bash
# Установка Docker
sudo apt-get update
sudo apt-get install \
  ca-certificates \
  curl \
  gnupg \
  lsb-release

# Добавление GPG ключа
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Настройка репозитория
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /etc/null

# Установка Docker
sudo apt-get update
sudo apt-get install docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

## Клонирование репозитория

```bash
# Клонирование репозитория
git clone https://github.com/your-org/voxlibris.git
cd voxlibris

# Установка зависимостей
pnpm install
```

## Настройка базы данных

### Создание пользователя и базы данных

```bash
# Войти в PostgreSQL как суперпользователь
sudo -u postgres psql

# Создать пользователя для приложения
CREATE USER voxlibris WITH PASSWORD 'secure_password_here';

# Создать базу данных
CREATE DATABASE voxlibris OWNER voxlibris;

# Предоставить права доступа
GRANT ALL PRIVILEGES ON DATABASE voxlibris TO voxlibris;

# Выйти из PostgreSQL
\q
```

### Настройка конфигурации

Создайте файл `.env.production` на основе `.env.example`:

```bash
# Копирование примера конфигурации
cp .env.example .env.production
```

Отредактируйте файл `.env.production` с вашими значениями:

```
# Server Configuration
PORT=5000
NODE_ENV=production

# Database Configuration
DATABASE_URL="postgresql://voxlibris:secure_password_here@localhost:5432/voxlibris"

# JWT Configuration
JWT_SECRET="long_secure_production_secret_here_with_at_least_32_characters"
JWT_REFRESH_SECRET="another_long_secure_production_secret_here"

# File Storage (using AWS S3 or production MinIO)
S3_ENDPOINT=https://s3.amazonaws.com
S3_ACCESS_KEY_ID=your_aws_access_key_id
S3_SECRET_ACCESS_KEY=your_aws_secret_access_key
S3_BUCKET_NAME=voxlibris-prod-bucket
S3_REGION=us-east-1

# Email Configuration (using production SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_smtp_username
SMTP_PASS=your_app_specific_password
SMTP_FROM=noreply@voxlibris.app

# Frontend URL
FRONTEND_URL=https://voxlibris.app

# Audio Broadcasting
AUDIO_BROADCAST_PORT=8000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=50

# Logging
LOG_LEVEL=warn
```

### Выполнение миграций

```bash
# Выполнить миграции базы данных
pnpm run db:migrate

# Или, если используется Docker
docker-compose -f docker-compose.prod.yml run app pnpm run db:migrate
```

## Настройка хранилища

### Локальное хранилище

Если вы используете локальное хранилище вместо S3, создайте директории:

```bash
# Создание директорий для загрузки файлов
mkdir -p /var/lib/voxlibris/uploads/books
mkdir -p /var/lib/voxlibris/uploads/covers
mkdir -p /var/lib/voxlibris/uploads/avatars

# Установка прав доступа
sudo chown -R $USER:$USER /var/lib/voxlibris/
sudo chmod -R 755 /var/lib/voxlibris/
```

### Настройка MinIO (альтернатива S3)

Если вы предпочитаете использовать MinIO как S3-совместимое хранилище:

```bash
# Запуск MinIO в Docker
docker run -d \
  --name minio \
  -p 9000:9000 \
  -p 9001:9001 \
  -e "MINIO_ROOT_USER=admin" \
  -e "MINIO_ROOT_PASSWORD=password123" \
  -v /var/lib/minio/data:/data \
  quay.io/minio/minio server /data --console-address ":9001"
```

## Сборка приложения

```bash
# Сборка приложения
pnpm run build

# Проверка сборки
ls -la dist/
```

## Запуск приложения

### Напрямую

```bash
# Установка переменной окружения
export NODE_ENV=production

# Запуск приложения
pnpm start
```

### С использованием PM2

```bash
# Установка PM2
npm install -g pm2

# Запуск приложения с PM2
pm2 start dist/server/index.js --name voxlibris-app -- \
  --env-file=.env.production

# Автозапуск при старте системы
pm2 startup
pm2 save
```

### С использованием Docker

Создайте `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  # Основное приложение
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "5000:5000"
    depends_on:
      - postgres
    environment:
      - DATABASE_URL=postgresql://voxlibris:secure_password_here@postgres:5432/voxlibris
      - JWT_SECRET=${JWT_SECRET}
      - JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
      - S3_ENDPOINT=${S3_ENDPOINT}
      - S3_ACCESS_KEY_ID=${S3_ACCESS_KEY_ID}
      - S3_SECRET_ACCESS_KEY=${S3_SECRET_ACCESS_KEY}
      - S3_BUCKET_NAME=${S3_BUCKET_NAME}
      - SMTP_HOST=${SMTP_HOST}
      - SMTP_PORT=${SMTP_PORT}
      - SMTP_USER=${SMTP_USER}
      - SMTP_PASS=${SMTP_PASS}
      - SMTP_FROM=${SMTP_FROM}
      - FRONTEND_URL=${FRONTEND_URL}
      - NODE_ENV=production
    restart: always

  # База данных PostgreSQL
  postgres:
    image: postgres:14
    restart: always
    environment:
      POSTGRES_DB: voxlibris
      POSTGRES_USER: voxlibris
      POSTGRES_PASSWORD: secure_password_here
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

Запустите приложение:

```bash
# Запуск с Docker Compose
docker-compose -f docker-compose.prod.yml up -d
```

## Проверка установки

После установки проверьте работоспособность приложения:

```bash
# Проверка состояния сервиса
curl http://localhost:5000/health

# Проверка доступности API
curl http://localhost:5000/api/status
```

## Дополнительные шаги

### Настройка SSL (рекомендуется)

Для защиты соединений рекомендуется настроить SSL сертификат:

```bash
# Установка Certbot для получения Let's Encrypt сертификатов
sudo apt-get install certbot

# Получение сертификата
sudo certbot certonly --standalone -d voxlibris.yourdomain.com
```

### Настройка обратного прокси (nginx)

Установите nginx и настройте обратный прокси:

```bash
# Установка nginx
sudo apt-get install nginx

# Создание конфигурации
sudo nano /etc/nginx/sites-available/voxlibris
```

Пример конфигурации nginx:

```
server {
    listen 80;
    server_name voxlibris.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name voxlibris.yourdomain.com;

    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Активируйте сайт:

```bash
# Создание символической ссылки
sudo ln -s /etc/nginx/sites-available/voxlibris /etc/nginx/sites-enabled/

# Проверка конфигурации
sudo nginx -t

# Перезапуск nginx
sudo systemctl restart nginx
```

## Рекомендации

1. Регулярно обновляйте зависимости и компоненты
2. Используйте надежные пароли и ключи
3. Регулярно создавайте резервные копии базы данных
4. Мониторьте использование ресурсов
5. Настройте логирование и алертинг
6. Обновляйте SSL-сертификаты до истечения срока
7. Регулярно проверяйте безопасность системы