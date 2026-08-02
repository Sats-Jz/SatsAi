import { useState, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import './SettingsPanel.css';

interface Props { onClose: () => void; }

export default function SettingsPanel({ onClose }: Props) {
  const setEnrollmentOpen = useAppStore((s) => s.setEnrollmentOpen);
  const [settings, setSettings] = useState({
    hotword: 'hey sats',
    hotwordSensitivity: 0.5,
    speakerThreshold: 0.7,
    language: 'auto' as string,
    ttsVoice: 'zh-CN-XiaoxiaoNeural',
    ttsRate: 1.0,
    llmProvider: 'claude' as string,
    llmModel: 'claude-sonnet-5-20251001',
    autoStart: false,
  });

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getSettings().then((s) => {
        if (s) setSettings((prev) => ({ ...prev, ...s }));
      });
    }
  }, []);

  const update = (key: string, value: unknown) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const save = () => {
    if (window.electronAPI) window.electronAPI.saveSettings(settings);
    onClose();
  };

  return (
    <div className="settings-overlay">
      <div className="settings-panel">
        <button className="close-btn" onClick={onClose}>x</button>
        <h2>Settings</h2>
        <div className="settings-content">
          <section>
            <h3>Voice</h3>
            <label>Wake Word</label>
            <input type="text" value={settings.hotword} onChange={(e) => update('hotword', e.target.value)} />
            <label>Sensitivity: {settings.hotwordSensitivity}</label>
            <input type="range" min="0.1" max="1" step="0.1" value={settings.hotwordSensitivity}
              onChange={(e) => update('hotwordSensitivity', parseFloat(e.target.value))} />
            <label>TTS Voice</label>
            <select value={settings.ttsVoice} onChange={(e) => update('ttsVoice', e.target.value)}>
              <option value="zh-CN-XiaoxiaoNeural">Xiaoxiao (F, CN)</option>
              <option value="zh-CN-YunxiNeural">Yunxi (M, CN)</option>
              <option value="zh-CN-XiaoyiNeural">Xiaoyi (F, CN)</option>
              <option value="en-US-JennyNeural">Jenny (F, EN)</option>
              <option value="en-US-GuyNeural">Guy (M, EN)</option>
            </select>
          </section>

          <section>
            <h3>Security</h3>
            <label>Speaker Threshold: {settings.speakerThreshold}</label>
            <input type="range" min="0.3" max="0.95" step="0.05" value={settings.speakerThreshold}
              onChange={(e) => update('speakerThreshold', parseFloat(e.target.value))} />
            <div className="hint">Higher = stricter verification</div>
            <button className="manage-btn" onClick={() => setEnrollmentOpen(true)}>Manage Voice ID</button>
          </section>

          <section>
            <h3>AI</h3>
            <label>Provider</label>
            <select value={settings.llmProvider} onChange={(e) => update('llmProvider', e.target.value)}>
              <option value="claude">Claude (Anthropic)</option>
              <option value="openai">OpenAI (GPT)</option>
            </select>
            <label>Model</label>
            <input type="text" value={settings.llmModel} onChange={(e) => update('llmModel', e.target.value)} />
            <div className="hint">API key via SATSAI_LLM_API_KEY env var</div>
          </section>

          <section>
            <h3>System</h3>
            <label className="toggle-label">
              <input type="checkbox" checked={settings.autoStart}
                onChange={(e) => update('autoStart', e.target.checked)} />
              Start with Windows
            </label>
          </section>
        </div>

        <div className="settings-actions">
          <button className="save-btn" onClick={save}>Save</button>
          <button className="cancel-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
