import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const PORTS = [3000, 5000, 5432];

async function killPortProcesses() {
  console.log('🔥 Принудительно освобождаю порты для проекта Voxlibris Platform...');
  
  for (const port of PORTS) {
    try {
      // Найти процессы использующие порт
      const { stdout } = await execAsync(`lsof -ti:${port}`);
      
      if (stdout.trim()) {
        // Убить найденные процессы
        const pids = stdout.trim().split('\n');
        for (const pid of pids) {
          try {
            await execAsync(`kill -9 ${pid}`);
            console.log(`🔥 Порт ${port} принудительно освобожден (PID: ${pid})`);
          } catch {
            // PID уже мертв
          }
        }
      } else {
        console.log(`✅ Порт ${port} свободен`);
      }
    } catch (error) {
      // Ошибка означает что порт свободен
      console.log(`✅ Порт ${port} свободен`);
    }
  }

  // Дополнительная проверка Docker контейнеров PostgreSQL
  try {
    const { stdout } = await execAsync(`docker ps --filter "publish=5432" --format "{{.ID}}"`);
    if (stdout.trim()) {
      const containerIds = stdout.trim().split('\n');
      for (const containerId of containerIds) {
        try {
          await execAsync(`docker stop ${containerId}`);
          console.log(`🐳 Docker контейнер PostgreSQL остановлен: ${containerId}`);
        } catch {
          // Контейнер уже остановлен
        }
      }
    }
  } catch {
    // Docker не установлен или нет запущенных контейнеров
  }

  console.log('🎯 Проверка портов завершена. Готово к запуску проекта.');
}

// Запустить если скрипт вызван напрямую
if (import.meta.url === `file://${process.argv[1]}`) {
  killPortProcesses().catch(console.error);
}

export { killPortProcesses };