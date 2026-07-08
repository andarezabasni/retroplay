interface AboutModalProps {
  onClose: () => void;
}

export function AboutModal({ onClose }: AboutModalProps) {
  return (
    <div
      className="about-backdrop"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      role="dialog"
    >
      <div className="about-card" onClick={(e) => e.stopPropagation()}>
        <div className="about-header">
          <h2>About RetroPlay</h2>
          <button className="about-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="about-content">
          <p className="about-version">v1.0.0</p>

          <p className="about-description">
            Offline desktop music player with synced lyrics, retro aesthetic, and floating modes.
          </p>

          <div className="about-section">
            <h3>Made by</h3>
            <p>
              <a href="https://instagram.com/andreza.dev" target="_blank" rel="noopener noreferrer">
                andreza.dev
              </a>
            </p>
          </div>

          <div className="about-section">
            <h3>Find me on</h3>
            <ul className="about-links">
              <li>
                <a href="https://github.com/andarezabasni" target="_blank" rel="noopener noreferrer">
                  GitHub
                </a>
              </li>
              <li>
                <a href="https://instagram.com/andreza.dev" target="_blank" rel="noopener noreferrer">
                  Instagram
                </a>
              </li>
            </ul>
          </div>

          <div className="about-section">
            <h3>Features</h3>
            <ul className="about-features">
              <li>Local MP3 library</li>
              <li>Synced lyrics from LRCLIB</li>
              <li>Offline lyrics cache</li>
              <li>Custom playlists</li>
              <li>Floating mini player</li>
              <li>YouTube downloads</li>
            </ul>
          </div>
        </div>

        <div className="about-footer">
          <button className="about-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
