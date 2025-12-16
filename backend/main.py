from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from fastapi.responses import FileResponse
import uvicorn
import os
import time
from pydub import AudioSegment
from basic_pitch.inference import predict_and_save, Model
from basic_pitch import ICASSP_2022_MODEL_PATH
from fastapi.middleware.cors import CORSMiddleware

AudioSegment.converter = "C:/ffmpeg/bin/ffmpeg.exe"
AudioSegment.ffmpeg = "C:/ffmpeg/bin/ffmpeg.exe"
AudioSegment.ffprobe = "C:/ffmpeg/bin/ffprobe.exe"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173",
                   "http://localhost:8100",
                   "http://192.168.1.10:8100",
                   "*",
                   "capacitor://localhost"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


model = Model(ICASSP_2022_MODEL_PATH)

UPLOAD_DIR = "uploads"
OUTPUT_DIR = "outputs"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

@app.post("/upload-audio/")
async def upload_audio(file: UploadFile = File(...)):
    try:
        # Salva file grezzo
        input_path = os.path.join(UPLOAD_DIR, f"raw_{int(time.time())}_{file.filename}")
        with open(input_path, "wb") as f:
            f.write(await file.read())

        # Converte in WAV PCM 16-bit
        wav_path = os.path.splitext(input_path)[0] + ".wav"
        audio = AudioSegment.from_file(input_path)
        audio = audio.set_channels(1).set_frame_rate(44100)
        audio.export(wav_path, format="wav")

        predict_and_save(
            [wav_path],
            output_directory=OUTPUT_DIR,
            save_model_outputs=False,
            save_notes=False,
            save_midi=True,
            sonify_midi=False,
            model_or_model_path=model,
        )

        # Basic Pitch genera nome tipo "xxx_basic_pitch.mid"
        default_output = os.path.splitext(wav_path)[0] + "_basic_pitch.mid"
        midi_file = os.path.basename(default_output)

        return JSONResponse(content={"midi_file": midi_file})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/download-midi/{filename}")
async def download_midi(filename: str):
    """Scarica un file MIDI già convertito"""
    filepath = os.path.join(OUTPUT_DIR, filename)
    if os.path.exists(filepath):
        return FileResponse(filepath, media_type="audio/midi", filename=filename)
    return {"error": "File not found"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
