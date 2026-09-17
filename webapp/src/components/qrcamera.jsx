import { useCallback, useEffect, useRef, useState } from "react";

// QR camera (F3): native BarcodeDetector first, ZXing fallback, torch + zoom.
// Degrades gracefully with an inline status instead of alert() popups.
export default function QrCamera({ onDetected }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const trackRef = useRef(null);
  const detectorRef = useRef(null);
  const zxingRef = useRef(null);
  const pollRef = useRef(0);
  const lastRef = useRef({ text: "", at: 0 });

  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("Sensor standby");
  const [engine, setEngine] = useState("");
  const [torch, setTorch] = useState(false);
  const [zoom, setZoom] = useState({ supported: false, min: 1, max: 4, step: 0.1, value: 1 });
  const [fit, setFit] = useState("cover");

  const emit = useCallback(
    (text) => {
      const now = Date.now();
      if (text === lastRef.current.text && now - lastRef.current.at < 4000) return; // cooldown
      lastRef.current = { text, at: now };
      setStatus("Payload captured!");
      onDetected && onDetected(text);
    },
    [onDetected]
  );

  const stop = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = 0;
    }
    if (zxingRef.current) {
      try {
        zxingRef.current.reset();
      } catch (err) {
        /* ignore */
      }
      zxingRef.current = null;
    }
    detectorRef.current = null;
    const v = videoRef.current;
    if (v && v.srcObject) {
      v.srcObject.getTracks().forEach((t) => t.stop());
      v.srcObject = null;
    }
    streamRef.current = null;
    trackRef.current = null;
    setTorch(false);
    setRunning(false);
    setEngine("");
    setStatus("Sensor standby");
  }, []);

  const start = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus("Camera API unavailable in this browser");
      return;
    }
    setStatus("Requesting rear lens…");
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch (err) {
      setStatus(`Camera blocked: ${err.name || "error"} — paste a URI below instead`);
      return;
    }
    streamRef.current = stream;
    trackRef.current = stream.getVideoTracks()[0];
    video.srcObject = stream;
    video.setAttribute("playsinline", "");
    video.muted = true;
    try {
      await video.play();
    } catch (err) {
      /* autoplay quirks */
    }
    setRunning(true);

    // torch / zoom capabilities
    try {
      const cap = trackRef.current.getCapabilities ? trackRef.current.getCapabilities() : {};
      if (cap.zoom) {
        setZoom({ supported: true, min: cap.zoom.min || 1, max: cap.zoom.max || 4, step: cap.zoom.step || 0.1, value: 1 });
      }
      if (cap.torch) setStatus("Sensor active — torch available");
    } catch (err) {
      /* ignore */
    }

    // engine selection
    if ("BarcodeDetector" in window) {
      try {
        detectorRef.current = new window.BarcodeDetector({ formats: ["qr_code"] });
        setEngine("BarcodeDetector");
        setStatus("Sensor active • align QR");
        const loop = () => {
          if (!detectorRef.current || !videoRef.current) return;
          if (videoRef.current.readyState >= 2) {
            detectorRef.current
              .detect(videoRef.current)
              .then((codes) => {
                if (codes && codes.length && codes[0].rawValue) emit(codes[0].rawValue);
              })
              .catch(() => {});
          }
          pollRef.current = setTimeout(loop, 250);
        };
        loop();
        return;
      } catch (err) {
        detectorRef.current = null;
      }
    }
    // ZXing fallback
    try {
      const mod = await import("@zxing/browser");
      const Reader = mod.BrowserMultiFormatReader || mod.default;
      const reader = new Reader();
      zxingRef.current = reader;
      setEngine("ZXing");
      setStatus("Sensor active (ZXing) • align QR");
      reader.decodeFromVideoElement(videoRef.current, (res) => {
        if (res && res.getText) emit(res.getText());
      });
    } catch (err) {
      setStatus("No QR engine available in this browser");
    }
  }, [emit]);

  const toggleTorch = useCallback(async () => {
    const t = trackRef.current;
    if (!t) return;
    const next = !torch;
    try {
      await t.applyConstraints({ advanced: [{ torch: next }] });
      setTorch(next);
    } catch (err) {
      /* unsupported */
    }
  }, [torch]);

  const applyZoom = useCallback(async (value) => {
    const t = trackRef.current;
    setZoom((z) => ({ ...z, value }));
    if (!t) return;
    try {
      await t.applyConstraints({ advanced: [{ zoom: Number(value) }] });
    } catch (err) {
      /* unsupported */
    }
  }, []);

  useEffect(() => () => stop(), [stop]);

  return (
    <div className="qr-cam">
      <div className="qr-cam__stage">
        <video ref={videoRef} className="qr-cam__video" style={{ objectFit: fit }} />
        <div className="qr-cam__badge">
          {engine ? `${engine} · ` : ""}
          {status}
        </div>
      </div>

      <div className="qr-cam__controls">
        <button type="button" className="hud-btn" onClick={() => (running ? stop() : start())} style={{ minHeight: 44 }}>
          {running ? "STOP SENSOR" : "START CAMERA"}
        </button>
        <button
          type="button"
          className="hud-btn"
          disabled={!running}
          onClick={() => setFit((f) => (f === "cover" ? "contain" : "cover"))}
          style={{ minHeight: 44 }}
        >
          VIEW: {fit === "cover" ? "CROP" : "FULL"} ⇄
        </button>
        <button
          type="button"
          className="hud-btn"
          disabled={!running}
          aria-pressed={torch}
          onClick={toggleTorch}
          style={torch ? { borderColor: "var(--warn)", color: "var(--warn)", minHeight: 44 } : { minHeight: 44 }}
        >
          TORCH {torch ? "ON" : "OFF"}
        </button>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)" }}>
          ZOOM
          <input
            type="range"
            min={zoom.min}
            max={zoom.max}
            step={zoom.step}
            value={zoom.value}
            onChange={(e) => applyZoom(e.target.value)}
            disabled={!running || !zoom.supported}
            aria-label="Zoom"
          />
        </label>
      </div>
    </div>
  );
}
