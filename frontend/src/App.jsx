import { useMemo, useState } from "react";
import "./App.css";

const API_BASE = "http://localhost:8000";

const generatePasscode = () => {
  const array = new Uint8Array(16);
  window.crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
};

export default function App() {
  const [embedAudio, setEmbedAudio] = useState(null);
  const [embedMessage, setEmbedMessage] = useState("");
  const [embedPasscode, setEmbedPasscode] = useState("");
  const [embedStatus, setEmbedStatus] = useState("");
  const [embedDownload, setEmbedDownload] = useState(null);

  const [extractAudio, setExtractAudio] = useState(null);
  const [extractPasscode, setExtractPasscode] = useState("");
  const [extractStatus, setExtractStatus] = useState("");
  const [extractMessage, setExtractMessage] = useState("");

  const canEmbed = useMemo(
    () => embedAudio && embedMessage.trim() && embedPasscode.trim(),
    [embedAudio, embedMessage, embedPasscode]
  );

  const canExtract = useMemo(
    () => extractAudio && extractPasscode.trim(),
    [extractAudio, extractPasscode]
  );

  const handleEmbed = async () => {
    setEmbedStatus("Encrypting and embedding...");
    setEmbedDownload(null);
    try {
      const form = new FormData();
      form.append("audio", embedAudio);
      form.append("message", embedMessage);
      form.append("passcode", embedPasscode);

      const response = await fetch(`${API_BASE}/embed`, {
        method: "POST",
        body: form,
      });

      if (!response.ok) {
        const detail = await response.json();
        throw new Error(detail.detail || "Embedding failed");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setEmbedDownload(url);
      setEmbedStatus("Stego audio ready.");
    } catch (error) {
      setEmbedStatus(error.message || "Embedding failed.");
    }
  };

  const handleExtract = async () => {
    setExtractStatus("Extracting and decrypting...");
    setExtractMessage("");
    try {
      const form = new FormData();
      form.append("audio", extractAudio);
      form.append("passcode", extractPasscode);

      const response = await fetch(`${API_BASE}/extract`, {
        method: "POST",
        body: form,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Extraction failed");
      }

      setExtractMessage(data.message);
      setExtractStatus("Message recovered.");
    } catch (error) {
      setExtractStatus(error.message || "Extraction failed.");
    }
  };

  return (
    <div className="page">
      <header className="nav">
        <div className="nav-brand">
          <span className="badge">RailSecure</span>
          <span>Audio Stego</span>
        </div>
        <nav className="nav-links">
          <a href="#overview">Overview</a>
          <a href="#embed">Encrypt</a>
          <a href="#extract">Decrypt</a>
        </nav>
      </header>

      <section className="hero" id="overview">
        <div className="hero-content">
          <span className="pill">Secure • Covert • Tamper-Resistant</span>
          <h1>Hide encrypted rail control messages inside routine audio</h1>
          <p>
            RailSecure blends encrypted dispatch instructions into everyday voice
            announcements so transmissions stay confidential without drawing
            attention. Only authorized receivers with the passcode can recover
            the payload.
          </p>
          <div className="hero-actions">
            <a className="button" href="#embed">
              Start Encrypting
            </a>
            <a className="button ghost" href="#extract">
              Decrypt a Payload
            </a>
          </div>
          <div className="hero-metrics">
            <div>
              <strong>LSB Stego</strong>
              <span>Low impact on audio quality</span>
            </div>
            <div>
              <strong>PBKDF2 + Fernet</strong>
              <span>Passcode-derived encryption</span>
            </div>
            <div>
              <strong>WAV Safe</strong>
              <span>Lossless carrier audio</span>
            </div>
          </div>
        </div>
        <div className="hero-card">
          <h3>Operational Use Cases</h3>
          <ul>
            <li>Emergency braking alerts</li>
            <li>Track maintenance authorizations</li>
            <li>Signal timing updates</li>
            <li>Control room status beacons</li>
          </ul>
          <div className="status-box">
            <span className="status-dot" />
            System status: Ready for embedding
          </div>
        </div>
      </section>

      <section className="section" id="embed">
        <div className="section-header">
          <h2>Encrypt & Embed</h2>
          <p>Upload a clean WAV carrier, encrypt the control text, and generate a stego WAV.</p>
        </div>
        <div className="card">
          <label className="label">Upload carrier WAV audio</label>
          <input
            type="file"
            accept="audio/wav"
            onChange={(event) => setEmbedAudio(event.target.files?.[0] || null)}
          />

          <label className="label">Control message</label>
          <textarea
            value={embedMessage}
            onChange={(event) => setEmbedMessage(event.target.value)}
            placeholder="Train 4A: Reduce speed to 55 km/h at signal 12B"
          />

          <label className="label">Passcode</label>
          <div className="row">
            <input
              type="text"
              value={embedPasscode}
              onChange={(event) => setEmbedPasscode(event.target.value)}
              placeholder="Generate or enter a secure passcode"
            />
            <button
              className="button secondary"
              type="button"
              onClick={() => setEmbedPasscode(generatePasscode())}
            >
              Generate
            </button>
          </div>

          <button className="button" type="button" disabled={!canEmbed} onClick={handleEmbed}>
            Create Stego Audio
          </button>

          {embedStatus && <div className="status">{embedStatus}</div>}

          {embedDownload && (
            <a className="button" href={embedDownload} download="stego_audio.wav">
              Download Stego WAV
            </a>
          )}
        </div>
      </section>

      <section className="section" id="extract">
        <div className="section-header">
          <h2>Decrypt & Extract</h2>
          <p>Recover hidden commands using the authorized passcode.</p>
        </div>
        <div className="card">
          <label className="label">Upload stego WAV audio</label>
          <input
            type="file"
            accept="audio/wav"
            onChange={(event) => setExtractAudio(event.target.files?.[0] || null)}
          />

          <label className="label">Passcode</label>
          <input
            type="text"
            value={extractPasscode}
            onChange={(event) => setExtractPasscode(event.target.value)}
            placeholder="Enter passcode"
          />

          <button className="button" type="button" disabled={!canExtract} onClick={handleExtract}>
            Recover Message
          </button>

          {extractStatus && <div className="status">{extractStatus}</div>}

          {extractMessage && (
            <div>
              <div className="label">Recovered message</div>
              <textarea value={extractMessage} readOnly />
            </div>
          )}
        </div>
      </section>

      <footer className="footer">
        LSB audio steganography with AES-compatible Fernet encryption and
        PBKDF2-derived passcodes.
      </footer>
    </div>
  );
}
