"""
J.A.R.V.I.S. — Voice Engine
Handles wake word detection, speech recognition, and text-to-speech.
"""

import speech_recognition as sr
import pyttsx3
import threading
import queue
import time
import sys


class SoundDeviceMicrophone(sr.AudioSource):
    """AudioSource implementation using sounddevice when PyAudio is unavailable.
    Keeps stream open across listen cycles to eliminate device renegotiation latency."""
    class StreamWrapper:
        def __init__(self, raw_stream):
            self.raw_stream = raw_stream

        def read(self, size):
            try:
                data, _ = self.raw_stream.read(size)
                return bytes(data)
            except Exception:
                return b'\x00' * (size * 2)

        def close(self):
            pass  # Keep stream alive for ultra-fast continuous listening

    def __init__(self, device=None, sample_rate=16000, chunk_size=1024):
        self.device = device
        self.SAMPLE_RATE = sample_rate
        self.CHUNK = chunk_size
        self.SAMPLE_WIDTH = 2
        self.raw_stream = None
        self.stream = None

    def _ensure_stream(self):
        import sounddevice as sd
        if self.raw_stream is None or not self.raw_stream.active:
            try:
                self.raw_stream = sd.RawInputStream(
                    samplerate=self.SAMPLE_RATE,
                    blocksize=self.CHUNK,
                    device=self.device,
                    channels=1,
                    dtype='int16'
                )
                self.raw_stream.start()
                self.stream = self.StreamWrapper(self.raw_stream)
            except Exception as e:
                print(f"[JARVIS Voice] Error starting sounddevice stream: {e}")
                raise

    def __enter__(self):
        self._ensure_stream()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        pass  # Keep stream active to prevent lag

    def close(self):
        if self.raw_stream:
            try:
                self.raw_stream.stop()
                self.raw_stream.close()
            except Exception:
                pass
            self.raw_stream = None
            self.stream = None


def get_microphone(device_index=None):
    """Obtain a working microphone source using PyAudio or sounddevice."""
    try:
        return sr.Microphone(device_index=device_index)
    except Exception as e:
        print(f"[JARVIS Voice] PyAudio microphone not available ({e}). Using sounddevice fallback.")
        return SoundDeviceMicrophone(device=device_index)


class VoiceEngine:
    """Manages microphone input, speech recognition, and TTS output."""

    def __init__(self, wake_word="jarvis", on_wake=None, on_command=None,
                 on_speaking=None, on_idle=None, on_error=None, on_listening=None):
        self.wake_word = wake_word.lower()
        self.on_wake = on_wake             # Called when wake word detected
        self.on_command = on_command         # Called with recognized command text
        self.on_speaking = on_speaking       # Called when TTS starts
        self.on_idle = on_idle               # Called when returning to idle
        self.on_error = on_error             # Called on error
        self.on_listening = on_listening     # Called when actively listening

        # Speech Recognition - Optimized parameters for faster response
        self.recognizer = sr.Recognizer()
        self.recognizer.energy_threshold = 280
        self.recognizer.dynamic_energy_threshold = True
        self.recognizer.dynamic_energy_adjustment_damping = 0.15
        self.recognizer.dynamic_energy_ratio = 1.4
        self.recognizer.pause_threshold = 0.6          # Fast response: 0.6s of silence triggers end of speech
        self.recognizer.phrase_threshold = 0.2
        self.recognizer.non_speaking_duration = 0.4

        # Text-to-Speech
        self.tts_engine = None
        self._init_tts()

        # State
        self.is_running = False
        self.is_listening_for_command = False
        self._trigger_listen_requested = False
        self.is_speaking_flag = False                 # Prevents JARVIS from hearing its own speech
        self.speak_queue = queue.Queue()
        self._speak_thread = None
        self._listen_thread = None
        self._mic_instance = None

    def _init_tts(self):
        """Initialize the TTS engine with a JARVIS-like voice."""
        try:
            try:
                import pythoncom
                pythoncom.CoInitialize()
            except Exception:
                pass

            self.tts_engine = pyttsx3.init()
            voices = self.tts_engine.getProperty('voices')

            # Prefer a male English voice for JARVIS character
            selected = None
            for voice in voices:
                name_lower = voice.name.lower()
                if 'david' in name_lower or 'mark' in name_lower or 'james' in name_lower:
                    selected = voice
                    break
                elif 'male' in name_lower and 'english' in name_lower:
                    selected = voice
                    break

            if not selected:
                for voice in voices:
                    if 'english' in voice.name.lower() or 'en' in voice.id.lower():
                        selected = voice
                        break

            if selected:
                self.tts_engine.setProperty('voice', selected.id)

            self.tts_engine.setProperty('rate', 175)     # Words per minute
            self.tts_engine.setProperty('volume', 1.0)

            print(f"[JARVIS Voice] TTS initialized. Voice: {selected.name if selected else 'default'}")
        except Exception as e:
            print(f"[JARVIS Voice] TTS init error: {e}")

    def start(self):
        """Start the voice engine — begins listening for the wake word."""
        if self.is_running:
            return

        self.is_running = True
        print("[JARVIS Voice] Voice engine started. Listening for wake word...")

        # Start the TTS consumer thread
        self._speak_thread = threading.Thread(target=self._speak_worker, daemon=True)
        self._speak_thread.start()

        # Start the main listener thread
        self._listen_thread = threading.Thread(target=self._listen_loop, daemon=True)
        self._listen_thread.start()

    def stop(self):
        """Stop the voice engine."""
        self.is_running = False
        if self._mic_instance and hasattr(self._mic_instance, 'close'):
            try:
                self._mic_instance.close()
            except Exception:
                pass
        print("[JARVIS Voice] Voice engine stopped.")

    def speak(self, text):
        """Queue text to be spoken."""
        self.speak_queue.put(text)

    def trigger_listen(self):
        """Programmatically trigger command listening (e.g. from web UI 'Click to Speak')."""
        self._trigger_listen_requested = True
        print("[JARVIS Voice] Command listening triggered programmatically.")

    def _speak_worker(self):
        """Background thread that processes the TTS queue."""
        try:
            import pythoncom
            pythoncom.CoInitialize()
        except Exception:
            pass

        if self.tts_engine is None:
            self._init_tts()

        while self.is_running:
            try:
                text = self.speak_queue.get(timeout=0.5)
                if text and self.tts_engine:
                    try:
                        self.is_speaking_flag = True
                        if self.on_speaking:
                            self.on_speaking(text)
                        print(f"[JARVIS Voice] Speaking: {text[:80]}...")
                        self.tts_engine.say(text)
                        self.tts_engine.runAndWait()
                        time.sleep(0.35)  # Let speaker audio dissipate completely
                    finally:
                        self.is_speaking_flag = False
                        if self.on_idle:
                            self.on_idle()
            except queue.Empty:
                continue
            except Exception as e:
                self.is_speaking_flag = False
                print(f"[JARVIS Voice] TTS error: {e}")

    def _listen_loop(self):
        """Main loop: continuously listens for the wake word, then captures commands."""
        mic = None
        try:
            mic = get_microphone()
            self._mic_instance = mic
        except Exception as e:
            print(f"[JARVIS Voice] Microphone error: {e}")
            if self.on_error:
                self.on_error(f"Microphone not available: {e}")
            return

        try:
            with mic as source:
                print("[JARVIS Voice] Adjusting for ambient noise...")
                self.recognizer.adjust_for_ambient_noise(source, duration=0.3)
                print("[JARVIS Voice] Ambient noise calibration complete.")
        except Exception as e:
            print(f"[JARVIS Voice] Ambient noise calibration warning: {e}")

        while self.is_running:
            try:
                if self.is_speaking_flag:
                    time.sleep(0.15)
                    continue

                if self._trigger_listen_requested:
                    self._trigger_listen_requested = False
                    if self.on_wake:
                        self.on_wake()
                    self._listen_for_command(mic)
                    continue

                self._listen_for_wake_word(mic)
            except Exception as e:
                print(f"[JARVIS Voice] Listen loop error: {e}")
                time.sleep(0.5)

    def _listen_for_wake_word(self, mic):
        """Listen for the wake word in ambient audio."""
        if self.is_speaking_flag:
            time.sleep(0.1)
            return

        with mic as source:
            try:
                audio = self.recognizer.listen(source, timeout=2.0, phrase_time_limit=4.0)
            except sr.WaitTimeoutError:
                return  # No speech detected, loop again

        if self.is_speaking_flag:
            return  # Discard if audio occurred while TTS was speaking

        # Try to recognize
        try:
            text = self.recognizer.recognize_google(audio).lower()
            print(f"[JARVIS Voice] Heard: '{text}'")

            wake_variations = [self.wake_word, "jarvis", "jarves", "javis", "harvest", "charvis", "service", "travis"]
            detected_wake = any(w in text for w in wake_variations)

            if detected_wake:
                print("[JARVIS Voice] >> Wake word detected!")

                # Extract command after wake word variant
                matched_word = next((w for w in wake_variations if w in text), self.wake_word)
                parts = text.split(matched_word, 1)
                trailing = parts[1].strip().strip(',').strip() if len(parts) > 1 else ""

                if self.on_wake:
                    self.on_wake()

                if trailing and len(trailing) > 2:
                    # Command was included with wake word (e.g. "JARVIS open whatsapp")
                    print(f"[JARVIS Voice] Command in wake phrase: '{trailing}'")
                    if self.on_command:
                        self.on_command(trailing)
                else:
                    # Wake word alone -> Acknowledge immediately so user knows JARVIS is listening!
                    print("[JARVIS Voice] Acknowledging wake word with 'Yes, Sir?'...")
                    self.speak("Yes, Sir?")
                    time.sleep(0.9)
                    while self.is_speaking_flag:
                        time.sleep(0.1)
                    self._listen_for_command(mic)

        except sr.UnknownValueError:
            pass  # Couldn't understand — keep listening
        except sr.RequestError as e:
            print(f"[JARVIS Voice] Speech API error: {e}")
            if self.on_error:
                self.on_error(f"Speech recognition service error: {e}")

    def _listen_for_command(self, mic):
        """Actively listen for a command after wake word is detected."""
        self.is_listening_for_command = True
        if self.on_listening:
            self.on_listening()

        print("[JARVIS Voice] Listening for command...")

        with mic as source:
            try:
                audio = self.recognizer.listen(source, timeout=5.0, phrase_time_limit=10.0)
            except sr.WaitTimeoutError:
                print("[JARVIS Voice] No command heard. Returning to standby.")
                self.is_listening_for_command = False
                if self.on_idle:
                    self.on_idle()
                return

        self.is_listening_for_command = False

        try:
            command = self.recognizer.recognize_google(audio)
            print(f"[JARVIS Voice] Command: '{command}'")
            if self.on_command:
                self.on_command(command)
        except sr.UnknownValueError:
            print("[JARVIS Voice] Could not understand command.")
            self.speak("I didn't catch that, Sir. Please try again.")
        except sr.RequestError as e:
            print(f"[JARVIS Voice] API error: {e}")
            if self.on_error:
                self.on_error(str(e))
