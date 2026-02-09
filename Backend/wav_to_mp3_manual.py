import requests
import soundfile as sf
import numpy as np
from lameenc import Encoder
from io import BytesIO
import os

# ==========================
# CONFIG
# ==========================
WAV_URL = "{Recording URL}"
OUTPUT_MP3 = "output.mp3"
BITRATE = 192  # kbps (use 256 or 320 if you want even closer quality)

# ==========================
# DOWNLOAD WAV
# ==========================
print("Downloading WAV...")
resp = requests.get(WAV_URL)
resp.raise_for_status()
wav_bytes = resp.content

# ==========================
# READ WAV
# ==========================
print("Reading WAV...")
audio, sample_rate = sf.read(BytesIO(wav_bytes), dtype="float32")

# Ensure shape: (samples, channels)
if audio.ndim == 1:
    audio = audio[:, np.newaxis]

channels = audio.shape[1]

# ==========================
# PROPER PCM CONVERSION (CRITICAL)
# ==========================
# Clip to valid range
audio = np.clip(audio, -1.0, 1.0)

# Convert float32 → int16 PCM
pcm16 = (audio * 32767).astype(np.int16)

# Interleave channels (LAME requirement)
pcm_bytes = pcm16.tobytes()

# ==========================
# MP3 ENCODING (NO FFMPEG)
# ==========================
print("Encoding MP3...")
encoder = Encoder()
encoder.set_bit_rate(BITRATE)
encoder.set_in_sample_rate(sample_rate)
encoder.set_channels(channels)
encoder.set_quality(0)  # 0 = best quality

mp3_data = encoder.encode(pcm_bytes)
mp3_data += encoder.flush()

# ==========================
# SAVE
# ==========================
with open(OUTPUT_MP3, "wb") as f:
    f.write(mp3_data)

print("Done!")
print("Saved MP3 at:", os.path.abspath(OUTPUT_MP3))
