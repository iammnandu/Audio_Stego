from __future__ import annotations

import base64
import io
import os
import struct
import wave
from typing import Tuple

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

app = FastAPI(title="Secure Audio Steganography")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"] ,
    allow_headers=["*"],
)

MAGIC = b"STEG"
SALT_LEN = 16
PBKDF2_ITERS = 390_000


def derive_key(passcode: str, salt: bytes) -> bytes:
    if not passcode:
        raise ValueError("Passcode is required")
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=PBKDF2_ITERS,
    )
    key = base64.urlsafe_b64encode(kdf.derive(passcode.encode("utf-8")))
    return key


def _bytes_to_bits(data: bytes) -> list[int]:
    bits: list[int] = []
    for byte in data:
        for i in range(7, -1, -1):
            bits.append((byte >> i) & 1)
    return bits


def _bits_to_bytes(bits: list[int]) -> bytes:
    if len(bits) % 8 != 0:
        raise ValueError("Bit length must be multiple of 8")
    out = bytearray()
    for i in range(0, len(bits), 8):
        byte = 0
        for b in bits[i : i + 8]:
            byte = (byte << 1) | b
        out.append(byte)
    return bytes(out)


def _read_wave(upload: UploadFile) -> Tuple[wave.Wave_read, bytes]:
    if not upload.filename or not upload.filename.lower().endswith(".wav"):
        raise HTTPException(status_code=400, detail="Only WAV files are supported")
    raw = upload.file.read()
    try:
        wave_file = wave.open(io.BytesIO(raw), "rb")
        frames = wave_file.readframes(wave_file.getnframes())
        return wave_file, frames
    except wave.Error as exc:
        raise HTTPException(status_code=400, detail="Invalid WAV file") from exc


def _write_wave(params: wave._wave_params, frames: bytes) -> bytes:
    out = io.BytesIO()
    with wave.open(out, "wb") as wf:
        wf.setparams(params)
        wf.writeframes(frames)
    out.seek(0)
    return out.read()


def _embed_payload(frames: bytes, payload: bytes) -> bytes:
    length_prefix = struct.pack(">I", len(payload)
    )  # 4-byte big-endian length
    data = length_prefix + payload
    bits = _bytes_to_bits(data)

    if len(bits) > len(frames):
        raise HTTPException(status_code=400, detail="Audio too small for payload")

    frame_array = bytearray(frames)
    for i, bit in enumerate(bits):
        frame_array[i] = (frame_array[i] & 0xFE) | bit
    return bytes(frame_array)


def _extract_payload(frames: bytes) -> bytes:
    if len(frames) < 32:
        raise HTTPException(status_code=400, detail="Audio too short")

    length_bits = [(frames[i] & 1) for i in range(32)]
    length = struct.unpack(">I", _bits_to_bytes(length_bits))[0]

    total_bits = (length * 8)
    if 32 + total_bits > len(frames):
        raise HTTPException(status_code=400, detail="Corrupted or incomplete data")

    payload_bits = [(frames[i] & 1) for i in range(32, 32 + total_bits)]
    return _bits_to_bytes(payload_bits)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/embed")
async def embed(
    audio: UploadFile = File(...),
    message: str = Form(...),
    passcode: str = Form(...),
):
    if not message.strip():
        raise HTTPException(status_code=400, detail="Message is required")

    wave_file, frames = _read_wave(audio)
    params = wave_file.getparams()
    wave_file.close()

    salt = os.urandom(SALT_LEN)
    key = derive_key(passcode, salt)
    f = Fernet(key)
    token = f.encrypt(message.encode("utf-8"))

    payload = MAGIC + salt + token
    stego_frames = _embed_payload(frames, payload)
    out_bytes = _write_wave(params, stego_frames)

    filename = (audio.filename or "stego.wav").rsplit(".", 1)[0] + "_stego.wav"
    return StreamingResponse(
        io.BytesIO(out_bytes),
        media_type="audio/wav",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@app.post("/extract")
async def extract(
    audio: UploadFile = File(...),
    passcode: str = Form(...),
):
    wave_file, frames = _read_wave(audio)
    wave_file.close()

    payload = _extract_payload(frames)
    if not payload.startswith(MAGIC):
        raise HTTPException(status_code=400, detail="No hidden payload found")

    salt = payload[len(MAGIC) : len(MAGIC) + SALT_LEN]
    token = payload[len(MAGIC) + SALT_LEN :]

    try:
        key = derive_key(passcode, salt)
        f = Fernet(key)
        message = f.decrypt(token).decode("utf-8")
    except (InvalidToken, ValueError):
        raise HTTPException(status_code=400, detail="Invalid passcode or payload")

    return {"message": message}
