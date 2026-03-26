'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const FREQUENCY_BANDS = [
  { name: 'AM Broadcast', min: 530000, max: 1700000, display: '0.53-1.7 MHz', color: '#ff4466' },
  { name: 'Shortwave', min: 3000000, max: 30000000, display: '3-30 MHz', color: '#ffcc00' },
  { name: 'CB Radio', min: 26000000, max: 28000000, display: '26-28 MHz', color: '#ff9900' },
  { name: 'Airband', min: 118000000, max: 137000000, display: '118-137 MHz', color: '#00aaff' },
  { name: 'VHF TV', min: 174000000, max: 216000000, display: '174-216 MHz', color: '#aa66ff' },
  { name: 'FM Broadcast', min: 88000000, max: 108000000, display: '88-108 MHz', color: '#00ff88' },
  { name: 'Weather Sat', min: 137000000, max: 138000000, display: '137-138 MHz', color: '#ffcc00' },
  { name: 'NOAA Weather', min: 162400000, max: 162550000, display: '162.4-162.55 MHz', color: '#ff6600' },
  { name: 'Family Radio', min: 462500000, max: 467500000, display: '462-467 MHz', color: '#ff6688' },
  { name: 'Ham 2m', min: 144000000, max: 148000000, display: '144-148 MHz', color: '#66ff66' },
  { name: 'Ham 70cm', min: 420000000, max: 450000000, display: '420-450 MHz', color: '#66ffff' },
  { name: 'ISM 2.4GHz', min: 2400000000, max: 2500000000, display: '2.4-2.5 GHz', color: '#ff66ff' },
];

const BAND_PRESETS = [
  { name: 'FM', band: FREQUENCY_BANDS[5] },
  { name: 'AM', band: FREQUENCY_BANDS[0] },
  { name: 'SW', band: FREQUENCY_BANDS[1] },
  { name: 'AIR', band: FREQUENCY_BANDS[3] },
  { name: 'WX', band: FREQUENCY_BANDS[7] },
  { name: 'HAM', band: FREQUENCY_BANDS[9] },
];

const SIGNAL_TYPES = [
  { mode: 'WFM', desc: 'Wide FM (Broadcast)' },
  { mode: 'NFM', desc: 'Narrow FM' },
  { mode: 'AM', desc: 'Amplitude Modulation' },
  { mode: 'USB', desc: 'Upper Sideband' },
  { mode: 'LSB', desc: 'Lower Sideband' },
  { mode: 'CW', desc: 'CW/Digital' },
];

export default function SDRExplorer() {
  const [centerFreq, setCenterFreq] = useState(102500000);
  const [bandwidth, setBandwidth] = useState(2400000);
  const [selectedBand, setSelectedBand] = useState(FREQUENCY_BANDS[5]);
  const [isConnected, setIsConnected] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(70);
  const [mode, setMode] = useState('WFM');
  const [signalStrength, setSignalStrength] = useState(-50);
  const [serverIP, setServerIP] = useState('127.0.0.1');
  const [serverPort, setServerPort] = useState(8090);
  const [showSettings, setShowSettings] = useState(false);
  const [simulationMode, setSimulationMode] = useState(true);
  const [stationPositions, setStationPositions] = useState<number[]>([]);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioQueueRef = useRef<Int8Array[]>([]);
  const fftBufferRef = useRef<Float32Array>(new Float32Array(1024));
  
  const formatFrequency = (freq: number): string => {
    if (freq >= 1000000000) {
      return `${(freq / 1000000000).toFixed(4)} GHz`;
    } else if (freq >= 1000000) {
      return `${(freq / 1000000).toFixed(3)} MHz`;
    } else if (freq >= 1000) {
      return `${(freq / 1000).toFixed(1)} kHz`;
    }
    return `${freq} Hz`;
  };

  const connectToServer = useCallback(() => {
    console.log('Connecting to:', serverIP, serverPort);
    
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket(`ws://${serverIP}:${serverPort}`);
    wsRef.current = ws;
    
    ws.onopen = () => {
      console.log('Connected!');
      setIsConnected(true);
    };
    
    ws.onmessage = async (event) => {
      try {
        let buffer;
        if (event.data instanceof ArrayBuffer) {
          buffer = new Uint8Array(event.data);
        } else if (event.data instanceof Blob) {
          buffer = new Uint8Array(await event.data.arrayBuffer());
        } else {
          return;
        }
        processSamples(buffer);
      } catch (e) {
        console.error('Error processing:', e);
      }
    };
    
    ws.onerror = (error) => {
      console.error('Error:', error);
    };
    
    ws.onclose = () => {
      console.log('Disconnected');
      setIsConnected(false);
    };
  }, [serverIP, serverPort]);

  const processSamples = useCallback((samples: Uint8Array) => {
    const fftSize = fftBufferRef.current.length;
    const step = Math.floor(samples.length / 2 / fftSize);
    let maxSignal = -100;
    let sampleCount = 0;
    
    for (let i = 0; i < fftSize; i++) {
      const idx = i * step * 2;
      if (idx + 1 < samples.length) {
        const re = (samples[idx] - 127) / 128;
        const im = (samples[idx + 1] - 127) / 128;
        const mag = 20 * Math.log10(Math.sqrt(re * re + im * im) + 0.001);
        fftBufferRef.current[i] = mag;
        if (mag > maxSignal) maxSignal = mag;
        sampleCount++;
      }
    }
    
    if (sampleCount > 0) {
      setSignalStrength(Math.round(maxSignal));
    }
    
    if (isPlaying && audioContextRef.current) {
      const queue = audioQueueRef.current;
      queue.push(new Int8Array(samples));
      if (queue.length > 5) queue.shift();
      
      if (queue.length >= 2) {
        const combined = new Int8Array(queue[0].length * 2);
        for (let i = 0; i < queue[0].length; i++) {
          combined[i * 2] = queue[0][i * 2] || 0;
          combined[i * 2 + 1] = queue[0][i * 2 + 1] || 0;
        }
        queue.shift();
      }
    }
  }, [isPlaying]);

  const drawWaterfall = useCallback((ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    if (simulationMode) {
      const positions = [];
      const numStations = Math.floor(Math.random() * 5) + 2;
      for (let i = 0; i < numStations; i++) {
        positions.push(Math.random());
      }
      
      for (let i = 0; i < 1024; i++) {
        const pos = i / 1024;
        let signal = Math.random() * 0.15;
        
        for (const stationPos of positions) {
          const dist = Math.abs(pos - stationPos);
          if (dist < 0.02) {
            signal += (1 - dist / 0.02) * (0.5 + Math.random() * 0.4);
          }
        }
        
        signal += Math.sin(pos * 50 + Date.now() / 1000) * 0.05;
        fftBufferRef.current[i] = 20 * Math.log10(Math.max(0.001, signal)) + 80;
      }
      
      const signalMax = Math.max(...Array.from(fftBufferRef.current));
      setSignalStrength(Math.round(signalMax));
    }

    if (canvas.width === 0 || canvas.height === 0) return;

    const scrollHeight = 2;
    try {
      const imageData = ctx.getImageData(0, scrollHeight, canvas.width, canvas.height - scrollHeight);
      ctx.putImageData(imageData, 0, 0);
    } catch (e) {
      ctx.fillStyle = '#001020';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const bottomY = canvas.height - scrollHeight;
    const binCount = 1024;
    const binWidth = canvas.width / binCount;
    
    for (let x = 0; x < canvas.width; x++) {
      const binIdx = Math.min(Math.floor(x / binWidth), binCount - 1);
      const signal = fftBufferRef.current[binIdx] || -100;
      const normalized = Math.max(0, Math.min(1, (signal + 80) / 80));
      
      if (normalized > 0.1) {
        ctx.fillStyle = `rgb(${Math.floor(normalized * 255)}, ${Math.floor(normalized * 200)}, 0)`;
      } else {
        ctx.fillStyle = `rgb(0, ${Math.floor(normalized * 30)}, ${Math.floor(30 + normalized * 50)})`;
      }
      ctx.fillRect(x, bottomY, 1, scrollHeight);
    }
  }, [simulationMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width);
      canvas.height = Math.floor(rect.height);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const loop = () => {
      drawWaterfall(ctx, canvas);
      requestAnimationFrame(loop);
    };
    const animId = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animId);
    };
  }, [drawWaterfall]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isConnected) {
        setSignalStrength(-50 + Math.random() * 10);
      }
    }, 200);
    return () => clearInterval(interval);
  }, [isConnected]);

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
      
      const gainNode = audioContext.createGain();
      gainNode.gain.value = volume / 100 * 0.5;
      gainNode.connect(audioContext.destination);
      gainRef.current = gainNode;
      
      setIsPlaying(true);
    }
  };

  useEffect(() => {
    if (gainRef.current) {
      gainRef.current.gain.value = isPlaying ? volume / 100 * 0.5 : 0;
    }
  }, [volume, isPlaying]);

  const selectBand = (band: typeof FREQUENCY_BANDS[0]) => {
    setSelectedBand(band);
    const newCenter = (band.min + band.max) / 2;
    setCenterFreq(newCenter);
    setBandwidth((band.max - band.min) * 0.8);
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const buffer = new ArrayBuffer(9);
      const view = new DataView(buffer);
      view.setUint8(0, 1);
      view.setFloat64(1, newCenter);
      wsRef.current.send(buffer);
    }
  };

  const adjustFrequency = (delta: number) => {
    const newFreq = centerFreq + delta;
    const bandStart = selectedBand.min;
    const bandEnd = selectedBand.max;
    
    if (newFreq >= bandStart && newFreq <= bandEnd) {
      setCenterFreq(newFreq);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const buffer = new ArrayBuffer(9);
        const view = new DataView(buffer);
        view.setUint8(0, 1);
        view.setFloat64(1, newFreq);
        wsRef.current.send(buffer);
      }
    }
  };

  return (
    <div className="app">
      <div className="header">
        <div className="logo">SDR <span>Explorer</span></div>
        <button 
          onClick={() => setShowSettings(true)}
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            color: 'white',
            padding: '8px 16px',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 13
          }}
        >
          ⚙️ Settings
        </button>
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
            <button className="freq-btn" onClick={() => adjustFrequency(-bandwidth * 0.1)}>
              ◀◀<span className="freq-btn-label">-10%</span>
            </button>
            <button className="freq-btn" onClick={() => adjustFrequency(-bandwidth * 0.01)}>
              ◀<span className="freq-btn-label">-1%</span>
            </button>
            <button className="freq-btn" onClick={() => setCenterFreq((selectedBand.min + selectedBand.max) / 2)}>
              ⬤<span className="freq-btn-label">Center</span>
            </button>
            <button className="freq-btn" onClick={() => adjustFrequency(bandwidth * 0.01)}>
              ▶<span className="freq-btn-label">+1%</span>
            </button>
            <button className="freq-btn" onClick={() => adjustFrequency(bandwidth * 0.1)}>
              ▶▶<span className="freq-btn-label">+10%</span>
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
                <div className="band-btn-range">{preset.band.display}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
            All Frequency Bands
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
            {FREQUENCY_BANDS.map((band) => (
              <button
                key={band.name}
                className={`band-btn ${selectedBand.name === band.name ? 'active' : ''}`}
                onClick={() => selectBand(band)}
                style={{ 
                  background: selectedBand.name === band.name ? `${band.color}22` : undefined,
                  borderColor: selectedBand.name === band.name ? band.color : undefined,
                  color: selectedBand.name === band.name ? band.color : undefined,
                }}
              >
                <div className="band-btn-name">{band.name}</div>
                <div className="band-btn-range">{band.display}</div>
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
              <div className="meter-value">{signalStrength}</div>
              <div className="meter-label">Signal (dB)</div>
            </div>
            <div className="meter">
              <div className="meter-value" style={{ color: 'var(--accent-blue)' }}>{bandwidth / 1000000}</div>
              <div className="meter-label">BW (MHz)</div>
            </div>
            <div className="meter">
              <div className="meter-value" style={{ color: 'var(--accent-yellow)' }}>0</div>
              <div className="meter-label">S/N Ratio</div>
            </div>
          </div>
        </div>
      </div>

      <div className="status-bar">
        <div className="status-item">
          <div className={`status-dot ${isConnected ? '' : 'offline'}`} />
          <span>{isConnected ? 'RTL-SDR Connected' : 'Not Connected'}</span>
        </div>
        <div className="status-item">
          <div className="signal-strength">
            {[20, 35, 50, 65, 80].map((h, i) => (
              <div 
                key={i} 
                className="signal-bar" 
                style={{ 
                  height: h,
                  opacity: signalStrength > -80 + i * 15 ? 1 : 0.3 
                }} 
              />
            ))}
          </div>
        </div>
        <div className="status-item">
          <span>Gain: Auto</span>
        </div>
      </div>

      {showSettings && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 20
        }} onClick={() => setShowSettings(false)}>
          <div style={{
            background: 'var(--bg-secondary)',
            borderRadius: 20,
            padding: 24,
            maxWidth: 400,
            width: '100%'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>RTL-SDR Connection</h3>
              <button 
                onClick={() => setShowSettings(false)}
                style={{ background: 'transparent', border: 'none', color: 'white', fontSize: 24, cursor: 'pointer' }}
              >
                ×
              </button>
            </div>
            
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              To connect to your RTL-SDR dongle, run this command on your computer:
            </p>
            
            <div style={{
              background: 'var(--bg-card)',
              padding: 12,
              borderRadius: 8,
              fontFamily: 'monospace',
              fontSize: 12,
              marginBottom: 16,
              wordBreak: 'break-all'
            }}>
              rtl_tcp -a 0.0.0.0 -p 1234
            </div>
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'block' }}>
                Server IP Address
              </label>
              <input
                type="text"
                value={serverIP}
                onChange={(e) => setServerIP(e.target.value)}
                placeholder="192.168.1.100"
                style={{
                  width: '100%',
                  padding: 12,
                  background: 'var(--bg-card)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  color: 'white',
                  fontSize: 14
                }}
              />
            </div>
            
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'block' }}>
                Port
              </label>
              <input
                type="number"
                value={serverPort}
                onChange={(e) => setServerPort(Number(e.target.value))}
                placeholder="1234"
                style={{
                  width: '100%',
                  padding: 12,
                  background: 'var(--bg-card)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  color: 'white',
                  fontSize: 14
                }}
              />
            </div>
            
            <button
              onClick={connectToServer}
              style={{
                width: '100%',
                padding: 14,
                background: 'linear-gradient(135deg, var(--accent), #00cc6a)',
                border: 'none',
                borderRadius: 12,
                color: 'black',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {isConnected ? 'Reconnect' : 'Connect'}
            </button>
            
            <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                Simulation Mode shows demo signals when no RTL-SDR is connected:
              </p>
              <button
                onClick={() => {
                  setSimulationMode(!simulationMode);
                  if (!simulationMode) {
                    setIsConnected(true);
                  }
                  setShowSettings(false);
                }}
                style={{
                  width: '100%',
                  padding: 14,
                  background: simulationMode ? 'rgba(0, 255, 136, 0.2)' : 'var(--bg-card)',
                  border: `2px solid ${simulationMode ? 'var(--accent)' : 'rgba(255,255,255,0.2)'}`,
                  borderRadius: 12,
                  color: simulationMode ? 'var(--accent)' : 'white',
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {simulationMode ? '✓ Simulation Mode ON' : 'Enable Simulation Mode'}
              </button>
            </div>
            
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12, textAlign: 'center' }}>
              {simulationMode ? 'Running with simulated signals' : 'Make sure rtl_tcp is running before connecting'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
