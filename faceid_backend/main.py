from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from pathlib import Path
from datetime import datetime
import uuid
import math
from cryptography.fernet import Fernet

app = FastAPI()
# ==========================
# CORS
# ==========================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================
# STOCKAGE EN MÉMOIRE
# ==========================
faces_db = {}          # visages
user_keys = {}         # 🔐 clés AES par utilisateur

# ==========================
# DOSSIER FICHIERS
# ==========================
BASE_FILES_DIR = Path("user_files")
BASE_FILES_DIR.mkdir(exist_ok=True)

# ==========================
# MODELS
# ==========================
class FaceRegisterRequest(BaseModel):
    display_name: str
    descriptor: list[float]


class FaceRecognizeRequest(BaseModel):
    descriptor: list[float]


# ==========================
# UTILS
# ==========================
def euclidean_distance(d1, d2):
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(d1, d2)))


# ==========================
# FACE ID
# ==========================
@app.post("/faces/register")
def register_face(data: FaceRegisterRequest):
    user_id = str(uuid.uuid4())

    faces_db[user_id] = {
        "user_id": user_id,
        "display_name": data.display_name,
        "descriptors": [data.descriptor],
        "created_at": datetime.utcnow().isoformat(),
    }

    # 🔐 Génération clé AES
    user_keys[user_id] = Fernet.generate_key()

    return {
        "user_id": user_id,
        "display_name": data.display_name,
    }


@app.post("/faces/recognize")
def recognize_face(data: FaceRecognizeRequest):
    if not faces_db:
        raise HTTPException(status_code=404, detail="Aucun visage enregistré")

    best_match = None
    best_distance = float("inf")

    for user in faces_db.values():
        for desc in user["descriptors"]:
            dist = euclidean_distance(desc, data.descriptor)
            if dist < best_distance:
                best_distance = dist
                best_match = user

    if best_distance > 0.6:
        raise HTTPException(status_code=404, detail="Visage inconnu")

    return {
        "user_id": best_match["user_id"],
        "display_name": best_match["display_name"],
        "distance": best_distance,
    }


@app.get("/faces")
def list_faces():
    return list(faces_db.values())


@app.delete("/faces/{user_id}")
def delete_face(user_id: str):
    faces_db.pop(user_id, None)
    user_keys.pop(user_id, None)

    user_dir = BASE_FILES_DIR / user_id
    if user_dir.exists():
        for f in user_dir.iterdir():
            f.unlink()
        user_dir.rmdir()

    return {"deleted": user_id}


@app.delete("/faces")
def delete_all_faces():
    faces_db.clear()
    user_keys.clear()

    for d in BASE_FILES_DIR.iterdir():
        if d.is_dir():
            for f in d.iterdir():
                f.unlink()
            d.rmdir()

    return {"status": "all deleted"}

# ==========================
# FICHIERS (CHIFFRÉS)
# ==========================
@app.get("/users/{user_id}/files")
def list_user_files(user_id: str):
    user_dir = BASE_FILES_DIR / user_id
    if not user_dir.exists():
        return []

    files = []
    for f in user_dir.iterdir():
        if f.is_file() and f.suffix == ".enc":
            files.append({
                "filename": f.stem,
                "size": f.stat().st_size,
                "created_at": datetime.fromtimestamp(f.stat().st_ctime).isoformat()
            })
    return files


@app.post("/users/{user_id}/files")
def upload_user_file(user_id: str, file: UploadFile = File(...)):
    if user_id not in user_keys:
        raise HTTPException(status_code=403)

    user_dir = BASE_FILES_DIR / user_id
    user_dir.mkdir(parents=True, exist_ok=True)

    data = file.file.read()
    fernet = Fernet(user_keys[user_id])
    encrypted = fernet.encrypt(data)

    dest = user_dir / f"{file.filename}.enc"
    dest.write_bytes(encrypted)

    return {"filename": file.filename}


@app.get("/users/{user_id}/files/{filename}")
def download_user_file(user_id: str, filename: str):
    if user_id not in user_keys:
        raise HTTPException(status_code=403)

    enc_file = BASE_FILES_DIR / user_id / f"{filename}.enc"
    if not enc_file.exists():
        raise HTTPException(status_code=404)

    fernet = Fernet(user_keys[user_id])
    decrypted = fernet.decrypt(enc_file.read_bytes())

    temp = BASE_FILES_DIR / user_id / filename
    temp.write_bytes(decrypted)

    return FileResponse(temp, filename=filename)


@app.delete("/users/{user_id}/files/{filename}")
def delete_user_file(user_id: str, filename: str):
    enc_file = BASE_FILES_DIR / user_id / f"{filename}.enc"
    if not enc_file.exists():
        raise HTTPException(status_code=404)

    enc_file.unlink()
    return {"deleted": filename}
