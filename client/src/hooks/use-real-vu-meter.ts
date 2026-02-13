// client/src/hooks/use-real-vu-meter.ts

import { useEffect, useRef, useState } from 'react';
import { AudioAnalyzer } from '@/lib/audio-analyzer';

interface UseRealVUMeterOptions {
  stream: MediaStream | null;
  isActive: boolean;
}

export function useRealVUMeter({ stream, isActive }: UseRealVUMeterOptions) {
  const [level, setLevel] = useState(0);
  const [bars, setBars] = useState<number[]>(Array(20).fill(0));
  const analyzerRef = useRef<AudioAnalyzer | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const resetVisualization = () => {
    setLevel(0);
    setBars(Array(20).fill(0));
  };
  
  useEffect(() => {
    let isCancelled = false;

    if (!stream || !isActive) {
      resetVisualization();
      
      // Очищаем анализатор
      if (analyzerRef.current) {
        analyzerRef.current.destroy();
        analyzerRef.current = null;
      }

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      return;
    }
    
    // Инициализируем анализатор
    const analyzer = new AudioAnalyzer();
    analyzerRef.current = analyzer;
    
    void analyzer.initializeFromStream(stream)
      .then(() => {
        if (isCancelled) return;

        // Запускаем анимационный цикл
        const updateVisualization = () => {
          if (!analyzerRef.current || isCancelled) return;

          setLevel(analyzerRef.current.getLevel());
          setBars(analyzerRef.current.getBars(20));
          animationFrameRef.current = requestAnimationFrame(updateVisualization);
        };
        
        updateVisualization();
      })
      .catch((error) => {
        console.error('[VUMeter] Failed to initialize audio analyzer:', error);
        resetVisualization();
      });
    
    return () => {
      isCancelled = true;

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      if (analyzerRef.current) {
        analyzerRef.current.destroy();
        analyzerRef.current = null;
      }
    };
  }, [stream, isActive]);
  
  return { level, bars };
}
