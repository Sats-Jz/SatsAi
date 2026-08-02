import { useState, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { useDrag } from '../hooks/useDrag';
import { useWakeWord } from '../hooks/useWakeWord';
import WaveAnimation from './WaveAnimation';
import './FloatingBall.css';

export default function FloatingBall() {
  const voiceState = useAppStore((s) => s.voiceState);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const setEnrollmentOpen = useAppStore((s) => s.setEnrollmentOpen);
  const [showMenu, setShowMenu] = useState(false);

  const { isDragging, position, onMouseDown } = useDrag(
    window.screen.width - 140,
    window.screen.height - 200
  );

  // Init OpenWakeWord — free, open-source, no API key needed
  useWakeWord({
    keywords: ['hey_jarvis'],
    onDetect: (keyword, score) => {
      console.log(`[WakeWord] Detected: "${keyword}" score=${score.toFixed(2)}`);
      if (window.electronAPI) {
        window.electronAPI.wakeWordDetected(keyword, score);
      }
    },
    cooldownMs: 2000,
    enabled: voiceState === 'idle', // Only listen when idle
  });

  // Handle tray double-click → trigger listening
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onStartListening(() => {
        window.electronAPI.wakeWordDetected('manual', 1.0);
      });
    }
    return () => {
      window.electronAPI?.removeAllListeners('start-listening');
    };
  }, []);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowMenu(!showMenu);
  };

  const handleDoubleClick = () => {
    if (window.electronAPI) {
      window.electronAPI.wakeWordDetected('manual', 1.0);
    }
  };

  const getFaceExpression = (): string => {
    switch (voiceState) {
      case 'idle': return '\u{1F60A}';
      case 'listening': return '\u{1F3A4}';
      case 'thinking': return '\u{1F914}';
      case 'speaking': return '\u{1F4AC}';
      default: return '\u{1F60A}';
    }
  };

  const getStatusClass = (): string => `ball-${voiceState}`;

  return (
    <div
      className={`floating-ball ${getStatusClass()} ${isDragging ? 'dragging' : ''}`}
      style={{ left: position.x, top: position.y }}
      onMouseDown={onMouseDown}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    >
      <div className="ball-body">
        <div className="ball-face">
          <span className="face-expression">{getFaceExpression()}</span>
        </div>
        {voiceState === 'listening' && <WaveAnimation />}
        {voiceState === 'thinking' && <div className="thinking-ring" />}
      </div>

      {showMenu && (
        <div className="ball-context-menu">
          <div className="menu-item" onClick={() => { setSettingsOpen(true); setShowMenu(false); }}>
            Settings
          </div>
          <div className="menu-item" onClick={() => { setEnrollmentOpen(true); setShowMenu(false); }}>
            Voice ID
          </div>
          <div className="menu-separator" />
          <div className="menu-item" onClick={() => setShowMenu(false)}>
            Exit
          </div>
        </div>
      )}
    </div>
  );
}
