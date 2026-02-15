# Резервное копирование и восстановление

## Обзор

В этом разделе описаны процедуры резервного копирования и восстановления данных приложения VoxLibris. Регулярное резервное копирование обеспечивает возможность восстановления данных в случае сбоев или потерь.

## Компоненты системы, требующие резервного копирования

### 1. База данных PostgreSQL

Основной компонент, требующий резервного копирования - это база данных PostgreSQL, содержащая:
- Пользовательские аккаунты и профили
- Информацию о клубах и участниках
- Данные о книгах и сессиях чтения
- Прогресс чтения пользователей
- Уведомления и сообщения

### 2. Файловое хранилище

Важные файлы, требующие резервного копирования:
- Загруженные книги (EPUB, PDF, FB2 и т.д.)
- Обложки книг
- Аватары пользователей
- Аудиозаписи сессий (если используются)

### 3. Конфигурационные файлы

Конфигурационные файлы, которые также должны быть включены в резервную копию:
- Файлы окружения (.env.production)
- Docker-конфигурации
- SSL-сертификаты
- Конфигурации nginx

## Резервное копирование базы данных

### Полное резервное копирование

Для создания полной резервной копии базы данных используйте `pg_dump`:

```bash
# Полное резервное копирование
pg_dump -h localhost -U voxlibris -d voxlibris -Fc > backup_$(date +%Y%m%d_%H%M%S).dump

# Или с указанием пароля
PGPASSWORD=your_password pg_dump -h localhost -U voxlibris -d voxlibris -Fc > backup_$(date +%Y%m%d_%H%M%S).dump
```

### Инкрементальное резервное копирование

Для ежедневных резервных копий можно использовать архивирование WAL (Write-Ahead Logging):

```bash
# Включите WAL archiving в postgresql.conf
wal_level = replica
archive_mode = on
archive_command = 'cp %p /path/to/archive/%f'
```

### Автоматизация резервного копирования

Создайте скрипт для автоматического резервного копирования:

```bash
#!/bin/bash
# backup_db.sh

DB_NAME="voxlibris"
DB_USER="voxlibris"
BACKUP_DIR="/var/backups/voxlibris/db"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

# Создание директории для резервных копий
mkdir -p $BACKUP_DIR

# Создание резервной копии
PGPASSWORD=your_password pg_dump -h localhost -U $DB_USER -d $DB_NAME -Fc > "$BACKUP_DIR/backup_$DATE.dump"

# Удаление старых резервных копий
find $BACKUP_DIR -name "*.dump" -mtime +$RETENTION_DAYS -delete
```

Добавьте задачу в crontab:

```bash
# Ежедневно в 2 часа ночи
0 2 * * * /path/to/backup_db.sh >> /var/log/backup.log 2>&1
```

## Резервное копирование файлового хранилища

### Локальное хранилище

Если используется локальное хранилище:

```bash
#!/bin/bash
# backup_storage.sh

STORAGE_PATH="/var/lib/voxlibris/uploads"
BACKUP_DIR="/var/backups/voxlibris/storage"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

# Создание архива
tar -czf "$BACKUP_DIR/storage_$DATE.tar.gz" -C "$(dirname $STORAGE_PATH)" "$(basename $STORAGE_PATH)"

# Удаление старых резервных копий
find $BACKUP_DIR -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete
```

### S3/MinIO хранилище

Для S3-совместимого хранилища используйте `mc` (MinIO Client) или `aws cli`:

```bash
# Установка mc
wget https://dl.min.io/client/mc/release/linux-amd64/mc
chmod +x mc
sudo mv mc /usr/local/bin

# Резервное копирование с использованием mc
mc mirror voxlibris-origin voxlibris-backup

# Или с использованием aws cli
aws s3 sync s3://voxlibris-origin-bucket s3://voxlibris-backup-bucket
```

## Комплексный скрипт резервного копирования

Создайте комплексный скрипт, объединяющий все компоненты:

```bash
#!/bin/bash
# full_backup.sh

# Конфигурация
APP_NAME="voxlibris"
DB_NAME="voxlibris"
DB_USER="voxlibris"
STORAGE_PATH="/var/lib/voxlibris/uploads"
CONFIG_PATH="/etc/voxlibris"
BACKUP_DIR="/var/backups/$APP_NAME"
LOG_FILE="/var/log/backup.log"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

# Путь к паролю БД
export PGPASSWORD="your_database_password"

# Создание директории для резервных копий
mkdir -p $BACKUP_DIR

log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> $LOG_FILE
}

log_message "=== Starting backup of $APP_NAME ==="

# Резервное копирование базы данных
log_message "Backing up database..."
DB_BACKUP="$BACKUP_DIR/db_${DATE}.dump"
pg_dump -h localhost -U $DB_USER -d $DB_NAME -Fc > $DB_BACKUP
if [ $? -eq 0 ]; then
    log_message "Database backup completed: $DB_BACKUP"
else
    log_message "Database backup failed"
    exit 1
fi

# Резервное копирование файлового хранилища
log_message "Backing up storage..."
STORAGE_BACKUP="$BACKUP_DIR/storage_${DATE}.tar.gz"
tar -czf $STORAGE_BACKUP -C "$(dirname $STORAGE_PATH)" "$(basename $STORAGE_PATH)"
if [ $? -eq 0 ]; then
    log_message "Storage backup completed: $STORAGE_BACKUP"
else
    log_message "Storage backup failed"
    exit 1
fi

# Резервное копирование конфигураций
log_message "Backing up configurations..."
CONFIG_BACKUP="$BACKUP_DIR/config_${DATE}.tar.gz"
tar -czf $CONFIG_BACKUP -C "$(dirname $CONFIG_PATH)" "$(basename $CONFIG_PATH)"
if [ $? -eq 0 ]; then
    log_message "Configuration backup completed: $CONFIG_BACKUP"
else
    log_message "Configuration backup failed"
    exit 1
fi

# Удаление старых резервных копий
log_message "Cleaning up old backups..."
find $BACKUP_DIR -name "db_*.dump" -mtime +$RETENTION_DAYS -delete
find $BACKUP_DIR -name "storage_*.tar.gz" -mtime +$RETENTION_DAYS -delete
find $BACKUP_DIR -name "config_*.tar.gz" -mtime +$RETENTION_DAYS -delete

log_message "=== Backup completed successfully ==="
```

## Восстановление из резервной копии

### Восстановление базы данных

```bash
# Восстановление из полной резервной копии
pg_restore -h localhost -U voxlibris -d voxlibris --clean --no-owner --no-privileges backup_file.dump

# Если база данных не существует, создайте её
psql -h localhost -U postgres -c "CREATE DATABASE voxlibris OWNER voxlibris;"
pg_restore -h localhost -U voxlibris -d voxlibris --clean --no-owner --no-privileges backup_file.dump
```

### Восстановление файлового хранилища

```bash
# Извлечение архива локального хранилища
tar -xzf storage_backup.tar.gz -C /var/lib/voxlibris/

# Или восстановление из S3
aws s3 sync s3://voxlibris-backup-bucket s3://voxlibris-origin-bucket
```

### Полное восстановление системы

Шаги для полного восстановления:

1. Установите приложение VoxLibris на новый сервер
2. Восстановите базу данных
3. Восстановите файловое хранилище
4. Скопируйте конфигурационные файлы
5. Запустите приложение

## Проверка резервных копий

### Проверка целостности резервных копий базы данных

```bash
# Проверка дампа
pg_restore --list backup_file.dump

# Восстановление в тестовую базу данных для проверки
createdb voxlibris_test
pg_restore -d voxlibris_test --clean --no-owner --no-privileges backup_file.dump
dropdb voxlibris_test
```

### Проверка файлового хранилища

```bash
# Проверка целостности архива
tar -tzf storage_backup.tar.gz > /dev/null && echo "Archive OK" || echo "Archive Corrupted"

# Проверка контрольных сумм
md5sum -c storage_backup.tar.gz.md5
```

## Хранение резервных копий

### Локальное хранение

- Храните резервные копии на отдельном физическом носителе
- Используйте RAID для защиты от аппаратных сбоев
- Обеспечьте регулярную проверку целостности копий

### Облачное хранение

- Используйте надежные облачные сервисы (AWS S3, Google Cloud Storage)
- Шифруйте резервные копии перед загрузкой
- Используйте географически распределенные хранилища

## Рекомендации

1. **Выполняйте регулярные резервные копии** - ежедневно для продакшена
2. **Проверяйте резервные копии** - регулярно тестируйте восстановление
3. **Храните копии в разных местах** - локально и в облаке
4. **Шифруйте чувствительные данные** - особенно в облачном хранении
5. **Автоматизируйте процесс** - используйте cron или другие планировщики
6. **Документируйте процедуры восстановления** - чтобы быстро восстановить систему
7. **Удаляйте устаревшие копии** - освобождайте место по истечении срока хранения
8. **Создавайте резервные копии перед обновлениями** - для возможности отката
9. **Мониторьте процесс резервного копирования** - проверяйте логи
10. **Тестируйте восстановление в тестовой среде** - перед использованием в продакшене