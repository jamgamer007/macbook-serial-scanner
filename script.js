let video = document.getElementById("video");
let output = document.getElementById("output");
let historyList = document.getElementById("historyList");

let currentStream = null;
let usingFrontCamera = false;

// Google Apps Script endpoint (YOU WILL REPLACE THIS)
const SCRIPT_URL = "https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec";

/* -----------------------------
   CAMERA SETUP
------------------------------*/

async function startCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
  }

  const constraints = {
    video: {
      facingMode: usingFrontCamera ? "user" : "environment"
    }
  };

  currentStream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = currentStream;
}

document.getElementById("switchBtn").addEventListener("click", () => {
  usingFrontCamera = !usingFrontCamera;
  startCamera();
});

/* -----------------------------
   CAPTURE FRAME FOR OCR
------------------------------*/

function captureFrame() {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  ctx.drawImage(video, 0, 0);

  return canvas.toDataURL("image/png");
}

/* -----------------------------
   OCR (TESSERACT)
------------------------------*/

async function runOCR(imageData) {
  output.innerText = "Scanning...";

  const result = await Tesseract.recognize(imageData, "eng", {
    logger: m => console.log(m)
  });

  return result.data.text;
}

/* -----------------------------
   SERIAL VALIDATION
   Apple serials: 10–12 chars alphanumeric
------------------------------*/

function validateSerial(text) {
  const cleaned = text.replace(/[^A-Z0-9]/gi, "").toUpperCase();

  const match = cleaned.match(/[A-Z0-9]{10,12}/);

  return match ? match[0] : null;
}

/* -----------------------------
   DUPLICATE CHECK (localStorage fallback)
------------------------------*/

function isDuplicate(serial) {
  const stored = JSON.parse(localStorage.getItem("scannedSerials") || "[]");
  return stored.includes(serial);
}

function saveLocal(serial) {
  const stored = JSON.parse(localStorage.getItem("scannedSerials") || "[]");

  stored.push(serial);
  localStorage.setItem("scannedSerials", JSON.stringify(stored));
}

/* -----------------------------
   UI UPDATE
------------------------------*/

function addToHistory(serial) {
  const li = document.createElement("li");
  li.textContent = serial;
  historyList.prepend(li);
}

/* -----------------------------
   GOOGLE SHEETS SYNC
------------------------------*/

async function syncToGoogleSheets(serial) {
  try {
    await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ serial }),
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (err) {
    console.log("Sync failed (offline queued later)", err);
  }
}

/* -----------------------------
   MAIN SCAN FLOW
------------------------------*/

document.getElementById("scanBtn").addEventListener("click", async () => {
  const image = captureFrame();
  const text = await runOCR(image);

  const serial = validateSerial(text);

  if (!serial) {
    output.innerText = "No valid serial found.";
    return;
  }

  if (isDuplicate(serial)) {
    output.innerText = `Duplicate detected: ${serial}`;
    return;
  }

  output.innerText = `Valid Serial: ${serial}`;

  saveLocal(serial);
  addToHistory(serial);

  // Try syncing to Google Sheets
  syncToGoogleSheets(serial);
});

/* -----------------------------
   INIT
------------------------------*/

startCamera();
