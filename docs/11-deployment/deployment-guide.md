# Руководство по развертыванию

## Введение

Это руководство описывает процесс развертывания приложения VoxLibris в production-среде. В нем рассматриваются требования, подготовка среды, настройка компонентов и запуск приложения.

## Системные требования

### Минимальные требования

- **CPU**: 2 ядра
- **RAM**: 4 GB
- **Storage**: 20 GB
- **OS**: Linux (Ubuntu 20.04 LTS или новее)
- **Node.js**: 20.0.0 или новее
- **PostgreSQL**: 14 или новее
- **Redis**: 6.0 или новее

### Рекомендуемые требования

- **CPU**: 4 ядра
- **RAM**: 8 GB
- **Storage**: 50 GB SSD
- **OS**: Linux (Ubuntu 22.04 LTS)
- **Node.js**: 22 или новее
- **PostgreSQL**: 15
- **Redis**: 7.0 или новее

## Подготовка среды

### Установка зависимостей

1. Установите Node.js:

```bash
# Установка nvm (если еще не установлен)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc

# Установка Node.js
nvm install 22
nvm use 22
nvm alias default 22

# Проверка установки
node --version
npm --version
```

2. Установите pnpm:

```bash
npm install -g pnpm@9
```

3. Установите PostgreSQL:

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

4. Установите Redis:

```bash
sudo apt install redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

### Настройка базы данных

1. Создайте пользователя и базу данных:

```bash
sudo -u postgres psql
CREATE USER voxlibris WITH PASSWORD 'your_secure_password';
CREATE DATABASE voxlibris OWNER voxlibris;
GRANT ALL PRIVILEGES ON DATABASE voxlibris TO voxlibris;
\q
```

2. Проверьте подключение:

```bash
psql -h localhost -U voxlibris -d voxlibris -W
```

### Настройка файлового хранилища

Приложение использует S3-совместимое хранилище. Вы можете использовать:

- AWS S3
- MinIO (локальное решение)
- DigitalOcean Spaces
- Другой S3-совместимый сервис

Для локальной установки с MinIO:

1. Установите MinIO:

```bash
wget https://dl.min.io/server/minio/release/linux-amd64/archive/minio_20230904010410.0.0_amd64.deb
sudo dpkg -i minio_20230904010410.0.0_amd64.deb
```

2. Создайте пользователя и настройте MinIO:

```bash
mkdir -p /data/voxlibris
export MINIO_ROOT_USER=admin
export MINIO_ROOT_PASSWORD=admin12345
minio server /data/voxlibris &
```

3. Создайте bucket для приложения:

```bash
# Установите mc (MinIO client)
wget https://dl.min.io/client/mc/release/linux-amd64/archive/mc_20230904002658_0_gf07a7ae_linux_amd64.tar.gz
tar -xf mc_20230904002658_0_gf07a7ae_linux_amd64.tar.gz
./mc --help

# Настройте подключение
./mc alias set voxlibris-local http://localhost:9000 admin admin12345

# Создайте bucket
./mc mb voxlibris-local/voxlibris-uploads
./mc mb voxlibris-local/voxlibris-covers
```

## Настройка приложения

### Клонирование репозитория

```bash
git clone https://github.com/your-org/voxlibris.git
cd voxlibris
```

### Установка зависимостей

```bash
pnpm install
```

### Настройка переменных окружения

Создайте файл `.env` на основе `.env.example`:

```bash
cp .env.example .env
```

Заполните значения:

```
NODE_ENV=production
PORT=5000

# Database
DATABASE_URL="postgresql://voxlibris:your_secure_password@localhost:5432/voxlibris"

# Redis (for rate limiting)
REDIS_URL="redis://localhost:6379"
REDIS_PASSWORD=""

# JWT
JWT_SECRET="your_very_secure_jwt_secret_here"
JWT_REFRESH_SECRET="your_very_secure_refresh_secret_here"

# File storage (S3 compatible)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=admin
S3_SECRET_ACCESS_KEY=admin12345
S3_BUCKET_NAME=voxlibris-uploads
S3_REGION=us-east-1
S3_FORCE_PATH_STYLE=true

# SMTP
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
SMTP_FROM=noreply@yourdomain.com

# Public URL
PUBLIC_BASE_URL=https://yourdomain.com

# Rate limiting
RL_ANON_BURST_WINDOW_MS=5000
RL_ANON_BURST_MAX=5
RL_ANON_READ_WINDOW_MS=60000
RL_ANON_READ_MAX=120
RL_ANON_WRITE_WINDOW_MS=900000
RL_ANON_WRITE_MAX=30
RL_AUTH_READ_WINDOW_MS=900000
RL_AUTH_READ_MAX=1200
RL_AUTH_WRITE_WINDOW_MS=900000
RL_AUTH_WRITE_MAX=300
RL_EXPENSIVE_WINDOW_MS=900000
RL_EXPENSIVE_MAX=30
```

## Развертывание

### Миграция базы данных

Примените миграции к базе данных:

```bash
pnpm run db:push
```

Или выполните миграции по отдельности:

```bash
npx drizzle-kit migrate
```

### Сборка приложения

```bash
pnpm run build
```

### Инициализация хранилища

```bash
pnpm run init-storage
```

### Запуск приложения

#### Вариант 1: Прямой запуск

```bash
pnpm run start
```

#### Вариант 2: Использование PM2

Установите PM2:

```bash
npm install -g pm2
```

Создайте файл `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'voxlibris',
    script: './dist/server/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    }
  }]
};
```

Запустите приложение:

```bash
pm2 start ecosystem.config.js
pm2 startup
pm2 save
```

#### Вариант 3: Использование Docker

Соберите образ:

```bash
docker build -t voxlibris .
```

Запустите контейнер:

```bash
docker run -d \
  --name voxlibris \
  -p 5000:5000 \
  --env-file .env \
  --restart unless-stopped \
  voxlibris
```

## Настройка Reverse Proxy

### Nginx

Создайте конфигурацию для Nginx:

```
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;

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
        
        # Для файловых загрузок
        client_max_body_size 50M;
    }
}
```

### SSL сертификат

Установите SSL сертификат через Let's Encrypt:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

## Мониторинг и обслуживание

### Проверка состояния

Создайте скрипт проверки состояния:

```bash
#!/bin/bash
# health-check.sh

# Проверка порта
if ! nc -z localhost 5000; then
    echo "Application is not running on port 5000"
    exit 1
fi

# Проверка базы данных
if ! pg_isready -h localhost -U voxlibris; then
    echo "Database is not ready"
    exit 1
fi

echo "All services are running"
exit 0
```

### Резервное копирование

Создайте скрипт резервного копирования:

```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/voxlibris"

mkdir -p $BACKUP_DIR

# Резервная копия базы данных
pg_dump -h localhost -U voxlibris voxlibris > $BACKUP_DIR/db_$DATE.sql

# Резервная копия загруженных файлов (адаптируйте под вашу конфигурацию)
# rsync -av /path/to/uploads/ $BACKUP_DIR/uploads_$DATE/

# Удаление резервных копий старше 30 дней
find $BACKUP_DIR -type f -mtime +30 -delete
```

### Логирование

Настройте ротацию логов:

```bash
sudo nano /etc/logrotate.d/voxlibris
```

Содержимое файла:

```
/var/log/voxlibris/*.log {
    daily
    missingok
    rotate 52
    compress
    notifempty
    create 644 your_user your_group
    postrotate
        # Если используете PM2
        # PM2_HOME=/home/your_user/.pm2 pm2 reloadLogs
    endscript
}
```

## Обновление приложения

### Обновление кода

1. Остановите приложение:

```bash
# Если используете PM2
pm2 stop voxlibris

# Если запускаете напрямую
# Найдите PID и убейте процесс
```

2. Обновите код:

```bash
git pull origin main
pnpm install
pnpm run build
```

3. Примените миграции:

```bash
pnpm run db:migrate
```

4. Запустите приложение:

```bash
# Если используете PM2
pm2 start voxlibris

# Если запускаете напрямую
pnpm run start
```

## Устранение неполадок

### Проверка состояния сервисов

```bash
# Проверка состояния PostgreSQL
sudo systemctl status postgresql

# Проверка состояния Redis
sudo systemctl status redis-server

# Проверка открытых портов
sudo netstat -tlnp | grep :5000
```

### Проверка логов

```bash
# Если используете PM2
pm2 logs voxlibris

# Логи PostgreSQL
sudo tail -f /var/log/postgresql/postgresql-*.log

# Логи Nginx
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

### Проблемы с производительностью

- Проверьте использование ресурсов: `htop`
- Проверьте подключения к базе данных: `\du` в psql
- Проверьте размер базы данных:

```sql
SELECT pg_size_pretty(pg_database_size('voxlibris'));
```

## Заключение

После завершения установки ваш экземпляр VoxLibris должен быть доступен по настроенному домену. Убедитесь, что все компоненты работают должным образом, и настройте регулярные резервные копии для обеспечения надежности системы.