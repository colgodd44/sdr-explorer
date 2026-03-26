'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const FREQUENCY_BANDS = [
  { name: 'AM Broadcast', min: 530, max: 1700, unit: 'kHz', color: '#ff4466' },
  { name: 'Shortwave', min: 3000, max: 30000, unit: 'kHz', color: '#ffcc00' },
  { name: 'CB Radio', min: 26000, max: 28000, unit: 'kHz', color: '#ff9900' },
  { name: 'Airband', min: 118000, max: 137000, unit: 'kHz', color: '#00aaff' },
  { name: 'VHF TV', min: 174000, max: 216000, unit: 'kHz', color: '#aa66ff' },
  { name: 'FM Broadcast', min: 88000000, max: 108000000, unit: 'Hz', color: '#00ff88' },
  { name: 'Airband', min: 118000000, max: 137000000, unit: 'Hz', color: '#00aaff' },
  { name: 'Weather', min: 162400000, max: 162550000, unit: 'Hz', color: '#ffcc00' },
  { name: 'Family Radio', min: 462500000, max: 467500000, unit: 'Hz', color: '#ff6688' },
  { name: 'Ham 2m', min: 144000000, max: 148000000, unit: 'Hz', color: '#66ff66' },
  { name: 'Ham 70cm', min: 420000000, max: 450000000, unit: 'Hz', color: '#66ffff' },
  { name: 'ISM Band', min: 2400000000, max: 2500000000, unit: 'Hz', color: '#ff66ff' },
];

const BAND_PRESETS = [
  { name: 'AM', band: FREQUENCY_BANDS[0] },
  { name: 'SW', band: FREQUENCY_BANDS[1] },
  { name: 'AIR', band: FREQUENCY_BANDS[3] },
  { name: 'FM', band: FREQUENCY_BANDS[5] },
  { name: 'WX', band: FREQUENCY_BANDS[7] },
  { name: 'FRS', band: FREQUENCY_BANDS[8] },
];

const SIGNAL_TYPES = [
  { mode: 'AM', desc: 'Amplitude Modulation' },
  { mode: 'FM', desc: 'Frequency Modulation' },
  { mode: 'USB', desc: 'Upper Sideband' },
  { mode: 'LSB', desc: 'Lower Sideband' },
  { mode: 'CW', desc: 'Continuous Wave' },
];

export default function SDRExplorer() {
  const [centerFreq, setCenterFreq] = useState(100000000);
  const [bandwidth, setBandwidth] = useState(5000000);
  const [selectedBand, setSelectedBand] = useState(FREQUENCY_BANDS[5]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(70);
  const [mode, setMode] = useState('FM');
  const [signalStrength, setSignalStrength] = useState(45);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  const formatFrequency = (freq: number): string => {
    if (freq >= 1000000000) {
      return `${(freq / 1000000000).toFixed(3)} GHz`;
    } else if (freq >= 1000000) {
      return `${(freq / 1000000).toFixed(3)} MHz`;
    } else if (freq >= 1000) {
      return `${(freq / 1000).toFixed(1)} kHz`;
    }
    return `${freq} Hz`;
  };

  const generateSignal = useCallback((freq: number): number => {
    const bandStart = centerFreq - bandwidth / 2;
    const normalizedPos = (freq - bandStart) / bandwidth;
    
    let signal = Math.random() * 0.1;
    
    const carrierPos = Math.random();
    if (carrierPos > 0.85) {
      const carrierFreq = bandStart + Math.random() * bandwidth;
      const distFromCarrier = Math.abs(normalizedPos - (carrierFreq - bandStart) / bandwidth);
      signal += Math.exp(-distFromCarrier * 20) * (0.3 + Math.random() * 0.5);
    }
    
    for (let i = 0; i < 3; i++) {
      const randomFreq = Math.random();
      const dist = Math.abs(normalizedPos - randomFreq);
      signal += Math.exp(-dist * 30) * 0.2;
    }
    
    if (Math.random() > 0.98) {
      const dist = Math.abs(normalizedPos - 0.5);
      signal += Math.exp(-dist * 10) * 0.6;
    }
    
    return Math.min(1, Math.max(0, signal));
  }, [centerFreq, bandwidth]);

  const drawWaterfall = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imageData = ctx.createImageData(canvas.width, canvas.height);
    const data = imageData.data;

    for (let y = 0; y < canvas.height - 1; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        const nextI = ((y + 1) * canvas.width + x) * 4;
        data[i] = data[nextI];
        data[i + 1] = data[nextI + 1];
        data[i + 2] = data[nextI + 2];
        data[i + 3] = 255;
      }
    }

    const bottomY = canvas.height - 1;
    for (let x = 0; x < canvas.width; x++) {
      const freq = centerFreq - bandwidth / 2 + (x / canvas.width) * bandwidth;
      const signal = generateSignal(freq);
      const i = (bottomY * canvas.width + x) * 4;
      
      const hue = 120 + (1 - signal) * 120;
      const sat = signal * 100;
      const light = 10 + signal * 50;
      
      if (signal > 0.1) {
        const r = signal > 0.5 ? 255 : signal * 2 * 255;
        const g = signal > 0.7 ? 255 : signal > 0.3 ? (signal - 0.3) * 500 : signal * 2 * 255;
        const b = signal < 0.3 ? 255 : signal < 0.5 ? (0.5 - signal) * 500 : signal * 255;
        data[i] = Math.min(255, r + Math.random() * 50);
        data[i + 1] = Math.min(255, g + Math.random() * 50);
        data[i + 2] = Math.min(255, b + Math.random() * 50);
      } else {
        data[i] = 0;
        data[i + 1] = Math.floor(signal * 20);
        data[i + 2] = Math.floor(signal * 30);
      }
      data[i + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);

    animationRef.current = requestAnimationFrame(drawWaterfall);
  }, [centerFreq, bandwidth, generateSignal]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    drawWaterfall();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [drawWaterfall]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSignalStrength(40 + Math.random() * 30);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const toggleAudio = () => {
    if (isPlaying) {
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      setIsPlaying(false);
    } else {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.type = 'sine' as OscillatorType;
      oscillator.frequency.value = 1000;
      gainNode.gain.value = volume / 100 * 0.3;
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.start();
      oscillatorRef.current = oscillator;
      gainRef.current = gainNode;
      
      setIsPlaying(true);
    }
  };

  useEffect(() => {
    if (gainRef.current) {
      gainRef.current.gain.value = isPlaying ? volume / 100 * 0.3 : 0;
    }
  }, [volume, isPlaying]);

  const selectBand = (band: typeof FREQUENCY_BANDS[0]) => {
    setSelectedBand(band);
    setCenterFreq((band.min + band.max) / 2);
    setBandwidth((band.max - band.min) * 0.8);
  };

  const adjustFrequency = (delta: number) => {
    const newFreq = centerFreq + delta;
    const bandStart = selectedBand.min;
    const bandEnd = selectedBand.max;
    
    if (newFreq >= bandStart && newFreq <= bandEnd) {
      setCenterFreq(newFreq);
    }
  };

  return (
    <div className="app">
      <div className="header">
        <div className="logo">SDR <span>Explorer</span></div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          v1.0
        </div>
      </div>

      <div className="content">
        <div className="card">
          <div className="waterfall-container">
            <canvas ref={canvasRef} className="waterfall-canvas" />
            <div className="spectrum-overlay" />
            <div className="frequency-display">
              <span>{formatFrequency(centerFreq - bandwidth / 2)}</span>
              <span>{formatFrequency(centerFreq)}</span>
              <span>{formatFrequency(centerFreq + bandwidth / 2)}</span>
            </div>
            <div className="tuner-marker" />
            <div className="tuner-info">
              {formatFrequency(centerFreq)} • {mode}
            </div>
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Frequency Controls
          </div>
          <div className="freq-controls">
            <button 
              className="freq-btn"
              onClick={() => adjustFrequency(-bandwidth * 0.1)}
              style={{ fontSize: 20 }}
            >
              ◀◀
              <span className="freq-btn-label">-10%</span>
            </button>
            <button 
              className="freq-btn"
              onClick={() => adjustFrequency(-bandwidth * 0.01)}
              style={{ fontSize: 20 }}
            >
              ◀
              <span className="freq-btn-label">-1%</span>
            </button>
            <button 
              className="freq-btn"
              onClick={() => setCenterFreq((selectedBand.min + selectedBand.max) / 2)}
            >
              ⬤
              <span className="freq-btn-label">Center</span>
            </button>
            <button 
              className="freq-btn"
              onClick={() => adjustFrequency(bandwidth * 0.01)}
              style={{ fontSize: 20 }}
            >
              ▶
              <span className="freq-btn-label">+1%</span>
            </button>
            <button 
              className="freq-btn"
              onClick={() => adjustFrequency(bandwidth * 0.1)}
              style={{ fontSize: 20 }}
            >
              ▶▶
              <span className="freq-btn-label">+10%</span>
            </button>
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Band Presets
          </div>
          <div className="band-selector">
            {BAND_PRESETS.map((preset) => (
              <button
                key={preset.name}
                className={`band-btn ${selectedBand.name === preset.band.name ? 'active' : ''}`}
                onClick={() => selectBand(preset.band)}
              >
                <div className="band-btn-name">{preset.name}</div>
                <div className="band-btn-range">{preset.band.name}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
            All Frequency Bands
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {FREQUENCY_BANDS.map((band) => (
              <button
                key={band.name}
                className={`band-btn ${selectedBand.name === band.name ? 'active' : ''}`}
                onClick={() => selectBand(band)}
                style={{ 
                  flexBasis: 'calc(33% - 6px)',
                  background: selectedBand.name === band.name ? `${band.color}22` : undefined,
                  borderColor: selectedBand.name === band.name ? band.color : undefined,
                  color: selectedBand.name === band.name ? band.color : undefined,
                }}
              >
                <div className="band-btn-name">{band.name}</div>
                <div className="band-btn-range">{band.min / 1000 >= 1000 ? `${band.min / 1000000}MHz` : `${band.min / 1000}kHz`}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Demodulation Mode
          </div>
          <div className="mode-selector">
            {SIGNAL_TYPES.map((type) => (
              <button
                key={type.mode}
                className={`mode-btn ${mode === type.mode ? 'active' : ''}`}
                onClick={() => setMode(type.mode)}
              >
                {type.mode}
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Audio Output
          </div>
          <div className="audio-controls">
            <button 
              className={`play-btn ${isPlaying ? 'playing' : ''}`}
              onClick={toggleAudio}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
            <input
              type="range"
              className="volume-slider"
              min="0"
              max="100"
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
            />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 35 }}>
              {volume}%
            </span>
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Signal Meters
          </div>
          <div className="meter-display">
            <div className="meter">
              <div className="meter-value">{signalStrength.toFixed(0)}</div>
              <div className="meter-label">Signal (dB)</div>
            </div>
            <div className="meter">
              <div className="meter-value" style={{ color: 'var(--accent-blue)' }}>0</div>
              <div className="meter-label">SNR (dB)</div>
            </div>
            <div className="meter">
              <div className="meter-value" style={{ color: 'var(--accent-yellow)' }}>{(bandwidth / 1000000).toFixed(1)}</div>
              <div className="meter-label">BW (MHz)</div>
            </div>
          </div>
        </div>
      </div>

      <div className="status-bar">
        <div className="status-item">
          <div className="status-dot" />
          <span>SDR Connected</span>
        </div>
        <div className="status-item">
          <div className="signal-strength">
            {[20, 35, 50, 65, 80].map((h, i) => (
              <div 
                key={i} 
                className="signal-bar" 
                style={{ 
                  height: h,
                  opacity: signalStrength > i * 20 ? 1 : 0.3 
                }} 
              />
            ))}
          </div>
        </div>
        <div className="status-item">
          <span>CPU: {(20 + Math.random() * 10).toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
}
