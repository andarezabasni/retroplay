import { useState } from "react";

interface OnboardingModalProps {
  onClose: () => void;
}

export function OnboardingModal({ onClose }: OnboardingModalProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const slides = [
    {
      icon: "♪",
      title: "Organize with Playlists",
      description:
        "Create custom playlists, rename them, and manage your music collection all in one place.",
    },
    {
      icon: "▣",
      title: "Float It",
      description:
        "Shrink to a compact player (380×160). Drag it anywhere on your screen—it stays on top of other windows.",
    },
    {
      icon: "⛶",
      title: "Three Ways to Read Lyrics",
      description:
        "Side panel for discrete reading, big focus view for center-stage, or floating overlay pinned above everything.",
    },
    {
      icon: "✓",
      title: "Works Offline",
      description:
        "Downloaded lyrics are cached locally. Once synced, they work without internet—no streaming needed.",
    },
  ];

  const handleClose = () => {
    if (dontShowAgain) {
      localStorage.setItem("retroplay_onboarding_shown", "true");
    }
    onClose();
  };

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      handleClose();
    }
  };

  const handlePrev = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const slide = slides[currentSlide];

  return (
    <div className="onboarding-backdrop" onKeyDown={(e) => e.key === "Escape" && handleClose()}>
      <div className="onboarding-card">
        <div className="onboarding-header">
          <h2>Welcome to RetroPlay</h2>
        </div>

        <div className="onboarding-slide">
          <div className="onboarding-icon">{slide.icon}</div>
          <h3>{slide.title}</h3>
          <p>{slide.description}</p>
        </div>

        <div className="onboarding-nav">
          <div className="onboarding-dots">
            {slides.map((_, i) => (
              <button
                key={i}
                className={`dot ${i === currentSlide ? "active" : ""}`}
                onClick={() => setCurrentSlide(i)}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>

          <div className="onboarding-buttons">
            <button
              className="onboarding-btn prev"
              onClick={handlePrev}
              disabled={currentSlide === 0}
            >
              ← Prev
            </button>
            <button className="onboarding-btn next" onClick={handleNext}>
              {currentSlide === slides.length - 1 ? "Get Started" : "Next →"}
            </button>
          </div>
        </div>

        <div className="onboarding-footer">
          <label className="onboarding-checkbox">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
            />
            Don't show again
          </label>
          <button className="onboarding-close" onClick={handleClose}>
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
