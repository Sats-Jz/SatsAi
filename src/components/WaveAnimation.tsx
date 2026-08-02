import './WaveAnimation.css';

export default function WaveAnimation() {
  return (
    <div className="wave-container">
      <div className="wave-bar" style={{ animationDelay: '0s' }} />
      <div className="wave-bar" style={{ animationDelay: '0.2s' }} />
      <div className="wave-bar" style={{ animationDelay: '0.4s' }} />
      <div className="wave-bar" style={{ animationDelay: '0.1s' }} />
      <div className="wave-bar" style={{ animationDelay: '0.3s' }} />
    </div>
  );
}
