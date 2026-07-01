let video = document.getElementById("video");
let output = document.getElementById("output");
let historyList = document.getElementById("historyList");

let currentStream = null;
let usingFrontCamera = false;

const SCRIPT_URL = "https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec";

/* =========================
   CAMERA
========================= */

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

/* =========================
   CAPTURE (IMPROVED CROPPING)
========================= */

function captureFrame() {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  // Crop center area (removes noise)
  const crop = 0.6;

  const sx = video.videoWidth * (1 - crop) / 2;
  const sy = video.videoHeight * (1 - crop) / 2;
  const sw = video.videoWidth * crop;
  const sh = video.videoHeight * crop;

  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL("image/png");
}

/* =========================
   OCR (IMPROVED)
========================= */

async function runOCR(imageData) {
  output.innerText = "Enhancing image...";

  const img = new Image();
  img.src = imageData;
  await new Promise(res => (img.onload = res));

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = img.width;
  canvas.height = img.height;

  ctx.drawImage(img, 0, 0);

  let imageDataObj = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let data = imageDataObj.data;

  output.innerText = "Cleaning image...";

  // Softer contrast (IMPORTANT FIX)
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    let gray = 0.3 * r + 0.59 * g + 0.11 * b;

    // improved contrast (NOT binary threshold)
    gray = (gray - 128) * 1.4 + 128;
    gray = Math.max(0, Math.min(255, gray));

    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }

  ctx.putImageData(imageDataObj, 0, 0);

  const processedImage = canvas.toDataURL("image/png");

  output.innerText = "Running OCR...";

  const result = await Tesseract.recognize(processedImage, "eng", {
    logger: m => console.log(m),
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE
  });

  return fixSerialErrors(result.data.text);
}

/* =========================
   FIX OCR MISTAKES
========================= */

function fixSerialErrors(text) {
  return text
    .replace(/O/g, "0")
    .replace(/I/g, "1")
    .replace(/S/g, "5")
    .replace(/B/g, "8")
    .replace(/\s/g, "")
    .toUpperCase();
}

/* =========================
   SERIAL VALIDATION
========================= */

function validateSerial(text) {
  const match = text.match(/[A-Z0-9]{10,12}/);
  return match ? match[0] : null;
}

/* =========================
   INDEXEDDB
========================= */

const DB_NAME = "serial_scanner_db";
const STORE_NAME = "queue";

let db;

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = (e) => {
      db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "serial" });
      }
    };

    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };

    request.onerror = reject;
  });
}

function saveLocal(serial) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    store.put({
      serial,
      timestamp: Date.now(),
      synced: false
    });

    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

function isDuplicate(serial) {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);

    const req = store.get(serial);

    req.onsuccess = () => resolve(!!req.result);
    req.onerror = () => resolve(false);
  });
}

/* =========================
   SYNC ENGINE
========================= */

async function syncQueue() {
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);

  const req = store.getAll();

  req.onsuccess = async () => {
    const items = req.result;

    for (const item of items) {
      try {
        const res = await fetch(SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ serial: item.serial })
        });

        const data = await res.json();

        if (data.success) {
          store.delete(item.serial);
        }

      } catch (err) {
        console.log("Sync failed, retry later");
      }
    }
  };
}

window.addEventListener("online", syncQueue);

/* =========================
   UI
========================= */

function addToHistory(serial) {
  const li = document.createElement("li");
  li.textContent = serial;
  historyList.prepend(li);
}

/* =========================
   MAIN FLOW
========================= */

document.getElementById("scanBtn").addEventListener("click", async () => {
  const image = captureFrame();
  const text = await runOCR(image);

  const serial = validateSerial(text);

  if (!serial) {
    output.innerText = "No valid serial found.";
    return;
  }

  const duplicate = await isDuplicate(serial);

  if (duplicate) {
    output.innerText = `Duplicate detected: ${serial}`;
    return;
  }

  output.innerText = `Valid Serial: ${serial}`;

  await saveLocal(serial);
  addToHistory(serial);

  if (navigator.onLine) {
    syncQueue();
  }
});

/* =========================
   INIT
========================= */

window.addEventListener("load", async () => {
  await initDB();
  startCamera();

  if (navigator.onLine) {
    syncQueue();
  }
});
