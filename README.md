# FaceX — Face Authentication with Encrypted Personal Storage

Web application where users **sign up and log in with their face** and get a personal space for **encrypted files**.
Group project in the Big Data & AI program (2025–2026).

> Educational prototype: it shows the concepts, not production-grade security. See [Security limitations](#security-limitations).

## Features

- **Face sign-up and login**: [face-api.js](https://github.com/justadudewhohacks/face-api.js) runs in the browser (Tiny Face Detector, 68 facial landmarks, face recognition network) and computes a 128-dimension face descriptor. The backend matches it against registered users by Euclidean distance (threshold 0.6).
- **Basic liveness check**: the nose landmark is tracked for about 1.8 seconds, and the user must move slightly. This blocks a perfectly still photo.
- **Encrypted personal storage**: each user gets a Fernet key (AES-128-CBC + HMAC-SHA256) when signing up. Uploaded files are encrypted before they are written to disk, and decrypted when downloaded.
- **Admin dashboard**: list the registered faces, delete one user or all users, along with their files.
- **REST API** with FastAPI and interactive docs at `/docs`.

## Architecture

```
Browser (HTML + Tailwind + face-api.js)
  ├─ webcam capture, face detection, 128-d descriptor, liveness check
  └─ REST calls ─────────────► FastAPI backend (faceid_backend/main.py)
                                  ├─ face registry (in memory)
                                  ├─ per-user Fernet keys (in memory)
                                  └─ encrypted files on disk: user_files/<user_id>/*.enc
```

## API

| Method | Endpoint | Description |
|---|---|---|
| POST | `/faces/register` | Register a face descriptor and create a user and its encryption key |
| POST | `/faces/recognize` | Find the closest registered face (rejected if distance > 0.6) |
| GET | `/faces` | List the registered users |
| DELETE | `/faces/{user_id}` | Delete a user and their files |
| DELETE | `/faces` | Delete all users and files |
| GET | `/users/{user_id}/files` | List a user's encrypted files |
| POST | `/users/{user_id}/files` | Upload a file (encrypted on the server) |
| GET | `/users/{user_id}/files/{filename}` | Download and decrypt a file |
| DELETE | `/users/{user_id}/files/{filename}` | Delete a file |

## Project structure

```
faceid_backend/main.py      FastAPI backend (faces, keys, encrypted files)
index.html                  landing page
signup.html / login.html    face sign-up and login (webcam)
secure.html                 personal encrypted file space
admin-login.html / admin.html   admin access and dashboard
menu.html, script.js        shared navigation and face logic
```

## Getting started

1. **Backend** (Python 3.10+)
   ```bash
   cd faceid_backend
   pip install -r ../requirements.txt
   uvicorn main:app --reload
   ```
   The API runs at `http://127.0.0.1:8000`.
2. **Frontend**: serve the root folder with any static server so the webcam works over `http://localhost`:
   ```bash
   python -m http.server 5500
   ```
   Then open `http://localhost:5500/index.html`. face-api.js and its model weights load from a CDN.
3. **Admin page**: the admin login in `admin-login.html` is a placeholder (`admin@example.com` / `change-me`). Change it before you use it.

## Security limitations

These limitations are known and documented on purpose. They are the next things to improve:

- **No server-side session or authorization.** The `user_id` returned after face login acts as the only credential, and `GET /faces` exposes every user ID. Anyone who can reach the API can therefore access any user's files.
- **The admin login is checked only in the browser.** It is not real protection.
- **Data is kept in memory.** Faces and encryption keys are lost when the server restarts, which makes stored files impossible to decrypt.
- **Decrypted files are written to disk on download** and are never deleted afterwards.
- **File names are not sanitized** (risk of path traversal), and CORS allows every origin.
- **The liveness check is basic.** It can be fooled by a video or by moving a photo.

## Possible improvements

- Issue JWT sessions after face login and check ownership on every file endpoint.
- Store users and wrapped keys in a database, with a master key in a secrets manager.
- Stream decrypted content without writing it to disk, and sanitize file names.
- Implement a real admin role on the backend.
- Use stronger anti-spoofing (blink or head-turn challenge, depth cues).
