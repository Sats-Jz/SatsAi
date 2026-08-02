import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../stores/appStore';
import './VoiceEnrollment.css';

interface Props { onClose: () => void; }

export default function VoiceEnrollment({ onClose }: Props) {
  const [phrases, setPhrases] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [complete, setComplete] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.startEnrollment().then((result) => {
        if (result.success && result.phrases) setPhrases(result.phrases);
      });
    }
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const arrayBuffer = await blob.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        if (window.electronAPI) {
          const result = await window.electronAPI.submitEnrollmentAudio(currentIndex, base64);
          if (result.success && result.complete) setComplete(true);
        }
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
          setIsRecording(false);
          if (currentIndex < phrases.length - 1) setCurrentIndex((i) => i + 1);
        }
      }, 5000);
    } catch (err) { console.error('Recording error:', err); }
  };

  return (
    <div className="enrollment-overlay">
      <div className="enrollment-panel">
        <button className="close-btn" onClick={onClose}>x</button>
        <h2>Voice Enrollment</h2>

        {!complete ? (
          <>
            <p className="enrollment-desc">Read each phrase aloud to register your voice</p>
            <div className="phrase-list">
              {phrases.map((phrase, i) => (
                <div key={i} className={`phrase-item ${i === currentIndex ? 'active' : ''} ${i < currentIndex ? 'done' : ''}`}>
                  <span className="phrase-index">{i + 1}</span>
                  <span className="phrase-text">{phrase}</span>
                  {i < currentIndex && <span className="check">OK</span>}
                  {i === currentIndex && !isRecording && <span className="pending">Ready</span>}
                </div>
              ))}
            </div>
            <div className="enrollment-progress">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${(currentIndex / phrases.length) * 100}%` }} />
              </div>
              <span className="progress-text">{currentIndex}/{phrases.length}</span>
            </div>
            <button className="record-btn" onClick={startRecording} disabled={isRecording}>
              {isRecording ? 'Recording...' : currentIndex === 0 ? 'Start' : 'Next Phrase'}
            </button>
          </>
        ) : (
          <div className="enrollment-complete">
            <div className="complete-icon">OK</div>
            <h3>Enrollment Complete!</h3>
            <p>Your voice has been registered successfully.</p>
            <button className="record-btn" onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
