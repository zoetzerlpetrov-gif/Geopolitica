"""Muestras de voz para elegir la de Brújula Diaria: el mismo texto con varias voces abiertas que permiten uso comercial.

Uso:  python3 tools/noticiero_video/muestras_voz.py MOTOR SALIDA_DIR
  MOTOR: piper:<modelo.onnx> · kokoro:<voz> · chatterbox
Licencias: Piper (MIT; cada voz trae su propia licencia), Kokoro-82M (Apache-2.0), Chatterbox de Resemble AI (MIT;
agrega una marca de agua inaudible que identifica el audio como sintético).
"""
import os
import subprocess
import sys

TEXTO = ("Buenos días. Esto es Brújula Diaria, jueves doce de noviembre. "
         "En México, el Banco de México mantuvo su tasa de interés y señaló que vigilará la inflación de los próximos meses. "
         "En el mundo, la Organización Mundial de la Salud pidió reforzar la vacunación antes del invierno. "
         "Y en los mercados, el peso cerró con una ligera ganancia frente al dólar.")


def a_mp3(wav, mp3):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-codec:a", "libmp3lame", "-q:a", "3", mp3], check=True)
    os.remove(wav)


def piper(modelo, salida):
    nombre = os.path.basename(modelo).replace(".onnx", "")
    wav = os.path.join(salida, f"piper-{nombre}.wav")
    subprocess.run(["python3", "-m", "piper", "-m", modelo, "-f", wav], input=TEXTO.encode(), check=True)
    a_mp3(wav, wav.replace(".wav", ".mp3"))


def kokoro(voz, salida):
    import numpy as np
    import soundfile as sf
    from kokoro import KPipeline

    trozos = [audio for _, _, audio in KPipeline(lang_code="e")(TEXTO, voice=voz, speed=1.0)]
    wav = os.path.join(salida, f"kokoro-{voz}.wav")
    sf.write(wav, np.concatenate(trozos), 24000)
    a_mp3(wav, wav.replace(".wav", ".mp3"))


def chatterbox(salida):
    import torchaudio
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS

    modelo = ChatterboxMultilingualTTS.from_pretrained(device="cpu")
    wav = os.path.join(salida, "chatterbox-es.wav")
    torchaudio.save(wav, modelo.generate(TEXTO, language_id="es"), modelo.sr)
    a_mp3(wav, wav.replace(".wav", ".mp3"))


if __name__ == "__main__":
    motor, salida = sys.argv[1], sys.argv[2]
    os.makedirs(salida, exist_ok=True)
    tipo, _, arg = motor.partition(":")
    {"piper": lambda: piper(arg, salida), "kokoro": lambda: kokoro(arg, salida), "chatterbox": lambda: chatterbox(salida)}[tipo]()
    print("listo:", sorted(os.listdir(salida)))
