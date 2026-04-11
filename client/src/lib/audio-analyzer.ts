// client/src/lib/audio-analyzer.ts

export class AudioAnalyzer {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private silentGain: GainNode | null = null;
  private dataArray: Uint8Array<ArrayBuffer> | null = null;
  private timeDomainArray: Uint8Array<ArrayBuffer> | null = null;

  // Калибровка для речевого сигнала
  private static readonly RMS_NOISE_GATE = 0.012;
  private static readonly RMS_MAX = 0.22;
  private static readonly FREQ_NOISE_FLOOR = 16;
  private static readonly FREQ_CEILING = 140;
  private static readonly BAR_GAMMA = 1.8;
  
  async initializeFromStream(stream: MediaStream): Promise<void> {
    this.destroy();

    // Создаем AudioContext
    this.audioContext = new AudioContext();
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    
    // Создаем анализатор
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.86;
    
    // Подключаем микрофон
    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(this.analyser);

    // Без пути до destination Web Audio граф не рендерится и AnalyserNode
    // не получает данных (getByteTimeDomainData возвращает 128 = тишина).
    // Добавляем нулевой gain → destination чтобы принудить рендеринг графа
    // без фактического вывода звука на колонки.
    this.silentGain = this.audioContext.createGain();
    this.silentGain.gain.value = 0;
    this.analyser.connect(this.silentGain);
    this.silentGain.connect(this.audioContext.destination);

    // Создаем массив для данных
    const bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(new ArrayBuffer(bufferLength));
    this.timeDomainArray = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
  }
  
  getLevel(): number {
    if (!this.analyser || !this.timeDomainArray) return 0;

    // Общий уровень считаем по RMS во временной области — это стабильнее для речи.
    this.analyser.getByteTimeDomainData(this.timeDomainArray);

    let squares = 0;
    for (const sample of this.timeDomainArray) {
      const centered = (sample - 128) / 128;
      squares += centered * centered;
    }

    const rms = Math.sqrt(squares / this.timeDomainArray.length);
    const gated = Math.max(0, rms - AudioAnalyzer.RMS_NOISE_GATE);
    const normalized = gated / (AudioAnalyzer.RMS_MAX - AudioAnalyzer.RMS_NOISE_GATE);
    const compressed = Math.pow(Math.max(0, Math.min(1, normalized)), 0.72);

    return Math.max(0, Math.min(100, compressed * 100));
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
      const floored = Math.max(0, average - AudioAnalyzer.FREQ_NOISE_FLOOR);
      const normalized = floored / (AudioAnalyzer.FREQ_CEILING - AudioAnalyzer.FREQ_NOISE_FLOOR);
      const clamped = Math.max(0, Math.min(1, normalized));
      const compressed = Math.pow(clamped, AudioAnalyzer.BAR_GAMMA);
      bars.push(Math.max(0, Math.min(100, compressed * 100)));
    }
    
    return bars;
  }
  
  destroy(): void {
    try {
      this.silentGain?.disconnect();
      this.analyser?.disconnect();
    } catch { /* уже отключены */ }

    if (this.audioContext) {
      void this.audioContext.close();
    }

    this.audioContext = null;
    this.analyser = null;
    this.silentGain = null;
    this.dataArray = null;
    this.timeDomainArray = null;
  }
}
