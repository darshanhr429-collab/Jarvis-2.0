"""
J.A.R.V.I.S. — Desktop Voice Assistant
Serves the app on localhost for Web Speech API compatibility,
then opens it in a pywebview desktop window with Python AI bridge.
"""

import os
import sys
import threading
import json
import time
import http.server
import socketserver
import functools

# Add the app directory to path
APP_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, APP_DIR)

from ai_brain import AIBrain
from voice_engine import VoiceEngine

# ============================================
# Local HTTP Server (for Web Speech API)
# ============================================
def get_server_port():
    try:
        with open(os.path.join(APP_DIR, 'config.json'), 'r') as f:
            return json.load(f).get('server_port', 8742)
    except:
        return 8742

SERVER_PORT = get_server_port()
_global_brain = None
_server = None
_voice_engine_instance = None
_voice_events = []
_voice_event_lock = threading.Lock()
_active_voice_mode = "python"


def push_voice_event(event_type, data=None):
    """Record a voice event so both web and desktop UIs stay perfectly in sync."""
    global _voice_events
    with _voice_event_lock:
        event = {
            "id": len(_voice_events) + 1,
            "type": event_type,
            "data": data or {},
            "timestamp": time.time()
        }
        _voice_events.append(event)
        if len(_voice_events) > 100:
            _voice_events = _voice_events[-50:]
        return event


class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    allow_reuse_address = True
    daemon_threads = True


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=APP_DIR, **kwargs)

    def log_message(self, format, *args):
        pass  # Suppress normal access logs

    def end_headers(self):
        """Inject no-cache headers for all responses."""
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
        self.send_header('Access-Control-Max-Age', '86400')
        self.end_headers()

    def _send_json(self, data, status=200):
        """Send JSON response with full CORS support."""
        try:
            payload = json.dumps(data).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:
            print(f"[JARVIS Server] Error sending JSON: {e}")

    def _send_error_json(self, message, status=500):
        """Send JSON error response."""
        self._send_json({"error": str(message), "success": False}, status=status)

    def do_GET(self):
        global _global_brain, _active_voice_mode
        
        try:
            # Ensure brain is initialized
            if _global_brain is None:
                _global_brain = AIBrain()

            from urllib.parse import urlparse, parse_qs
            parsed = urlparse(self.path)
            clean_path = parsed.path
            params = parse_qs(parsed.query)

            # Enforce fresh loading: redirect unversioned / or /index.html to cache-busted v5.0
            if clean_path in ('/', '/index.html') and 'v=5.0' not in self.path:
                self.send_response(302)
                self.send_header('Location', f'/index.html?v=5.0&t={int(time.time())}')
                self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0')
                self.send_header('Pragma', 'no-cache')
                self.send_header('Expires', '0')
                self.end_headers()
                return

            # Check API routes
            if clean_path == '/api/version':
                self._send_json({"version": "5.0", "edition": "Kali Ops Terminal", "timestamp": time.time()})
                return

            elif clean_path == '/api/command':
                text = params.get('text', [''])[0].strip()
                response_text = _global_brain.process(text) if text else ""
                self._send_json({"response": response_text})
                return

            elif clean_path == '/api/open_app':
                app_name = params.get('name', [''])[0].strip()
                response_text = _global_brain._open_app(app_name) if app_name else "No app name specified, Sir."
                self._send_json({"response": response_text})
                return

            elif clean_path == '/api/config':
                status = _global_brain.get_status()
                self._send_json({
                    "gemini_connected": status.get('using_gemini', False),
                    "key_preview": status.get('key_preview', ''),
                    "model": status.get('model_name', ''),
                    "last_error": status.get('last_error', None),
                })
                return

            elif clean_path == '/api/status':
                self._send_json(_global_brain.get_status())
                return

            elif clean_path == '/api/set_key':
                key = params.get('key', [''])[0].strip()
                res = _global_brain.set_api_key(key)
                self._send_json(res)
                return

            elif clean_path == '/api/delete_memory':
                mem_id = params.get('id', [''])[0].strip()
                success = _global_brain.delete_memory(mem_id)
                self._send_json({"success": success})
                return

            elif clean_path == '/api/voice_feed':
                try:
                    since_id = int(params.get('since', [0])[0])
                except Exception:
                    since_id = 0
                with _voice_event_lock:
                    new_events = [e for e in _voice_events if e['id'] > since_id]
                self._send_json({
                    "events": new_events,
                    "mode": _active_voice_mode,
                    "engine_running": _voice_engine_instance.is_running if _voice_engine_instance else False
                })
                return

            elif clean_path == '/api/voice_mode':
                mode = params.get('mode', [''])[0].strip().lower()
                if mode in ('python', 'browser', 'text'):
                    _active_voice_mode = mode
                    push_voice_event("mode_change", {"mode": _active_voice_mode})
                self._send_json({"mode": _active_voice_mode})
                return

            elif clean_path == '/api/trigger_listen':
                if _voice_engine_instance:
                    _voice_engine_instance.trigger_listen()
                    push_voice_event("listening")
                self._send_json({"status": "listening"})
                return

            # Serve static files normally
            super().do_GET()

        except Exception as e:
            print(f"[JARVIS Server] GET error ({self.path}): {e}")
            self._send_error_json(str(e))

    def do_POST(self):
        """Handle POST requests from browser (command JSON, key update, voice mode, etc.)."""
        global _global_brain, _active_voice_mode

        try:
            if _global_brain is None:
                _global_brain = AIBrain()

            from urllib.parse import urlparse
            clean_path = urlparse(self.path).path

            content_length = int(self.headers.get('Content-Length', 0))
            raw_body = self.rfile.read(content_length).decode('utf-8', errors='ignore') if content_length > 0 else ""
            body = {}
            if raw_body:
                try:
                    body = json.loads(raw_body)
                except Exception:
                    from urllib.parse import parse_qs
                    body = {k: v[0] for k, v in parse_qs(raw_body).items()}

            if clean_path == '/api/command':
                text = body.get('text', '').strip()
                response_text = _global_brain.process(text) if text else ''
                self._send_json({"response": response_text})

            elif clean_path == '/api/set_key':
                key = body.get('key', '').strip()
                if key:
                    result = _global_brain.set_api_key(key)
                    self._send_json(result if isinstance(result, dict) else {"success": True, "message": "Key updated."})
                else:
                    self._send_json({"success": False, "error": "No key provided."})

            elif clean_path == '/api/open_app':
                app_name = body.get('name', '').strip()
                response_text = _global_brain._open_app(app_name) if app_name else "No app name specified, Sir."
                self._send_json({"response": response_text})

            elif clean_path == '/api/delete_memory':
                mem_id = body.get('id', '')
                success = _global_brain.delete_memory(mem_id)
                self._send_json({"success": success})

            elif clean_path == '/api/voice_mode':
                mode = body.get('mode', '').strip().lower()
                if mode in ('python', 'browser', 'text'):
                    _active_voice_mode = mode
                    push_voice_event("mode_change", {"mode": _active_voice_mode})
                self._send_json({"mode": _active_voice_mode})

            elif clean_path == '/api/trigger_listen':
                if _voice_engine_instance:
                    _voice_engine_instance.trigger_listen()
                    push_voice_event("listening")
                self._send_json({"status": "listening"})

            else:
                self.send_response(404)
                self.end_headers()

        except Exception as e:
            print(f"[JARVIS Server] POST error ({self.path}): {e}")
            self._send_error_json(str(e))


def start_http_server():
    """Start a local threaded HTTP server to serve JARVIS files."""
    global _server

    try:
        _server = ThreadedHTTPServer(("127.0.0.1", SERVER_PORT), QuietHandler)
        print(f"[JARVIS] Threaded HTTP server started on http://127.0.0.1:{SERVER_PORT}")
        _server.serve_forever()
    except OSError as e:
        print(f"[JARVIS] HTTP server error: {e}")


# ============================================
# JARVIS Python ↔ JS Bridge API
# ============================================
class JarvisAPI:
    """Exposed to JavaScript via pywebview.api"""

    def __init__(self):
        self.brain = _global_brain

    def send_text_command(self, text):
        """Process a text command through the AI brain."""
        if not text or not text.strip():
            return ""
        return self.brain.process(text.strip())

    def is_gemini_active(self):
        """Check if Gemini is connected."""
        return self.brain.using_gemini

    def set_gemini_key(self, key):
        """Set or update Gemini API key and test it."""
        if key and key.strip():
            return self.brain.set_api_key(key.strip())
        return {"success": False, "error": "Empty API key"}

    def get_status(self):
        """Return the status of the AI Brain including memory list and active settings."""
        return self.brain.get_status()

    def delete_memory(self, mem_id):
        """Delete a memory from the python brain."""
        return self.brain.delete_memory(mem_id)


def is_server_running(port=SERVER_PORT):
    """Check if JARVIS HTTP server is already running on localhost."""
    import socket
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.8)
            return s.connect_ex(('127.0.0.1', port)) == 0
    except Exception:
        return False


def run_interactive_cli(is_remote=False):
    """Provide an immediate, interactive command line interface in Command Prompt."""
    url = f'http://127.0.0.1:{SERVER_PORT}/index.html?v=5.0'
    print("=" * 65)
    print("   J.A.R.V.I.S. — KALI OPS TERMINAL // CYBER-OPS CORE (v5.0)    ")
    print("=" * 65)
    print(f"  Status:   ONLINE (Port {SERVER_PORT}) [ROOT_ALPHA]")
    print("  Brain:    Google Gemini Neural Network (Active)")
    print("  Voice:    Microphone Active & Listening (Realtek)")
    print(f"  Web Deck: {url}")
    print(f"  Orbital:  http://127.0.0.1:{SERVER_PORT}/earth_landing_page.html")
    print("=" * 65)
    print("  Type any command below, or say 'JARVIS' into your microphone:")
    print("  Examples: 'open earth', 'what can you open', 'what time is it'")
    print("  (Type 'exit' to quit this terminal)")
    print("=" * 65)
    print()

    global _global_brain, _voice_engine_instance

    # If stdin is not a console (e.g. background daemon service), keep running without prompting
    is_console = sys.stdin.isatty() if (hasattr(sys.stdin, 'isatty') and sys.stdin) else False
    if not is_console:
        print("[JARVIS] Background daemon active. Voice engine and HTTP server running.")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass
        return

    while True:
        try:
            user_input = input("root@jarvis-lobby:~$ ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n[JARVIS] Closing interactive session. Goodbye, Sir.")
            break

        if not user_input:
            continue

        if user_input.lower() in ('exit', 'quit', 'bye', 'close'):
            print("[JARVIS] Session ended, Sir.")
            break

        response = ""
        if is_remote:
            try:
                import urllib.request
                req_url = f"http://127.0.0.1:{SERVER_PORT}/api/command"
                payload = json.dumps({"text": user_input}).encode('utf-8')
                req = urllib.request.Request(req_url, data=payload, headers={'Content-Type': 'application/json'}, method='POST')
                with urllib.request.urlopen(req, timeout=20) as resp:
                    data = json.loads(resp.read().decode('utf-8'))
                    response = data.get('response', '')
            except Exception as e:
                response = f"Communication error with core server: {e}"
        else:
            if _global_brain is None:
                _global_brain = AIBrain()
            response = _global_brain.process(user_input)
            push_voice_event("command", {"command": user_input})
            push_voice_event("response", {"command": user_input, "response": response})
            if _voice_engine_instance:
                _voice_engine_instance.speak(response)

        print(f"\n[J.A.R.V.I.S. // KERNEL]: {response}\n")


# ============================================
# Main Entry
# ============================================
def main():
    global _global_brain, _voice_engine_instance
    url = f'http://127.0.0.1:{SERVER_PORT}/index.html?v=5.0&t={int(time.time())}'

    # Check for direct CLI arguments (e.g. 'jarvis earth', 'jarvis "what time is it"')
    if len(sys.argv) > 1:
        cli_arg = " ".join(sys.argv[1:]).strip()
        if cli_arg.lower() in ('earth', 'open earth', 'globe', 'planetary', 'orbital', 'lighting', 'live lighting', '--earth', '-e'):
            import webbrowser
            target_url = f'http://127.0.0.1:{SERVER_PORT}/earth_landing_page.html'
            if not is_server_running(SERVER_PORT):
                webbrowser.open(os.path.join(APP_DIR, 'earth_landing_page.html'))
            else:
                webbrowser.open(target_url)
            print()
            print("=" * 65)
            print("  TERRAPRIME // PLANETARY OBSERVATION DECK (LIVE LIGHTING ACTIVE)")
            print("=" * 65)
            print("  [+] Background:  Panoramic Milky Way Nebula Skydome (6,000 Stars)")
            print("  [+] Lighting:    Real-Time Sun Tracking & Dynamic Day/Night Terminator")
            print("  [+] Shader:      Ocean Specular Glint & Rayleigh Atmospheric Rim")
            print("  [+] Night Side:  Emissive City Constellations Active")
            print("=" * 65)
            print("  [J.A.R.V.I.S.]: Deploying 3D Earth with Live Lighting now, Sir.")
            print("=" * 65)
            print()
            return

        if is_server_running(SERVER_PORT):
            import urllib.request
            req_url = f"http://127.0.0.1:{SERVER_PORT}/api/command"
            payload = json.dumps({"text": cli_arg}).encode('utf-8')
            req = urllib.request.Request(req_url, data=payload, headers={'Content-Type': 'application/json'}, method='POST')
            try:
                with urllib.request.urlopen(req, timeout=20) as resp:
                    data = json.loads(resp.read().decode('utf-8'))
                    print(f"\n[J.A.R.V.I.S.]: {data.get('response', '')}\n")
            except Exception as e:
                print(f"[JARVIS Error]: {e}")
            return
        else:
            _global_brain = AIBrain()
            res = _global_brain.process(cli_arg)
            print(f"\n[J.A.R.V.I.S.]: {res}\n")
            return

    # If already running, launch fresh browser tab with cache-buster and open interactive CLI
    if is_server_running(SERVER_PORT):
        import webbrowser
        webbrowser.open(url)
        run_interactive_cli(is_remote=True)
        return

    # Initialize the brain first
    _global_brain = AIBrain()

    # Start HTTP server in background
    server_thread = threading.Thread(target=start_http_server, daemon=True)
    server_thread.start()
    time.sleep(0.5)  # Let server start

    window = None

    def safe_eval_js(script):
        try:
            if window:
                window.evaluate_js(script)
        except Exception:
            pass

    # Initialize Python Voice Engine
    try:
        def on_wake():
            push_voice_event("wake")
            safe_eval_js("window.onWakeWord && window.onWakeWord();")

        def on_listening():
            push_voice_event("listening")
            safe_eval_js("window.onListening && window.onListening();")

        def handle_voice_command(cmd):
            push_voice_event("command", {"command": cmd})
            safe_eval_js(f"window.onCommand && window.onCommand({json.dumps(cmd)});")
            res = _global_brain.process(cmd)
            push_voice_event("response", {"command": cmd, "response": res})
            safe_eval_js(f"window.onResponse && window.onResponse({json.dumps(res)});")
            voice_engine.speak(res)

        def on_speaking(text):
            push_voice_event("speaking", {"text": text})
            safe_eval_js("window.onSpeaking && window.onSpeaking();")

        def on_idle():
            push_voice_event("idle")
            safe_eval_js("window.onIdle && window.onIdle();")

        def on_error(err):
            push_voice_event("error", {"error": str(err)})
            safe_eval_js(f"window.onVoiceError && window.onVoiceError({json.dumps(str(err))});")

        voice_engine = VoiceEngine(
            on_wake=on_wake,
            on_listening=on_listening,
            on_command=handle_voice_command,
            on_speaking=on_speaking,
            on_idle=on_idle,
            on_error=on_error,
        )
        _voice_engine_instance = voice_engine
        voice_engine.start()
        print("[JARVIS] Standalone Python Voice Engine initialized and listening.")
    except Exception as ve_err:
        print(f"[JARVIS] Python Voice Engine init warning: {ve_err}")

    # Create the JARVIS API
    api = JarvisAPI()

    # Check if native desktop GUI (pywebview) is usable
    can_use_webview = False
    try:
        import webview
        import clr
        can_use_webview = True
    except Exception:
        can_use_webview = False

    if can_use_webview:
        try:
            import webview
            window = webview.create_window(
                title='J.A.R.V.I.S. — AI Voice Assistant',
                url=url,
                width=1400,
                height=900,
                min_size=(800, 500),
                resizable=True,
                maximized=True,
                frameless=False,
                easy_drag=False,
                text_select=True,
                on_top=False,
                background_color='#010a13',
                js_api=api,
            )

            gui_options = ['edgechromium', 'mshtml', None]
            gui_success = False
            for gui in gui_options:
                try:
                    print(f"[JARVIS] Starting standalone GUI with backend: {gui or 'auto'}")
                    if gui:
                        webview.start(debug=False, gui=gui)
                    else:
                        webview.start(debug=False)
                    gui_success = True
                    break
                except Exception as e:
                    print(f"[JARVIS] Standalone GUI backend '{gui}' failed: {e}")

            if not gui_success:
                can_use_webview = False

        except Exception as e:
            print(f"[JARVIS] GUI window init warning: {e}")
            can_use_webview = False

    if not can_use_webview:
        import webbrowser
        print(f"[JARVIS] Opening web interface: {url}")
        webbrowser.open(url)
        run_interactive_cli(is_remote=False)

    # Cleanup
    if _voice_engine_instance:
        _voice_engine_instance.stop()
    if _server:
        _server.shutdown()


if __name__ == '__main__':
    main()
