// client/src/lib/audio-analyzer.ts

export class AudioAnalyzer {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array<ArrayBuffer> | null = null;
  
  async initializeFromStream(stream: MediaStream): Promise<void> {
    this.destroy();

    // Создаем AudioContext
    this.audioContext = new AudioContext();
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    
    // Создаем анализатор
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.8;
    
    // Подключаем микрофон
    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(this.analyser);
    
    // Создаем массив для данных
    const bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(new ArrayBuffer(bufferLength));
    
    console.log('[AudioAnalyzer] Initialized successfully');
  }
  
  getLevel(): number {
    if (!this.analyser || !this.dataArray) return 0;
    
    // Получаем данные частот
    this.analyser.getByteFrequencyData(this.dataArray);
    
    // Вычисляем средний уровень
    let sum = 0;
    for (const value of this.dataArray) {
      sum += value;
    }
    const average = sum / this.dataArray.length;
    
    // Нормализуем к 0-100
    return Math.min(100, (average / 128) * 100);
  }
  
  getBars(count: number = 20): number[] {
    if (!this.analyser || !this.dataArray) {
      return new Array(count).fill(0);
    }
    
    this.analyser.getByteFrequencyData(this.dataArray);
    
    const bars: number[] = [];
    const step = Math.max(1, Math.floor(this.dataArray.length / count));
    
    for (let i = 0; i < count; i++) {
      const start = i * step;
      const end = start + step;
      let sum = 0;
      
      for (let j = start; j < end && j < this.dataArray.length; j++) {
        sum += this.dataArray[j];
      }
      
      const average = sum / step;
      // Нормализуем к 0-100
      bars.push(Math.min(100, (average / 128) * 100));
    }
    
    return bars;
  }
  
  destroy(): void {
    if (this.audioContext) {
      void this.audioContext.close();
    }
    
    this.audioContext = null;
    this.analyser = null;
    this.dataArray = null;
    
    console.log('[AudioAnalyzer] Destroyed');
  }
}
