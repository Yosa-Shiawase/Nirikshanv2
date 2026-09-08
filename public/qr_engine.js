/* NIRAKSHAN QR engine v2 — native BarcodeDetector first, ZXing fallback,
   torch + zoom + fit toggle. Overrides app.js camera fns; app.js untouched. */
(function () {
  var stream = null, track = null, detector = null, zxing = null;
  var stopped = true, pollId = 0, torchOn = false, fitCover = true;
  var lastText = "", lastTime = 0;

  function v()   { return document.getElementById("qrVideo"); }
  function tag(t){ var el = document.getElementById("sensorTag"); if (el) el.innerText = t; }
  function btn() { return document.getElementById("camBtn"); }

  function flashHit() {
    var s = document.getElementById("sensorBox"); if (!s) return;
    s.style.boxShadow = "0 0 0 3px #10b981";
    setTimeout(function () { s.style.boxShadow = ""; }, 400);
  }
  function got(text) {
    var now = Date.now();
    if (text === lastText && now - lastTime < 4000) return;   /* cooldown */
    lastText = text; lastTime = now;
    var i = document.getElementById("qrUri");
    if (i) i.value = text;
    tag("Payload Captured!");
    flashHit();
    if (typeof runQRAnalysis === "function") runQRAnalysis();
  }

  /* ---------- controls (torch / zoom / fit) ---------- */
  function clearCtrls() {
    document.querySelectorAll(".qz-ctrl").forEach(function (e) { e.remove(); });
  }
  function addCtrls() {
    var row = document.querySelector(".cam-btns"); if (!row) return;
    clearCtrls();
    var fit = document.createElement("button");
    fit.className = "cbtn qz-ctrl"; fit.textContent = "VIEW: CROP ⇄";
    fit.onclick = function () {
      var vd = v(); if (!vd) return;
      fitCover = !fitCover;
      vd.style.objectFit = fitCover ? "cover" : "contain";
      fit.textContent = fitCover ? "VIEW: CROP ⇄" : "VIEW: FULL ⇄";
    };
    row.appendChild(fit);
    try {
      if (track && track.getCapabilities) {
        var cap = track.getCapabilities();
        if (cap.torch) {
          var tb = document.createElement("button");
          tb.className = "cbtn qz-ctrl"; tb.textContent = "TORCH ✦";
          tb.onclick = function () {
            torchOn = !torchOn;
            track.applyConstraints({ advanced: [{ torch: torchOn }] })
              .then(function () { tb.textContent = torchOn ? "TORCH ON ✦" : "TORCH ✦"; })
              .catch(function () {});
          };
          row.appendChild(tb);
        }
        if (cap.zoom) {
          var z = document.createElement("input");
          z.type = "range"; z.className = "qz-ctrl";
          z.min = cap.zoom.min || 1; z.max = cap.zoom.max || 4;
          z.step = cap.zoom.step || 0.1; z.value = 1;
          z.style.cssText = "width:110px;accent-color:#38bdf8;";
          z.title = "Zoom";
          z.oninput = function () {
            track.applyConstraints({ advanced: [{ zoom: parseFloat(z.value) }] }).catch(function () {});
          };
          row.appendChild(z);
        }
      }
    } catch (e) {}
  }

  /* ---------- native engine loop ---------- */
  function loopNative() {
    if (stopped || !detector) return;
    var vd = v();
    if (vd && vd.readyState >= 2) {
      detector.detect(vd).then(function (codes) {
        if (codes && codes.length && codes[0].rawValue) { got(codes[0].rawValue); }
      }).catch(function () {});
    }
    pollId = setTimeout(loopNative, 250);
  }

  /* ---------- start / stop ---------- */
  function startCamera() {
    var video = v(), b = btn();
    if (!video) return;
    stopped = false;
    tag("Requesting rear lens…");
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" },
               width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    }).then(function (s) {
      stream = s; track = s.getVideoTracks()[0];
      video.srcObject = s;
      video.setAttribute("playsinline", ""); video.muted = true;
      return video.play();
    }).then(function () {
      if (b) b.innerText = "Stop Sensor";
      tag("Sensor Active • Align QR");
      addCtrls();
      if ("BarcodeDetector" in window) {
        try {
          detector = new BarcodeDetector({ formats: ["qr_code"] });
          loopNative();
          return;
        } catch (e) { detector = null; }
      }
      if (window.ZXing) {
        zxing = new ZXing.BrowserMultiFormatReader();
        zxing.decodeFromVideoElement(video, function (res) {
          if (res && res.getText) got(res.getText());
        });
        tag("Sensor Active (ZXing) • Align QR");
      } else {
        tag("No QR engine available in this browser");
      }
    }).catch(function (err) {
      tag("Camera blocked: " + err.name);
      alert("Camera unavailable (" + err.name + ").\n\n• If via LAN IP (http://192.168…) the camera is BLOCKED — use the Render HTTPS URL or localhost.\n• Or deny-permission happened; allow camera in site settings.\n• Fallback: tap 'Snap with Camera'.");
      stopCamera();
    });
  }

  function stopCamera() {
    stopped = true;
    if (pollId) { clearTimeout(pollId); pollId = 0; }
    if (zxing) { try { zxing.reset(); } catch (e) {} zxing = null; }
    detector = null;
    var vd = v();
    if (vd && vd.srcObject) {
      vd.srcObject.getTracks().forEach(function (t) { t.stop(); });
      vd.srcObject = null;
    }
    stream = null; track = null; torchOn = false;
    clearCtrls();
    tag("Sensor Standby");
    if (btn()) btn().innerText = "Start Camera";
  }

  window.toggleCamera = function () { stopped ? startCamera() : stopCamera(); };
  window.startCamera  = startCamera;
  window.stopCamera   = stopCamera;

  /* ---------- snapshot decode (file/gallery) ---------- */
  window.decodeSnap = function (evt) {
    var file = evt.target.files && evt.target.files[0];
    if (!file) return;
    tag("Decoding snapshot…");
    var finishWithZXing = function () {
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.src = e.target.result;
        img.onload = function () {
          try {
            new ZXing.BrowserMultiFormatReader().decodeFromImage(img)
              .then(function (r) { got(r.getText()); })
              .catch(function () { tag("Sensor Standby");
                alert("No QR detected. Retake closer, with focus."); });
          } catch (e2) { alert("QR engine missing."); }
        };
      };
      reader.readAsDataURL(file);
    };
    if ("BarcodeDetector" in window) {
      createImageBitmap(file).then(function (bmp) {
        var d = new BarcodeDetector({ formats: ["qr_code"] });
        return d.detect(bmp);
      }).then(function (codes) {
        if (codes && codes.length) got(codes[0].rawValue);
        else finishWithZXing();
      }).catch(finishWithZXing);
    } else finishWithZXing();
  };

  /* auto-stop camera when navigating away from the QR pane */
  var prevTab = window.switchTab;
  window.switchTab = function (k) {
    if (k !== "qr" && !stopped) stopCamera();
    return prevTab.apply(this, arguments);
  };
})();
