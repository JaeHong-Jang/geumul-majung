"""음성 인식(STT): 서버의 로컬 Whisper(faster-whisper). 음성은 외부로 보내지 않고 저장하지도 않는다.
모델은 처음 쓸 때 한 번 올린다. 환경변수 STT_MODEL(기본 small), STT_DEVICE(기본 cpu, GPU는 Ollama에 남긴다).
"""
from __future__ import annotations

import io
import os
import threading
import time

MAX_SECONDS = 30
# 인식을 돕는 낱말(재질, 단위). 이 글은 결과에 들어가지 않고 인식 쪽으로만 쓰인다
HINT = ("PP, PE, ABS, PS, PET, 페트, PVC, 고철, 철스크랩, 알루미늄, 구리, 골판지, 시트, 타발, 사출 자투리, 분쇄품, 압축, "
        "300킬로, 500kg, 2톤, kg당 350원, 톤당 30만 원, 수거, 출고, 마대, 톤백, 파레트, 지게차, 정문, 후문, 창고, 야적장, "
        "라벨, 이물질, 섞임, 오염, 보호 필름, 다음 주, 요일, 매달, 정기, 협상 가능")

_lock = threading.Lock()
_model = None


class AudioError(ValueError):
    """사용자 음성이 잘못됨(해석 불가, 너무 김, 소리 없음). 화면에 그대로 보여 줄 문구."""


def model_name() -> str:
    return os.environ.get("STT_MODEL", "small")


def available() -> bool:
    try:
        import faster_whisper  # noqa: F401
        return True
    except Exception:
        return False


def _load():
    global _model
    with _lock:
        if _model is None:
            from faster_whisper import WhisperModel
            device = os.environ.get("STT_DEVICE", "cpu")
            _model = WhisperModel(model_name(), device=device, compute_type="float16" if device == "cuda" else "int8")
    return _model


def warm() -> None:
    """모델을 뒤에서 미리 올린다(이미 올렸으면 아무것도 안 함). 실패해도 녹음할 때 다시 시도한다."""
    if _model is None and not _lock.locked():
        threading.Thread(target=lambda: _safe(_load), daemon=True).start()


def _safe(fn) -> None:
    try:
        fn()
    except Exception:
        pass


def decode(raw: bytes):
    """브라우저 녹음(webm, ogg, mp4, wav)을 16kHz 단일 채널 float32로. faster-whisper의 해석기는 새 PyAV와 맞지 않아 직접 한다."""
    import av
    import numpy as np
    chunks = []
    try:
        resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)
        with av.open(io.BytesIO(raw), mode="r") as container:
            for frame in container.decode(audio=0):
                chunks.extend(f.to_ndarray().reshape(-1) for f in resampler.resample(frame))
                if sum(len(c) for c in chunks) > (MAX_SECONDS + 1) * 16000:
                    raise AudioError(f"음성은 {MAX_SECONDS}초 이하만 가능")
            chunks.extend(f.to_ndarray().reshape(-1) for f in resampler.resample(None))
    except AudioError:
        raise
    except Exception:
        raise AudioError("음성 파일을 읽을 수 없음")
    if not chunks:
        raise AudioError("녹음된 소리 없음")
    return np.concatenate(chunks).astype(np.float32) / 32768.0


def transcribe(raw: bytes) -> dict:
    """{text, seconds, model, ms}. 말이 없으면 text는 빈 문자열."""
    audio = decode(raw)
    t0 = time.monotonic()
    segments, _ = _load().transcribe(audio, language="ko", beam_size=5, vad_filter=True, initial_prompt=HINT)
    text = " ".join(s.text.strip() for s in segments).strip()
    return {"text": text, "seconds": round(len(audio) / 16000, 1), "model": f"whisper-{model_name()}",
            "ms": int((time.monotonic() - t0) * 1000)}
