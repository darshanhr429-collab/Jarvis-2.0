"""
J.A.R.V.I.S. — AI Brain (v2)
All AI processing routes through here.
Gemini calls happen server-side via urllib (no CORS, no SDK needed).
"""

import os
import re
import time
import datetime
import json
import platform
import subprocess
import random
import urllib.request
import urllib.error
import traceback

APP_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(APP_DIR, 'config.json')

JARVIS_SYSTEM_PROMPT = (
    "You are JARVIS (Just A Rather Very Intelligent System), an advanced AI voice assistant "
    "inspired by the AI from Iron Man. You address the user as 'Sir' at all times. "
    "Your responses will be spoken aloud via text-to-speech, so follow these rules strictly:\n"
    "1. Do NOT use markdown formatting (no **, ##, ```, -, * etc).\n"
    "2. Do NOT use bullet points or numbered lists.\n"
    "3. Do NOT use emojis or special unicode characters.\n"
    "4. Write in natural, flowing spoken English sentences.\n"
    "5. Keep simple answers to 2-3 sentences. For complex topics, use up to 5-6 sentences.\n"
    "6. Be intelligent, calm, professional, witty when appropriate.\n"
    "7. For code requests, describe the logic verbally rather than writing code blocks.\n"
    "8. Never fabricate facts. If you don't know, say so honestly.\n"
    "9. Be proactive with helpful suggestions."
)


def load_config():
    """Load config from config.json."""
    try:
        with open(CONFIG_PATH, 'r') as f:
            return json.load(f)
    except Exception:
        return {}


def save_config(config):
    """Save config to config.json."""
    try:
        with open(CONFIG_PATH, 'w') as f:
            json.dump(config, f, indent=4)
    except Exception as e:
        print(f"[JARVIS Brain] Config save error: {e}")


class AIBrain:
    def __init__(self, gemini_api_key=None):
        self.memories = []
        self.memory_id_counter = 0
        self.gemini_history = []
        self.using_gemini = False
        self.gemini_api_key = None
        self.last_error = None

        # Load API key & model: param > config > env
        config = load_config()
        api_key = gemini_api_key or config.get('gemini_api_key', '') or config.get('openrouter_api_key', '') or os.environ.get('OPENROUTER_API_KEY', '') or os.environ.get('GEMINI_API_KEY', '')
        self.is_openrouter = bool(config.get('is_openrouter', False) or (api_key and (api_key.startswith('sk-or-v1-') or 'openrouter' in config.get('provider', '').lower())))
        default_model = 'google/gemini-3.8-flash' if self.is_openrouter else 'gemini-3.6-flash'
        self.model_name = config.get('model_name', default_model)

        if api_key and api_key.strip():
            self.gemini_api_key = api_key.strip()
            # Quick validation: key should look like an API key
            if len(self.gemini_api_key) > 10:
                self.using_gemini = True
                self.is_openrouter = self.gemini_api_key.startswith('sk-or-v1-') or '/' in self.model_name
                # Persist to config
                if self.is_openrouter:
                    config['openrouter_api_key'] = self.gemini_api_key
                    config['is_openrouter'] = True
                config['gemini_api_key'] = self.gemini_api_key
                save_config(config)
                print(f"[JARVIS Brain] API key loaded ({self.gemini_api_key[:10]}... Provider: {'OpenRouter' if self.is_openrouter else 'Google Direct'})")
            else:
                print("[JARVIS Brain] API key too short, ignoring.")

        mode = f"Google Gemini ({self.model_name})" if self.using_gemini else "Local Intelligence"
        print(f"[JARVIS Brain] AI Mode: {mode}")

    def process(self, user_input):
        """Main entry: process user input, return response string."""
        if not user_input or not user_input.strip():
            return "I didn't catch that, Sir. Could you repeat?"

        text = user_input.strip()
        lower = text.lower()

        # 1. Check built-in commands (always local, fast)
        local = self._handle_local(text, lower)
        if local is not None:
            return local

        # 2. Use Gemini if available
        if self.using_gemini:
            result = self._call_gemini(text)
            if result:
                return result
            # If Gemini fails, fall through to local

        # 3. Local fallback
        return self._local_fallback(text, lower)

    # ======================================================
    # Built-in commands (always handled locally for speed)
    # ======================================================
    def _handle_local(self, text, lower):

        # Direct name address (e.g. "JARVIS", "hey jarvis")
        if re.search(r'^(?:hey|hi|hello|ok|okay)?\s*jarvis[\s?!.,]*$', lower):
            return random.choice([
                "At your service, Sir. All systems are online and awaiting your command.",
                "Yes, Sir? Standing by and ready for your instructions.",
                "Online and listening, Sir. How may I assist you today?",
            ])

        # Time
        if re.search(r'\b(what\s*(?:is\s*)?(?:the\s*)?time|current\s*time|tell\s*(?:me\s*)?(?:the\s*)?time)\b', lower):
            now = datetime.datetime.now()
            return f"The current time is {now.strftime('%I:%M %p')}, Sir."

        # Date
        if re.search(r'\b(what\s*(?:is\s*)?(?:the\s*)?date|today|what\s*day)\b', lower):
            now = datetime.datetime.now()
            return f"Today is {now.strftime('%A, %B %d, %Y')}, Sir."

        # Capabilities / What can you open / Commands
        if re.search(r'\b(what\s*(?:can|do)\s*you\s*(?:open|do|run|launch)|what\s*apps|what\s*you\s*can\s*open|capabilities|help\s*me|list\s*commands|how\s*(?:do\s*you|to)\s*work)\b', lower):
            return (
                "I can launch applications including WhatsApp, Google Chrome, VS Code, Notepad, Spotify, "
                "Calculator, Command Prompt, and Settings, Sir. I can also control system volume, check the time and date, "
                "search Wikipedia, browse YouTube, perform calculations, store information in your memory bank, "
                "and answer questions using Google Gemini intelligence."
            )

        # Mode
        if re.search(r'\b(switch|change|set)\s*(?:to\s*)?(?:the\s*)?(?:voice\s*)?(mode|engine)\b', lower):
            return "Voice mode can be switched between Python Engine, Browser Web Speech, or Text using the mode pills in the sidebar, Sir."

        # Remember
        if re.match(r'remember\s+(this|that)', lower):
            info = re.sub(r'^remember\s+(this|that)[:\s]*', '', text, flags=re.IGNORECASE).strip()
            if info:
                self.memory_id_counter += 1
                self.memories.append({
                    'id': self.memory_id_counter,
                    'content': info,
                    'time': datetime.datetime.now().strftime('%I:%M %p')
                })
                return f"Noted, Sir. I've stored that in memory. You now have {len(self.memories)} item{'s' if len(self.memories) != 1 else ''} saved."
            return "What would you like me to remember, Sir?"

        # Recall
        if re.search(r'\b(recall|list)\s*(memories|memory)\b', lower) or lower.strip() in ('recall memories', 'recall', 'memories'):
            if not self.memories:
                return "No memories stored in this session, Sir."
            items = ". ".join([f"{i+1}: {m['content']}" for i, m in enumerate(self.memories)])
            return f"You have {len(self.memories)} stored memories, Sir. {items}."

        # Open Earth / Planetary Deck
        if re.search(r'\b(open\s+earth|show\s+earth|earth\s+globe|planetary\s+deck|orbital\s+deck|3d\s+earth|terraprime)\b', lower):
            try:
                import webbrowser
                config = load_config()
                port = config.get('server_port', 8742)
                webbrowser.open(f"http://127.0.0.1:{port}/earth_landing_page.html")
            except Exception:
                pass
            return "Deploying TerraPrime Planetary Observation Deck and 3D Earth telemetry now, Sir."

        # Open application
        match = re.match(r'(open|launch|start|run)\s+(.+)', lower)
        if match:
            return self._open_app(match.group(2).strip())

        # System status
        if lower in ('system status', 'status', 'diagnostics'):
            info = platform.uname()
            return (f"System diagnostics, Sir. Running {info.system} {info.release} "
                    f"on {info.machine}. Machine name: {info.node}. "
                    f"Gemini AI is {'connected' if self.using_gemini else 'not connected'}. "
                    f"All systems nominal.")

        # Stop/goodbye
        if re.search(r'\b(goodbye|bye|stop\s*listening|go\s*to\s*sleep|shut\s*down)\b', lower):
            return "Understood, Sir. I'll be here whenever you need me. Goodbye."

        # Clear chat (handled in JS, but acknowledge here too)
        if lower in ('clear chat', 'clear'):
            return "__CLEAR__"

        return None  # Not a built-in command

    def _open_app(self, name):
        """Open a Windows application using multiple strategies."""
        name_lower = name.lower().strip()

        # Check if requesting Earth / Planetary Deck
        if name_lower in ('earth', 'globe', 'earth globe', 'planetary deck', 'orbital deck', 'terraprime', 'anti gravity', 'anti-gravity'):
            try:
                import webbrowser
                config = load_config()
                port = config.get('server_port', 8742)
                webbrowser.open(f"http://127.0.0.1:{port}/earth_landing_page.html")
            except Exception:
                pass
            return "Deploying TerraPrime Planetary Observation Deck and 3D Earth telemetry now, Sir."

        # === Strategy 1: Exact known app mappings ===
        KNOWN_APPS = {
            # System apps
            'notepad': 'notepad.exe',
            'calculator': 'calc.exe',
            'calc': 'calc.exe',
            'paint': 'mspaint.exe',
            'file explorer': 'explorer.exe',
            'explorer': 'explorer.exe',
            'files': 'explorer.exe',
            'task manager': 'taskmgr.exe',
            'taskmgr': 'taskmgr.exe',
            'command prompt': 'cmd.exe',
            'cmd': 'cmd.exe',
            'terminal': 'wt.exe',
            'windows terminal': 'wt.exe',
            'powershell': 'powershell.exe',
            'settings': 'ms-settings:',
            'control panel': 'control.exe',
            'device manager': 'devmgmt.msc',
            'disk cleanup': 'cleanmgr.exe',
            'registry editor': 'regedit.exe',
            'snipping tool': 'snippingtool.exe',
            'snip': 'snippingtool.exe',
            'screen capture': 'snippingtool.exe',
            'sticky notes': 'stikynot.exe',
            'wordpad': 'wordpad.exe',
            'character map': 'charmap.exe',
            'magnifier': 'magnify.exe',
            'narrator': 'narrator.exe',
            'on screen keyboard': 'osk.exe',
            'system information': 'msinfo32.exe',
            'resource monitor': 'resmon.exe',
            'performance monitor': 'perfmon.exe',
            'event viewer': 'eventvwr.exe',
            'services': 'services.msc',
            'disk management': 'diskmgmt.msc',
            'defrag': 'dfrgui.exe',
            'clock': 'ms-clock:',
            'camera': 'microsoft.windows.camera:',
            # Browsers
            'edge': 'msedge',
            'microsoft edge': 'msedge',
            'chrome': 'chrome',
            'google chrome': 'chrome',
            'firefox': 'firefox',
            'browser': 'msedge',
            'opera': 'opera',
            'brave': 'brave',
            # Office
            'word': 'winword',
            'microsoft word': 'winword',
            'excel': 'excel',
            'microsoft excel': 'excel',
            'powerpoint': 'powerpnt',
            'microsoft powerpoint': 'powerpnt',
            'outlook': 'outlook',
            'microsoft outlook': 'outlook',
            'onenote': 'onenote',
            'teams': 'ms-teams:',
            'microsoft teams': 'ms-teams:',
            'access': 'msaccess',
            # Media & Entertainment
            'spotify': 'spotify',
            'vlc': 'vlc',
            'media player': 'wmplayer.exe',
            'windows media player': 'wmplayer.exe',
            'groove music': 'ms-msix://Microsoft.ZuneMusic/',
            'photos': 'ms-photos:',
            'movies': 'mswindowsvideo:',
            'netflix': 'nflx:',
            # Dev tools
            'vs code': 'code',
            'vscode': 'code',
            'visual studio code': 'code',
            'visual studio': 'devenv',
            'android studio': 'studio64',
            'notepad++': 'notepad++',
            'git bash': 'git-bash',
            'cursor': 'cursor',
            # Communication & Social
            'discord': 'discord',
            'whatsapp': None,  # handled via start menu AppID
            'telegram': 'telegram',
            'zoom': 'zoom',
            'skype': 'skype',
            'signal': 'signal',
            'slack': 'slack',
            # Websites (fallback to browser)
            'youtube': 'https://youtube.com',
            'google': 'https://google.com',
            'github': 'https://github.com',
            'gmail': 'https://mail.google.com',
            'google maps': 'https://maps.google.com',
            'maps': 'https://maps.google.com',
            'drive': 'https://drive.google.com',
            'google drive': 'https://drive.google.com',
            'twitter': 'https://twitter.com',
            'instagram': 'https://instagram.com',
            'facebook': 'https://facebook.com',
            'linkedin': 'https://linkedin.com',
            'reddit': 'https://reddit.com',
            'amazon': 'https://amazon.in',
            'flipkart': 'https://flipkart.com',
            # Games & stores
            'steam': 'steam://',
            'xbox': 'xbox:',
            'store': 'ms-windows-store:',
            'windows store': 'ms-windows-store:',
        }

        # === Strategy 2: Try known mappings first ===
        exe = KNOWN_APPS.get(name_lower)
        if exe is not None:
            try:
                if exe.startswith('https://') or exe.startswith('http://'):
                    os.system(f'start "" "{exe}"')
                elif exe.endswith(':') or exe.startswith('ms-') or exe.startswith('xbox') or exe.startswith('steam'):
                    subprocess.Popen(f'start "" "{exe}"', shell=True)
                else:
                    subprocess.Popen(exe, shell=True)
                return f"Opening {name.title()} for you, Sir."
            except Exception as e:
                print(f"[JARVIS Brain] Strategy 1 failed for {name}: {e}")

        # === Strategy 3: Try Windows Start Menu app discovery ===
        try:
            ps_cmd = 'powershell -NoProfile -Command "Get-StartApps | ConvertTo-Json -Compress"'
            result = subprocess.check_output(ps_cmd, shell=True, timeout=5, text=True, stderr=subprocess.DEVNULL)
            apps = json.loads(result)
            if isinstance(apps, dict):
                apps = [apps]

            # Find best match by app name
            name_words = set(name_lower.split())
            best_match = None
            best_score = 0

            for app in apps:
                app_name = app.get('Name', '').lower()
                app_id = app.get('AppID', '')
                # Score match quality
                if name_lower == app_name:
                    best_match = app
                    best_score = 100
                    break
                elif name_lower in app_name or app_name in name_lower:
                    score = len(name_lower) / max(len(app_name), 1) * 80
                    if score > best_score:
                        best_score = score
                        best_match = app
                else:
                    # Word overlap scoring
                    app_words = set(app_name.split())
                    overlap = len(name_words & app_words) / max(len(name_words), 1)
                    if overlap > 0.5 and overlap > best_score / 100:
                        best_score = overlap * 70
                        best_match = app

            if best_match and best_score > 30:
                app_id = best_match.get('AppID', '')
                display_name = best_match.get('Name', name.title())
                if '://' in app_id or app_id.startswith('http'):
                    os.system(f'start "" "{app_id}"')
                elif '.' in app_id and '\\' not in app_id and not app_id.endswith('.exe'):
                    # UWP app
                    subprocess.Popen(f'explorer.exe shell:appsFolder\\{app_id}', shell=True)
                else:
                    subprocess.Popen(app_id, shell=True)
                return f"Opening {display_name} for you, Sir."
        except Exception as e:
            print(f"[JARVIS Brain] Strategy 2 (Start Menu) failed: {e}")

        # === Strategy 4: Try direct name via start command ===
        try:
            os.system(f'start "" "{name}"')
            return f"Attempting to launch {name.title()}, Sir. Searching your system for it now."
        except Exception as e:
            return f"I was unable to find or open {name.title()}, Sir. Please ensure it is installed on your system."

    # ======================================================
    # Gemini REST API (server-side, no CORS issues)
    # ======================================================
    def _call_openrouter(self, user_text, save_to_history=True):
        """Call OpenRouter API with reasoning support and preserve reasoning_details across conversation turns."""
        models_to_try = [self.model_name]
        fallback_models = ["google/gemini-3.8-flash", "google/gemini-2.5-flash", "google/gemini-2.0-flash-001", "meta-llama/llama-3.3-70b-instruct"]
        for fm in fallback_models:
            if fm not in models_to_try:
                models_to_try.append(fm)

        # Build message history safely without pre-mutating state
        messages = [{"role": "system", "content": JARVIS_SYSTEM_PROMPT}]
        if save_to_history:
            recent_history = self.gemini_history[-20:]
            for msg in recent_history:
                formatted_msg = {"role": msg["role"], "content": msg["content"]}
                if "reasoning_details" in msg and msg["reasoning_details"]:
                    formatted_msg["reasoning_details"] = msg["reasoning_details"]
                messages.append(formatted_msg)
        messages.append({"role": "user", "content": user_text})

        for model in models_to_try:
            for attempt in range(2):
                try:
                    url = "https://openrouter.ai/api/v1/chat/completions"
                    headers = {
                        "Authorization": f"Bearer {self.gemini_api_key}",
                        "Content-Type": "application/json",
                        "Connection": "close",
                        "User-Agent": "JARVIS-Core/2.0",
                        "HTTP-Referer": "http://127.0.0.1:8742",
                        "X-Title": "JARVIS Cyber-Ops Assistant"
                    }
                    payload = {
                        "model": model,
                        "messages": messages,
                        "reasoning": {"enabled": True}
                    }
                    data = json.dumps(payload).encode('utf-8')
                    req = urllib.request.Request(url, data=data, headers=headers, method='POST')

                    with urllib.request.urlopen(req, timeout=35) as resp:
                        result = json.loads(resp.read().decode('utf-8'))

                    choices = result.get('choices', [])
                    if not choices:
                        self.last_error = "No choices in OpenRouter response"
                        break

                    msg_obj = choices[0].get('message', {})
                    response_text = msg_obj.get('content', '').strip()
                    reasoning_details = msg_obj.get('reasoning_details')

                    if not response_text:
                        self.last_error = "Empty text in OpenRouter response"
                        break

                    if save_to_history:
                        self.gemini_history.append({"role": "user", "content": user_text})
                        history_entry = {"role": "assistant", "content": response_text}
                        if reasoning_details:
                            history_entry["reasoning_details"] = reasoning_details
                        self.gemini_history.append(history_entry)
                        self.gemini_history = self.gemini_history[-40:]

                    response_text = self._clean_for_speech(response_text)

                    if model != self.model_name:
                        print(f"[JARVIS Brain] OpenRouter connected via {model} (switched from {self.model_name})")
                        self.model_name = model
                        config = load_config()
                        config['model_name'] = model
                        save_config(config)

                    self.last_error = None
                    return response_text

                except urllib.error.HTTPError as e:
                    body = ""
                    try:
                        body = e.read().decode('utf-8')
                    except Exception:
                        pass
                    print(f"[JARVIS Brain] OpenRouter HTTP Error {e.code}: {body[:250]}")
                    self.last_error = f"OpenRouter HTTP {e.code}: {body[:150]}"
                    if e.code in (429, 503) and attempt == 0:
                        time.sleep(1.0)
                        continue
                    break

                except Exception as e:
                    print(f"[JARVIS Brain] OpenRouter error with {model} (attempt {attempt+1}): {e}")
                    self.last_error = str(e)
                    if attempt == 0:
                        time.sleep(1.0)
                        continue
                    break

        return None

    def _call_gemini(self, user_text, save_to_history=True):
        """Call AI API (routes to OpenRouter if openrouter key/model is configured, else Google Gemini REST)."""
        if self.is_openrouter or (self.gemini_api_key and self.gemini_api_key.startswith('sk-or-v1-')) or '/' in self.model_name:
            res = self._call_openrouter(user_text, save_to_history=save_to_history)
            if res:
                return res
            # Fall through if OpenRouter fails and a direct key is present

        # List of models to try. We start with configured model, then try robust fallbacks
        models_to_try = [self.model_name if '/' not in self.model_name else 'gemini-3.8-flash']
        default_fallbacks = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-2.5-flash", "gemini-2.0-flash"]
        for m in default_fallbacks:
            if m not in models_to_try:
                models_to_try.append(m)

        # Prepare history safely without mutating state before request completes
        if save_to_history:
            history = [m for m in self.gemini_history[-20:]]
            history.append({"role": "user", "parts": [{"text": user_text}]})
        else:
            history = [{"role": "user", "parts": [{"text": user_text}]}]

        for model in models_to_try:
            for attempt in range(2):
                try:
                    url = (
                        "https://generativelanguage.googleapis.com/v1beta/models/"
                        f"{model}:generateContent?key={self.gemini_api_key}"
                    )

                    payload = {
                        "system_instruction": {"parts": [{"text": JARVIS_SYSTEM_PROMPT}]},
                        "contents": history,
                        "generationConfig": {
                            "temperature": 0.75,
                            "maxOutputTokens": 400,
                            "topP": 0.95,
                            "topK": 40,
                        }
                    }

                    data = json.dumps(payload).encode('utf-8')
                    req = urllib.request.Request(
                        url,
                        data=data,
                        headers={
                            'Content-Type': 'application/json',
                            'Connection': 'close',
                            'User-Agent': 'JARVIS-Core/2.0'
                        },
                        method='POST'
                    )

                    with urllib.request.urlopen(req, timeout=25) as resp:
                        result = json.loads(resp.read().decode('utf-8'))

                    # Extract response text
                    candidates = result.get('candidates', [])
                    if not candidates:
                        self.last_error = "No candidates in Gemini response"
                        print(f"[JARVIS Brain] Gemini: no candidates on {model}. Response: {json.dumps(result)[:200]}")
                        break

                    parts = candidates[0].get('content', {}).get('parts', [])
                    if not parts:
                        self.last_error = "No parts in Gemini response"
                        break

                    response_text = parts[0].get('text', '').strip()
                    if not response_text:
                        self.last_error = "Empty text in Gemini response"
                        break

                    # Commit to history once verified
                    if save_to_history:
                        self.gemini_history.append({"role": "user", "parts": [{"text": user_text}]})
                        self.gemini_history.append({"role": "model", "parts": [{"text": response_text}]})
                        self.gemini_history = self.gemini_history[-40:]

                    # Clean up any markdown that slipped through
                    response_text = self._clean_for_speech(response_text)

                    # Save successful model to config if it was a fallback
                    if model != self.model_name:
                        print(f"[JARVIS Brain] Successfully connected using {model} (switched from {self.model_name})")
                        self.model_name = model
                        config = load_config()
                        config['model_name'] = model
                        save_config(config)

                    self.last_error = None
                    return response_text

                except urllib.error.HTTPError as e:
                    body = ""
                    try:
                        body = e.read().decode('utf-8')
                    except Exception:
                        pass

                    # If 404 Model Not Found, switch to next model immediately
                    if e.code == 404:
                        print(f"[JARVIS Brain] Model {model} returned 404 (Not Found). Trying fallback...")
                        self.last_error = f"Model {model} not found."
                        break

                    # If high demand spike (503/429), retry once after a pause
                    if (e.code in (429, 503) or 'high demand' in body.lower()) and attempt == 0:
                        print(f"[JARVIS Brain] Model {model} traffic spike ({e.code}). Retrying in 1.2s...")
                        time.sleep(1.2)
                        continue

                    # Parse detailed error from response body
                    try:
                        err_data = json.loads(body)
                        error_msg = err_data.get('error', {}).get('message', '')
                        self.last_error = f"API Error: {error_msg}" if error_msg else f"HTTP Error {e.code}"
                    except Exception:
                        self.last_error = f"HTTP Error {e.code}: {body[:150]}"

                    print(f"[JARVIS Brain] Gemini HTTP error ({model}): {self.last_error}")
                    break

                except (urllib.error.URLError, TimeoutError, ConnectionResetError, Exception) as e:
                    err_str = str(getattr(e, 'reason', e))
                    print(f"[JARVIS Brain] Gemini network issue with {model} (attempt {attempt+1}): {err_str}")
                    self.last_error = err_str

                    # Retry transient socket disconnect or timeout once
                    if attempt == 0 and any(term in err_str.lower() for term in ['closed connection', 'timed out', 'reset', 'refused', 'eof', 'handshake', 'remotedisconnected']):
                        time.sleep(0.8)
                        continue

                    # If attempt failed, continue to next fallback model in loop
                    break

        return None

    def _clean_for_speech(self, text):
        """Remove any residual markdown/formatting from Gemini output."""
        text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)    # **bold**
        text = re.sub(r'\*(.+?)\*', r'\1', text)         # *italic*
        text = re.sub(r'`(.+?)`', r'\1', text)           # `code`
        text = re.sub(r'```[\s\S]*?```', '', text)       # code blocks
        text = re.sub(r'^#{1,6}\s*', '', text, flags=re.MULTILINE)  # headings
        text = re.sub(r'^\s*[-*]\s+', '', text, flags=re.MULTILINE) # bullet points
        text = re.sub(r'^\s*\d+\.\s+', '', text, flags=re.MULTILINE) # numbered lists
        text = re.sub(r'\n{2,}', '. ', text)             # multiple newlines
        text = re.sub(r'\n', ' ', text)                   # single newlines
        text = re.sub(r'\s{2,}', ' ', text)               # extra spaces
        return text.strip()

    # ======================================================
    # Local Fallback (when Gemini is unavailable)
    # ======================================================
    def _local_fallback(self, text, lower):

        # Greetings
        if re.match(r'(hi|hello|hey|good\s*(morning|afternoon|evening|day)|greetings)', lower):
            h = datetime.datetime.now().hour
            g = "Good morning" if h < 12 else ("Good afternoon" if h < 17 else "Good evening")
            return random.choice([
                f"{g}, Sir. How may I assist you?",
                f"{g}, Sir. All systems at your disposal.",
                f"{g}, Sir. Ready and awaiting your instructions.",
            ])

        # Identity
        if re.search(r'who\s*are\s*you|what\s*are\s*you|your\s*name|introduce', lower):
            return ("I am JARVIS, Just A Rather Very Intelligent System. "
                    "An advanced AI voice assistant at your service, Sir.")

        # How are you
        if re.search(r'how\s*are\s*you|how.*doing', lower):
            return "All systems nominal, Sir. Thank you for asking. How may I help?"

        # Thanks
        if re.search(r'thank\s*(you|u)|thanks', lower):
            return random.choice([
                "You're most welcome, Sir.",
                "My pleasure, Sir. Always happy to assist.",
                "At your service, Sir.",
            ])

        # Jokes
        if re.search(r'joke|funny|humor|make\s*me\s*laugh', lower):
            return random.choice([
                "Why do programmers prefer dark mode? Because light attracts bugs, Sir.",
                "A SQL query walks into a bar, sees two tables, and asks, can I join you?",
                "Why was the JavaScript developer sad? He didn't Node how to Express himself.",
                "There are only ten types of people. Those who understand binary and those who don't.",
                "I'd tell you a UDP joke, but you might not get it, Sir.",
                "Why do Java developers wear glasses? Because they can't C sharp.",
            ])

        # Math
        match = re.search(r'(?:calculate|compute|what\s*is|how\s*much\s*is)\s*([\d\+\-\*\/\(\)\.\s]+)', lower)
        if match:
            try:
                result = eval(match.group(1).strip(), {"__builtins__": {}}, {})
                return f"The answer is {result}, Sir."
            except:
                pass

        # Gemini status / fallback message
        if self.using_gemini and self.last_error:
            if "high demand" in self.last_error.lower() or "503" in self.last_error or "429" in self.last_error:
                return "The neural language model is currently experiencing temporary high traffic, Sir, but all core functions and local commands remain online. How may I assist you?"
            return f"I'm experiencing a temporary network issue with cloud intelligence, Sir ({self.last_error}). How can I assist you with local protocols?"

        return ("At your service, Sir. I am online and ready to assist you. "
                "You can ask me questions, execute system commands, or manage memories.")

    # ======================================================
    # API Key management
    # ======================================================
    def set_api_key(self, key):
        """Set a new Gemini API key and test it."""
        if not key or not key.strip():
            return {"success": False, "error": "Empty API key"}

        old_key = self.gemini_api_key
        old_using = self.using_gemini
        old_is_or = self.is_openrouter
        old_model = self.model_name
        
        self.gemini_api_key = key.strip()
        self.using_gemini = True
        if self.gemini_api_key.startswith('sk-or-v1-') or 'openrouter' in self.model_name.lower():
            self.is_openrouter = True
            if '/' not in self.model_name:
                self.model_name = 'google/gemini-3.8-flash'
        
        # Test with a quick call (without saving to history)
        test_result = self._call_gemini("Reply with exactly: Connection established, Sir.", save_to_history=False)
        if test_result:
            # Persist key to config
            config = load_config()
            config['gemini_api_key'] = self.gemini_api_key
            config['model_name'] = self.model_name # Persist the validated/current model name
            config['is_openrouter'] = self.is_openrouter
            if self.is_openrouter:
                config['openrouter_api_key'] = self.gemini_api_key
            save_config(config)
            self.gemini_history = []  # Reset history on successful new key
            return {"success": True, "message": test_result}
        else:
            # Revert if it fails
            self.gemini_api_key = old_key
            self.using_gemini = old_using
            self.is_openrouter = old_is_or
            self.model_name = old_model
            return {"success": False, "error": self.last_error or "Unknown error"}

    def delete_memory(self, mem_id):
        """Delete a memory by its unique ID."""
        try:
            m_id = int(mem_id)
            self.memories = [m for m in self.memories if m.get('id') != m_id]
            return True
        except Exception as e:
            print(f"[JARVIS Brain] Delete memory error: {e}")
            return False

    def get_status(self):
        """Return brain status info."""
        return {
            "using_gemini": self.using_gemini,
            "has_key": bool(self.gemini_api_key),
            "key_preview": (self.gemini_api_key[:8] + "...") if self.gemini_api_key else "",
            "model_name": self.model_name,
            "last_error": self.last_error,
            "memories": self.memories,
        }
