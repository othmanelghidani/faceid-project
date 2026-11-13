// ===========================
// Config backend
// ===========================
const API_BASE = "http://127.0.0.1:8000";

// ===========================
// Sélection DOM (selon la page)
// ===========================
const video = document.getElementById("video");
const statusText = document.getElementById("status");
const livenessStatus = document.getElementById("livenessStatus");

const startCameraBtn = document.getElementById("startCameraBtn");
const stopCameraBtn = document.getElementById("stopCameraBtn");
const saveFaceBtn = document.getElementById("saveFaceBtn");
const recognizeFaceBtn = document.getElementById("recognizeFaceBtn");
const livenessBtn = document.getElementById("livenessBtn");
const personNameInput = document.getElementById("personName");

const facesTableBody = document.getElementById("facesTableBody");
const clearAllBtn = document.getElementById("clearAllBtn");

let stream = null;
let lastLivenessOkAt = 0;

// ===========================
// Face-api models
// ===========================
const MODEL_URL =
  "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights/";

// ===========================
// Helpers UI
// ===========================
function setStatus(msg) {
  if (statusText) statusText.textContent = msg;
}
function setLivenessStatus(msg) {
  if (livenessStatus) livenessStatus.textContent = msg;
}

// ===========================
// CAMERA (signup + login)
// ===========================
async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    setStatus("Caméra démarrée.");
  } catch (e) {
    console.error(e);
    setStatus("Accès caméra refusé.");
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
    video.srcObject = null;
    setStatus("Caméra arrêtée.");
  }
}

// ===========================
// VIVACITÉ (login)
// ===========================
async function checkLiveness() {
  setLivenessStatus("Test de vivacité en cours...");
  const positions = [];
  const start = performance.now();

  while (performance.now() - start < 1800) {
    const d = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks();

    if (d?.landmarks) {
      const n = d.landmarks.getNose()[3];
      if (n) positions.push(n);
    }
    await new Promise(r => setTimeout(r, 180));
  }

  if (positions.length < 2) {
    setLivenessStatus("Vivacité échouée.");
    return;
  }

  const ref = positions[0];
  const ok = positions.some(p =>
    Math.hypot(p.x - ref.x, p.y - ref.y) > 10
  );

  if (ok) {
    lastLivenessOkAt = Date.now();
    setLivenessStatus("Vivacité validée ✓");
    recognizeFaceBtn?.classList.remove("hidden");
  } else {
    setLivenessStatus("Bougez un peu plus la tête.");
  }
}

// ===========================
// SIGNUP : enregistrer visage
// ===========================
async function saveFace() {
  if (!stream) return setStatus("Démarrez la caméra.");
  if (!personNameInput.value.trim())
    return setStatus("Nom requis.");

  const d = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!d) return setStatus("Aucun visage détecté.");

  const res = await fetch(`${API_BASE}/faces/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      display_name: personNameInput.value.trim(),
      descriptor: Array.from(d.descriptor),
    }),
  });

  const data = await res.json();
  setStatus(`Visage enregistré : ${data.display_name}`);
}

// ===========================
// LOGIN : reconnaissance (✅ CORRIGÉ)
// ===========================
async function recognizeFace() {
  if (Date.now() - lastLivenessOkAt > 10000)
    return setStatus("Faites le test de vivacité.");

  const d = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!d) return setStatus("Aucun visage détecté.");

  const res = await fetch(`${API_BASE}/faces/recognize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      descriptor: Array.from(d.descriptor),
    }),
  });

  if (!res.ok) {
    setStatus("Visage non reconnu.");
    return;
  }

  const data = await res.json();

  // 🔐 SAUVEGARDE DE LA SESSION (LA CAUSE DU BUG)
  localStorage.setItem("authenticatedUserId", data.user_id);
  localStorage.setItem("authenticatedDisplayName", data.display_name);

  setStatus(`Bienvenue ${data.display_name}`);

  window.location.href = "secure.html";
}

// ===========================
// ADMIN
// ===========================
async function renderFacesTable() {
  if (!facesTableBody) return;

  facesTableBody.innerHTML = "";

  const res = await fetch(`${API_BASE}/faces`);
  const faces = await res.json();

  if (!faces.length) {
    facesTableBody.innerHTML =
      `<tr><td colspan="2" class="p-4 text-gray-500">Aucun visage.</td></tr>`;
    return;
  }

  faces.forEach(face => {
    facesTableBody.innerHTML += `
      <tr>
        <td class="border px-3 py-2">${face.display_name}</td>
        <td class="border px-3 py-2 text-center">
          <button class="bg-red-600 text-white text-xs px-3 py-1 rounded"
            onclick="deleteFace('${face.user_id}')">
            Supprimer
          </button>
        </td>
      </tr>`;
  });
}

async function deleteFace(userId) {
  if (!confirm("Supprimer ce visage ?")) return;
  await fetch(`${API_BASE}/faces/${userId}`, { method: "DELETE" });
  renderFacesTable();
}

clearAllBtn?.addEventListener("click", async () => {
  if (!confirm("Supprimer tous les visages ?")) return;
  await fetch(`${API_BASE}/faces`, { method: "DELETE" });
  renderFacesTable();
});

// ===========================
// INIT GLOBAL
// ===========================
(async () => {
  if (facesTableBody) {
    renderFacesTable();
    return;
  }

  if (!video) return;

  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);

  startCameraBtn?.addEventListener("click", startCamera);
  stopCameraBtn?.addEventListener("click", stopCamera);
  livenessBtn?.addEventListener("click", checkLiveness);
  saveFaceBtn?.addEventListener("click", saveFace);
  recognizeFaceBtn?.addEventListener("click", recognizeFace);
})();
