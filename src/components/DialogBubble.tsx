import { useEffect, useRef } from 'react';
import { useAppStore } from '../stores/appStore';
import './DialogBubble.css';

export default function DialogBubble() {
  const voiceState = useAppStore((s) => s.voiceState);
  const transcript = useAppStore((s) => s.transcript);
  const response = useAppStore((s) => s.response);
  const ttsAudioUrl = useAppStore((s) => s.ttsAudioUrl);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (ttsAudioUrl && audioRef.current) {
      audioRef.current.src = ttsAudioUrl;
      audioRef.current.play().catch(console.error);
    }
  }, [ttsAudioUrl]);

  const isVisible = voiceState !== 'idle';
  if (!isVisible) return null;

  return (
    <>
      <audio ref={audioRef} style={{ display: 'none' }} />
      <div className={`dialog-bubble ${voiceState}`}>
        {voiceState === 'listening' && (
          <div className="bubble-content">
            <div className="bubble-label">Listening...</div>
            {transcript && <div className="transcript-text">{transcript}</div>}
          </div>
        )}
        {voiceState === 'thinking' && (
          <div className="bubble-content">
            <div className="bubble-label">Thinking...</div>
            <div className="thinking-dots"><span>.</span><span>.</span><span>.</span></div>
          </div>
        )}
        {voiceState === 'speaking' && response && (
          <div className="bubble-content">
            <div className="bubble-label">SatsAi</div>
            <div className="response-text">{response}</div>
          </div>
        )}
      </div>
    </>
  );
}
