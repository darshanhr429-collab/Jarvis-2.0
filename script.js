/* ============================================
   J.A.R.V.I.S. — AI Voice Assistant Core
   Web Speech API + pywebview Python bridge
   ============================================ */

(function () {
    'use strict';

    // ========================================
    // State
    // ========================================
    const STATE = {
        memories: [],
        conversationHistory: [],
        bootComplete: false,
        uptimeStart: Date.now(),
        isProcessing: false,
        voiceEnabled: false,
        voiceState: 'idle', // idle | listening | wake | processing | speaking
        activeVoiceMode: 'python', // python | browser | text
        recognition: null,
        synthesis: window.speechSynthesis,
        selectedVoice: null,
        continuousListening: true,
        hasPyBridge: false,
        hasHttpApi: false,
    };

    // ========================================
    // DOM Elements
    // ========================================
    const DOM = {
        chatMessages: document.getElementById('chat-messages'),
        userInput: document.getElementById('user-input'),
        sendBtn: document.getElementById('send-btn'),
        systemClock: document.getElementById('system-clock'),
        bootOverlay: document.getElementById('boot-overlay'),
        bootText: document.getElementById('boot-text'),
        bootProgressFill: document.getElementById('boot-progress-fill'),
        particlesContainer: document.getElementById('particles'),
        memoryList: document.getElementById('memory-list'),
        uptimeVal: document.getElementById('uptime-val'),
        cpuBar: document.getElementById('cpu-bar'),
        memBar: document.getElementById('mem-bar'),
        netBar: document.getElementById('net-bar'),
        cpuVal: document.getElementById('cpu-val'),
        memVal: document.getElementById('mem-val'),
        netVal: document.getElementById('net-val'),
        voiceStatus: document.getElementById('voice-status'),
        voiceLabel: document.getElementById('voice-label'),
        voiceOrb: document.getElementById('voice-orb'),
        vizBars: document.getElementById('viz-bars'),
        vizLabel: document.getElementById('viz-label'),
        btnToggleVoice: document.getElementById('btn-toggle-voice'),
        micBtnLabel: document.getElementById('mic-btn-label'),
        btnStopSpeak: document.getElementById('btn-stop-speak'),
        geminiKeyInput: document.getElementById('gemini-key-input'),
        btnSetGemini: document.getElementById('btn-set-gemini'),
        geminiStatus: document.getElementById('gemini-status'),
        voiceModeVal: document.getElementById('voice-mode-val'),
        pillModePython: document.getElementById('pill-mode-python'),
        pillModeBrowser: document.getElementById('pill-mode-browser'),
        pillModeText: document.getElementById('pill-mode-text'),
        hModePython: document.getElementById('h-mode-python'),
        hModeBrowser: document.getElementById('h-mode-browser'),
        hModeText: document.getElementById('h-mode-text'),
        vizMicBtn: document.getElementById('viz-mic-btn'),
        vizMicLabel: document.getElementById('viz-mic-label'),
        inputMicBtn: document.getElementById('input-mic-btn'),
        statusText: document.getElementById('status-text'),
        statVoiceMode: document.getElementById('stat-voice-mode'),
        hModeEarth: document.getElementById('h-mode-earth'),
        planetaryOverlay: document.getElementById('planetary-overlay'),
        planetaryFrame: document.getElementById('planetary-frame'),
        planetaryClose: document.getElementById('planetary-close'),
        planetaryPopout: document.getElementById('planetary-popout'),
    };

    // ========================================
    // Planetary Deck (TerraPrime 3D Earth)
    // ========================================
    function openPlanetaryDeck() {
        if (!DOM.planetaryOverlay) return;
        if (!DOM.planetaryFrame.src || !DOM.planetaryFrame.src.includes('earth_landing_page.html')) {
            DOM.planetaryFrame.src = 'earth_landing_page.html';
        }
        DOM.planetaryOverlay.style.display = 'flex';
        playTone(880, 0.1, 0.05);
    }

    function closePlanetaryDeck() {
        if (!DOM.planetaryOverlay) return;
        DOM.planetaryOverlay.style.display = 'none';
    }

    // ========================================
    // Boot Sequence
    // ========================================
    const BOOT_LINES = [
        'BOOTING JARVIS KALI-OPS TERMINAL v5.0...',
        'INITIALIZING KALI LINUX KERNEL 6.8.0-kali3 .......... [OK]',
        'LOADING OFFENSIVE SECURITY MODULES (METASPLOIT)....... [OK]',
        'CALIBRATING MICROPHONE & AUDIO DSP PIPELINE .......... [OK]',
        'CONNECTING NEURAL ENGINE (GEMINI 1.5-FLASH) .......... [OK]',
        'MOUNTING AES-256 ENCRYPTED VAULT ..................... [OK]',
        'ROOT ACCESS GRANTED — KALI JARVIS TERMINAL READY.'
    ];

    async function runBootSequence() {
        if (!DOM.bootOverlay) {
            STATE.bootComplete = true;
            initVoice();
            return;
        }

        let dismissed = false;
        const dismissBoot = () => {
            if (dismissed) return;
            dismissed = true;
            DOM.bootOverlay.classList.add('hidden');
            STATE.bootComplete = true;
        };

        DOM.bootOverlay.addEventListener('click', dismissBoot);

        try {
            for (let i = 0; i < BOOT_LINES.length; i++) {
                if (dismissed) break;
                const line = document.createElement('div');
                line.classList.add('boot-line');
                line.textContent = `> ${BOOT_LINES[i]}`;
                if (DOM.bootText) DOM.bootText.appendChild(line);
                if (DOM.bootProgressFill) DOM.bootProgressFill.style.width = `${((i + 1) / BOOT_LINES.length) * 100}%`;
                await sleep(180 + Math.random() * 100);
            }
        } catch (e) {
            console.warn('[JARVIS] Boot sequence error:', e);
        } finally {
            await sleep(200);
            dismissBoot();
        }

        // Welcome message
        addJarvisMessage(
            `<strong>[ KALI JARVIS OPS TERMINAL v5.0 — ROOT ACCESS GRANTED ]</strong>\n\n` +
            `Good day, Sir. <strong>J.A.R.V.I.S.</strong> Kali Linux Ops Terminal is fully armed.\n\n` +
            `🔍 <strong>Search Engine:</strong> Use the OSINT bar above to search Google, DuckDuckGo, GitHub, YouTube & more.\n\n` +
            `🎙️ <strong>Voice Control:</strong> Say <strong>"JARVIS"</strong> followed by your command, or click <strong>[ CLICK TO SPEAK ]</strong>.\n\n` +
            `⌨️ <strong>Terminal:</strong> Type any command (e.g. <em>"open chrome"</em>, <em>"open whatsapp"</em>, <em>"what time is it"</em>).\n\n` +
            `🐉 <strong>Modes:</strong> Switch between 🎙️ Python, 🌐 Browser, ⌨️ Text using the MODE buttons in the header.`
        );

        // Initialize voice after boot
        await sleep(300);
        initVoice();
    }

    // ========================================
    // Web Speech API — Voice Recognition
    // ========================================
    // ========================================
    // Voice Engine & Mode Management
    // ========================================
    let lastVoiceEventId = 0;
    let voiceFeedInterval = null;

    function startVoiceFeedPolling() {
        if (voiceFeedInterval) return;
        voiceFeedInterval = setInterval(async () => {
            try {
                const res = await fetch(`/api/voice_feed?since=${lastVoiceEventId}`);
                if (!res.ok) {
                    if (DOM.statusText) DOM.statusText.textContent = 'CONNECTING...';
                    return;
                }
                if (DOM.statusText && DOM.statusText.textContent !== 'ONLINE') {
                    DOM.statusText.textContent = 'ONLINE';
                }
                const data = await res.json();
                if (data.events && data.events.length > 0) {
                    for (const ev of data.events) {
                        lastVoiceEventId = Math.max(lastVoiceEventId, ev.id);
                        handleBackendVoiceEvent(ev);
                    }
                }
            } catch (err) {
                if (DOM.statusText) DOM.statusText.textContent = 'CONNECTING...';
            }
        }, 350);
    }

    function handleBackendVoiceEvent(ev) {
        switch (ev.type) {
            case 'wake':
                setVoiceState('wake');
                DOM.vizLabel.textContent = 'Wake word detected! Listening for command...';
                playTone(880, 0.1, 0.08);
                break;
            case 'listening':
                setVoiceState('listening');
                DOM.vizLabel.textContent = 'Listening to Realtek mic... Speak your command!';
                animateVizBars(true);
                break;
            case 'command':
                setVoiceState('processing');
                DOM.vizLabel.textContent = `Processing: "${ev.data.command}"`;
                addUserMessage(ev.data.command, 'voice');
                showTypingIndicator();
                break;
            case 'response':
                removeTypingIndicator();
                addJarvisMessage(ev.data.response);
                syncStatusWithPython();
                break;
            case 'speaking':
                setVoiceState('speaking');
                DOM.vizLabel.textContent = 'Speaking...';
                animateVizBars(true);
                break;
            case 'idle':
                setVoiceState('idle');
                DOM.vizLabel.textContent = '🎙️ Realtek Microphone Active — Say "JARVIS" or click to speak';
                animateVizBars(false);
                break;
            case 'error':
                DOM.vizLabel.textContent = `Notice: ${ev.data.error}`;
                break;
            case 'mode_change':
                if (ev.data && ev.data.mode && ev.data.mode !== STATE.activeVoiceMode) {
                    setVoiceMode(ev.data.mode, false);
                }
                break;
        }
    }

    function setVoiceMode(mode, notifyBackend = true) {
        STATE.activeVoiceMode = mode;

        const sidebarPills = [DOM.pillModePython, DOM.pillModeBrowser, DOM.pillModeText];
        sidebarPills.forEach(p => { if (p) p.classList.remove('active'); });

        const headerBtns = [DOM.hModePython, DOM.hModeBrowser, DOM.hModeText];
        headerBtns.forEach(b => { if (b) b.classList.remove('active'); });

        if (mode === 'python') {
            if (DOM.pillModePython) DOM.pillModePython.classList.add('active');
            if (DOM.hModePython) DOM.hModePython.classList.add('active');
            if (DOM.voiceModeVal) DOM.voiceModeVal.textContent = 'PYTHON';
            if (DOM.micBtnLabel) DOM.micBtnLabel.textContent = 'Voice: Python Active';
            if (DOM.vizMicLabel) DOM.vizMicLabel.textContent = 'Click to Speak';
            DOM.btnToggleVoice.classList.add('active');
            DOM.vizLabel.textContent = '🎙️ Realtek Microphone Active — Say "JARVIS" or click to speak';
            STATE.voiceEnabled = true;
            startVoiceFeedPolling();
            if (STATE.recognition) {
                try { STATE.recognition.stop(); } catch(e) {}
            }
        } else if (mode === 'browser') {
            if (DOM.pillModeBrowser) DOM.pillModeBrowser.classList.add('active');
            if (DOM.hModeBrowser) DOM.hModeBrowser.classList.add('active');
            if (DOM.voiceModeVal) DOM.voiceModeVal.textContent = 'BROWSER';
            if (DOM.micBtnLabel) DOM.micBtnLabel.textContent = 'Voice: Browser Active';
            if (DOM.vizMicLabel) DOM.vizMicLabel.textContent = 'Click to Speak';
            DOM.btnToggleVoice.classList.add('active');
            DOM.vizLabel.textContent = '🌐 Browser Speech Active — Say "JARVIS" or click to speak';
            STATE.voiceEnabled = true;
            startVoiceFeedPolling();
            initBrowserRecognition();
            if (STATE.recognition) {
                try { STATE.recognition.start(); } catch(e) {}
            }
        } else if (mode === 'text') {
            if (DOM.pillModeText) DOM.pillModeText.classList.add('active');
            if (DOM.hModeText) DOM.hModeText.classList.add('active');
            if (DOM.voiceModeVal) DOM.voiceModeVal.textContent = 'TEXT';
            if (DOM.micBtnLabel) DOM.micBtnLabel.textContent = 'Voice: Paused';
            if (DOM.vizMicLabel) DOM.vizMicLabel.textContent = 'Enable Voice';
            DOM.btnToggleVoice.classList.remove('active');
            DOM.vizLabel.textContent = '⌨️ Text Command Mode Active — Type command below';
            STATE.voiceEnabled = false;
            if (STATE.recognition) {
                try { STATE.recognition.stop(); } catch(e) {}
            }
        }

        if (notifyBackend) {
            fetch(`/api/voice_mode?mode=${mode}`).catch(() => {});
        }
    }

    async function triggerListening() {
        if (STATE.activeVoiceMode === 'text') {
            setVoiceMode('python');
        }

        setVoiceState('listening');
        animateVizBars(true);
        playTone(880, 0.1, 0.08);

        if (STATE.activeVoiceMode === 'python') {
            DOM.vizLabel.textContent = 'Listening to Realtek microphone... Speak your command!';
            try {
                await fetch('/api/trigger_listen');
            } catch (e) {
                console.warn('[JARVIS] trigger_listen error:', e);
            }
        } else if (STATE.activeVoiceMode === 'browser') {
            DOM.vizLabel.textContent = 'Browser speech listening... Speak your command!';
            try {
                if (!STATE.recognition) {
                    initBrowserRecognition();
                }
                if (STATE.recognition) {
                    STATE.recognition.start();
                }
            } catch (e) {
                console.warn('[JARVIS] Browser recognition start error:', e);
            }
        }
    }

    function initVoice() {
        startVoiceFeedPolling();
        initTTSVoice();

        // Default to Python Voice Engine which is always listening via Realtek microphone
        setVoiceMode('python');
    }

    function initBrowserRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.log('[JARVIS] Browser SpeechRecognition not supported in this browser. Remaining in Python mode.');
            setVoiceMode('python');
            return;
        }

        if (STATE.recognition) return;

        STATE.recognition = new SpeechRecognition();
        STATE.recognition.continuous = true;
        STATE.recognition.interimResults = true;
        STATE.recognition.lang = 'en-US';
        STATE.recognition.maxAlternatives = 1;

        STATE.recognition.onstart = () => {
            console.log('[JARVIS] Browser voice recognition started.');
            setVoiceState('idle');
            DOM.vizLabel.textContent = 'Say "JARVIS" to activate';
            DOM.btnToggleVoice.classList.add('active');
        };

        STATE.recognition.onend = () => {
            if (STATE.continuousListening && STATE.voiceEnabled && STATE.activeVoiceMode === 'browser') {
                try {
                    setTimeout(() => {
                        if (STATE.voiceEnabled && STATE.activeVoiceMode === 'browser') {
                            STATE.recognition.start();
                        }
                    }, 300);
                } catch (e) {}
            }
        };

        STATE.recognition.onerror = (event) => {
            console.warn('[JARVIS] Browser recognition event:', event.error);
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                console.log('[JARVIS] Browser microphone blocked. Seamlessly using Python Voice Engine.');
                setVoiceMode('python');
            }
        };

        // Accumulate final transcript for wake word detection
        let pendingTranscript = '';
        let wakeDetected = false;
        let silenceTimer = null;

        STATE.recognition.onresult = (event) => {
            if (STATE.activeVoiceMode !== 'browser') return;

            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            animateVizBars(true);
            const currentText = (finalTranscript || interimTranscript).toLowerCase().trim();

            if (currentText) {
                DOM.vizLabel.textContent = `Hearing: "${currentText}"`;
            }

            const wakeVariations = ['jarvis', 'jarves', 'javis', 'harvest', 'charvis', 'service', 'travis'];
            const detectedWake = wakeVariations.find(w => currentText.includes(w));

            if (!wakeDetected && detectedWake) {
                wakeDetected = true;
                setVoiceState('wake');
                DOM.vizLabel.textContent = 'Wake word detected! Listening...';
                playTone(880, 0.1, 0.08);
                setTimeout(() => playTone(1100, 0.1, 0.06), 100);

                const parts = currentText.split(detectedWake);
                const afterWake = parts.slice(1).join(' ').trim().replace(/^[,.\s]+/, '').trim();

                if (afterWake.length > 2 && finalTranscript) {
                    processVoiceCommand(afterWake);
                    wakeDetected = false;
                    return;
                }

                pendingTranscript = afterWake;

                if (silenceTimer) clearTimeout(silenceTimer);
                silenceTimer = setTimeout(() => {
                    if (wakeDetected && pendingTranscript.trim().length > 2) {
                        processVoiceCommand(pendingTranscript.trim());
                    } else if (wakeDetected) {
                        setVoiceState('listening');
                        DOM.vizLabel.textContent = 'Listening for your command...';
                    }
                    wakeDetected = false;
                    pendingTranscript = '';
                }, 3000);

            } else if (wakeDetected) {
                setVoiceState('listening');

                if (finalTranscript) {
                    pendingTranscript += ' ' + finalTranscript;

                    if (silenceTimer) clearTimeout(silenceTimer);
                    silenceTimer = setTimeout(() => {
                        if (pendingTranscript.trim().length > 1) {
                            processVoiceCommand(pendingTranscript.trim());
                        }
                        wakeDetected = false;
                        pendingTranscript = '';
                    }, 2000);
                }
            } else {
                if (!STATE.isProcessing) {
                    setVoiceState('idle');
                }
            }

            if (!interimTranscript && !finalTranscript) {
                animateVizBars(false);
            }
        };
    }

    // ========================================
    // Text-to-Speech
    // ========================================
    function initTTSVoice() {
        function selectVoice() {
            const voices = STATE.synthesis.getVoices();
            if (voices.length === 0) return;

            // Prefer male English voices for JARVIS character
            const preferred = [
                'Microsoft David',
                'Google UK English Male',
                'Microsoft Mark',
                'Microsoft George',
                'Google US English',
                'Daniel',
                'David',
            ];

            for (const pref of preferred) {
                const found = voices.find(v => v.name.includes(pref));
                if (found) {
                    STATE.selectedVoice = found;
                    console.log(`[JARVIS] TTS Voice: ${found.name}`);
                    return;
                }
            }

            // Fallback: any English voice
            const english = voices.find(v => v.lang.startsWith('en'));
            if (english) {
                STATE.selectedVoice = english;
                console.log(`[JARVIS] TTS Voice (fallback): ${english.name}`);
            }
        }

        selectVoice();
        if (STATE.synthesis.onvoiceschanged !== undefined) {
            STATE.synthesis.onvoiceschanged = selectVoice;
        }
    }

    function speak(text) {
        if (!STATE.synthesis) return;

        // Cancel any ongoing speech
        STATE.synthesis.cancel();

        // Clean text for speech (remove HTML tags)
        const cleanText = text.replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, 'and')
            .replace(/&lt;/g, 'less than')
            .replace(/&gt;/g, 'greater than')
            .replace(/\s+/g, ' ')
            .trim();

        if (!cleanText) return;

        const utterance = new SpeechSynthesisUtterance(cleanText);

        if (STATE.selectedVoice) {
            utterance.voice = STATE.selectedVoice;
        }

        utterance.rate = 1.0;
        utterance.pitch = 0.95;
        utterance.volume = 1.0;

        utterance.onstart = () => {
            setVoiceState('speaking');
            DOM.vizLabel.textContent = 'Speaking...';
            animateVizBars(true);
        };

        utterance.onend = () => {
            setVoiceState('idle');
            DOM.vizLabel.textContent = 'Say "JARVIS" to activate';
            animateVizBars(false);
        };

        utterance.onerror = (e) => {
            console.warn('[JARVIS] TTS error:', e);
            setVoiceState('idle');
            animateVizBars(false);
        };

        STATE.synthesis.speak(utterance);
    }

    function stopSpeaking() {
        if (STATE.synthesis) {
            STATE.synthesis.cancel();
            setVoiceState('idle');
            DOM.vizLabel.textContent = 'Say "JARVIS" to activate';
            animateVizBars(false);
        }
    }

    // ========================================
    // Audio Feedback
    // ========================================
    function playTone(freq, duration, volume = 0.1) {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = freq;
            osc.type = 'sine';
            gain.gain.value = volume;
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + duration);
        } catch (e) { /* Ignore audio errors */ }
    }

    // ========================================
    // Voice State Management
    // ========================================
    function setVoiceState(state) {
        STATE.voiceState = state;

        // Update orb
        DOM.voiceStatus.className = 'voice-status';
        DOM.voiceStatus.classList.add(state);

        const labels = {
            idle: 'STANDBY',
            listening: 'LISTENING',
            wake: 'ACTIVATED',
            processing: 'THINKING',
            speaking: 'SPEAKING',
        };

        DOM.voiceLabel.textContent = labels[state] || 'STANDBY';

        if (state === 'listening' || state === 'wake') {
            if (DOM.vizMicBtn) DOM.vizMicBtn.classList.add('listening');
            if (DOM.inputMicBtn) DOM.inputMicBtn.classList.add('listening');
        } else {
            if (DOM.vizMicBtn) DOM.vizMicBtn.classList.remove('listening');
            if (DOM.inputMicBtn) DOM.inputMicBtn.classList.remove('listening');
        }
    }

    // ========================================
    // Visualizer
    // ========================================
    function createVizBars() {
        const count = 60;
        DOM.vizBars.innerHTML = '';
        for (let i = 0; i < count; i++) {
            const bar = document.createElement('div');
            bar.classList.add('viz-bar');
            bar.style.setProperty('--bar-height', `${4 + Math.random() * 16}px`);
            bar.style.animationDelay = `${Math.random() * 0.6}s`;
            DOM.vizBars.appendChild(bar);
        }
    }

    function animateVizBars(active) {
        if (active) {
            DOM.vizBars.classList.add('active');
            // Randomize heights
            DOM.vizBars.querySelectorAll('.viz-bar').forEach(bar => {
                bar.style.setProperty('--bar-height', `${4 + Math.random() * 20}px`);
            });
        } else {
            DOM.vizBars.classList.remove('active');
        }
    }

    // ========================================
    // Process Voice Command
    // ========================================
    async function processVoiceCommand(command) {
        if (STATE.isProcessing) return;
        STATE.isProcessing = true;

        setVoiceState('processing');
        DOM.vizLabel.textContent = `Processing: "${command}"`;

        // Show user message
        addUserMessage(command, 'voice');

        // Show typing
        showTypingIndicator();

        // Get response
        const response = await getAIResponse(command);

        // Remove typing, show response
        removeTypingIndicator();
        addJarvisMessage(response);

        // Speak the response
        speak(response);

        STATE.isProcessing = false;
        
        // Sync status in case memories or settings changed
        syncStatusWithPython();
    }

    // ========================================
    // Process Text Input
    // ========================================
    async function processTextInput(input) {
        if (STATE.isProcessing) return;
        STATE.isProcessing = true;

        const trimmed = input.trim();
        if (!trimmed) {
            STATE.isProcessing = false;
            return;
        }

        // Clear input
        DOM.userInput.value = '';
        DOM.userInput.style.height = 'auto';

        // Handle clear
        if (trimmed.toLowerCase() === 'clear chat' || trimmed.toLowerCase() === 'clear') {
            DOM.chatMessages.innerHTML = '';
            addJarvisMessage('Chat cleared, Sir. Ready for new directives.');
            STATE.isProcessing = false;
            return;
        }

        // Show user message
        addUserMessage(trimmed, 'typed');

        // Show typing
        showTypingIndicator();

        // Get response
        const response = await getAIResponse(trimmed);

        // Remove typing, show response
        removeTypingIndicator();
        addJarvisMessage(response);

        // Check if command triggered Planetary Deck
        if (/\b(open\s+earth|show\s+earth|planetary\s+deck|orbital\s+deck|earth\s+globe|3d\s+earth)\b/i.test(trimmed) || 
            (typeof response === 'string' && response.includes('Planetary Observation Deck'))) {
            openPlanetaryDeck();
        }

        // Speak response
        speak(response);

        STATE.isProcessing = false;

        // Sync status in case memories or settings changed
        syncStatusWithPython();
    }

    // ========================================
    // AI Response Engine
    // ========================================
    async function getAIResponse(input) {
        // 1. Try Python bridge (pywebview)
        if (STATE.hasPyBridge && window.pywebview && window.pywebview.api) {
            try {
                const response = await window.pywebview.api.send_text_command(input);
                if (response) return response;
            } catch (e) {
                console.warn('[JARVIS] Python bridge error:', e);
            }
        }

        // 2. Try Browser-side Gemini API first (fastest — direct API, no proxy)
        if (STATE.geminiConnected && window._geminiRespond) {
            try {
                const response = await window._geminiRespond(input);
                if (response) return response;
            } catch (e) {
                console.warn('[JARVIS] Browser Gemini error:', e);
            }
        }

        // 3. Try local HTTP API (Python AIBrain on localhost)
        if (STATE.hasHttpApi) {
            try {
                const res = await fetch('/api/command', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: input }),
                    signal: AbortSignal.timeout(12000),
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.response) return data.response;
                }
            } catch (e) {
                console.warn('[JARVIS] HTTP API command error:', e);
            }
        }

        // 4. Local JS-based AI fallback
        return localAIRespond(input);
    }

    function localAIRespond(input) {
        const lower = input.toLowerCase().trim();

        // ---- Planetary Deck / 3D Earth ----
        if (/^(?:open|show|launch|start|display)?\s*(?:earth|globe|planetary\s*deck|orbital\s*deck|terraprime|anti\s*gravity)\b/i.test(lower)) {
            openPlanetaryDeck();
            return "Deploying TerraPrime Planetary Observation Deck and 3D Earth telemetry now, Sir.";
        }

        // ---- Direct Name / Wake Call ----
        if (/^(?:hey|hi|hello|ok|okay)?\s*jarvis[\s?!.,]*$/i.test(lower)) {
            const greetings = [
                "At your service, Sir. All systems are online and awaiting your command.",
                "Yes, Sir? Standing by and ready for your instructions.",
                "Online and listening, Sir. How may I assist you today?"
            ];
            return greetings[Math.floor(Math.random() * greetings.length)];
        }

        // ---- Help ----
        if (lower === 'help' || lower === '/help') {
            return `Here is what I can do, Sir.\n\n` +
                `<strong>🎙️ Voice Control</strong> — Say "JARVIS" followed by a command.\n` +
                `<strong>⚙️ Mode Switcher</strong> — Click 🎙️ Python, 🌐 Browser, or ⌨️ Text in the sidebar.\n` +
                `<strong>⟨/⟩ Programming</strong> — Ask coding questions and get guidance.\n` +
                `<strong>⚙ System</strong> — Say "open notepad", "open calculator", etc.\n` +
                `<strong>🧠 Memory</strong> — Say "remember this:" to store info, "recall memories" to retrieve.\n` +
                `<strong>🔍 Research</strong> — Connect Gemini for full AI capability.\n` +
                `<strong>📋 Quick</strong> — "time", "date", "system status", "tell me a joke".\n\n` +
                `For full AI intelligence, add your <strong>Gemini API key</strong> in the sidebar.`;
        }

        // ---- Mode Switching ----
        if (/switch.*(mode|voice)|change\s*mode|toggle\s*mode/i.test(lower)) {
            if (lower.includes('python')) {
                setVoiceMode('python');
                return "Switched voice engine to Python mode, Sir. Realtek microphone is actively listening.";
            } else if (lower.includes('browser') || lower.includes('web')) {
                setVoiceMode('browser');
                return "Switched voice engine to Browser Speech mode, Sir.";
            } else if (lower.includes('text')) {
                setVoiceMode('text');
                return "Switched to Text command mode, Sir.";
            } else {
                const nextMode = STATE.activeVoiceMode === 'python' ? 'browser' : (STATE.activeVoiceMode === 'browser' ? 'text' : 'python');
                setVoiceMode(nextMode);
                return `Switched voice mode to ${nextMode.toUpperCase()}, Sir.`;
            }
        }

        // ---- Time ----
        if (/what\s*(time|is\s*the\s*time)|current\s*time|time\s*(now|please)|tell.*time/i.test(lower)) {
            const now = new Date();
            return `The current time is ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}, Sir.`;
        }

        // ---- Date ----
        if (/what.*date|today.*date|current\s*date|what\s*day|what.*today/i.test(lower)) {
            const now = new Date();
            return `Today is ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}, Sir.`;
        }

        // ---- System Status ----
        if (lower === 'system status' || lower === 'status') {
            const uptime = DOM.uptimeVal.textContent;
            return `System diagnostics, Sir. All systems operational. Uptime: ${uptime}. ` +
                `Voice engine is ${STATE.voiceEnabled ? 'active' : 'inactive'}. ` +
                `Memory bank has ${STATE.memories.length} items stored. ` +
                `AI Mode: ${STATE.hasPyBridge ? 'Python Bridge' : 'Local Intelligence'}.`;
        }

        // ---- Remember ----
        if (lower.startsWith('remember this') || lower.startsWith('remember that')) {
            const info = input.replace(/^remember\s+(this|that)[:\s]*/i, '').trim();
            if (info) {
                STATE.memories.push({
                    content: info,
                    timestamp: new Date().toLocaleTimeString(),
                    id: Date.now(),
                });
                updateMemoryUI();
                return `Noted, Sir. I've committed that to memory. You now have ${STATE.memories.length} item${STATE.memories.length !== 1 ? 's' : ''} stored.`;
            }
            return "What would you like me to remember, Sir?";
        }

        // ---- Recall ----
        if (/recall\s*memories|recall|memories/i.test(lower)) {
            if (STATE.memories.length === 0) {
                return "No memories stored yet, Sir. Say 'remember this' followed by information to store.";
            }
            const items = STATE.memories.map((m, i) => `Item ${i + 1}: ${m.content}`).join('. ');
            return `You have ${STATE.memories.length} stored memories, Sir. ${items}.`;
        }

        // ---- Search Web via voice/text ----
        if (/^(search|find|look up|google|lookup)\s+(.+)/i.test(lower)) {
            const query = lower.replace(/^(search|find|look up|google|lookup)\s+/i, '').trim();
            if (query) {
                const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
                setTimeout(() => window.open(url, '_blank'), 500);
                return `Searching Google for "${query}" now, Sir. Opening in your browser.`;
            }
        }

        // ---- Open App via OS (calls /api/open_app on Python server) ----
        if (/^(open|launch|start|run|load)\s+/i.test(lower)) {
            const appName = lower.replace(/^(open|launch|start|run|load)\s+/i, '').trim();
            if (appName) {
                // Try HTTP API for OS-level app launch
                fetch(`/api/open_app?name=${encodeURIComponent(appName)}`)
                    .then(r => r.json())
                    .then(d => {
                        if (d && d.response) {
                            removeTypingIndicator();
                            addJarvisMessage(d.response);
                            speak(d.response);
                            STATE.isProcessing = false;
                        }
                    })
                    .catch(() => {});
                return `Attempting to open ${appName}, Sir. One moment...`;
            }
        }

        // ---- Greetings ----
        if (/^(hi|hello|hey|good\s*(morning|afternoon|evening|day)|greetings)/i.test(lower)) {
            const hour = new Date().getHours();
            const greeting = hour < 12 ? 'Good morning' : (hour < 17 ? 'Good afternoon' : 'Good evening');
            return `${greeting}, Sir. How may I assist you?`;
        }

        // ---- Who are you ----
        if (/who\s*are\s*you|what\s*are\s*you|your\s*name|introduce/i.test(lower)) {
            return "I am JARVIS, Just A Rather Very Intelligent System. An advanced AI voice assistant at your service, Sir.";
        }

        // ---- Thank you ----
        if (/thank\s*(you|u)|thanks|thx|ty/i.test(lower)) {
            const responses = ["You're most welcome, Sir.", "My pleasure, Sir.", "At your service, Sir.", "Glad I could help, Sir."];
            return responses[Math.floor(Math.random() * responses.length)];
        }

        // ---- Jokes ----
        if (/joke|funny|make\s*me\s*laugh|humor/i.test(lower)) {
            const jokes = [
                "Why do programmers prefer dark mode? Because light attracts bugs, Sir.",
                "There are only ten types of people in the world. Those who understand binary and those who don't.",
                "A SQL query walks into a bar, sees two tables, and asks... Can I join you?",
                "Why was the JavaScript developer sad? Because he didn't Node how to Express himself.",
                "I'd tell you a UDP joke, but you might not get it, Sir.",
                "Why do Java developers wear glasses? Because they can't C sharp.",
            ];
            return jokes[Math.floor(Math.random() * jokes.length)];
        }

        // ---- How are you ----
        if (/how\s*are\s*you|how.*doing|you\s*ok/i.test(lower)) {
            return "All systems nominal, Sir. Thank you for asking. How may I assist you?";
        }

        // ---- Default ----
        return "I understand, Sir. For more comprehensive answers, connect a Gemini API key in the sidebar to unlock full AI capability. " +
            "In the meantime, I can help with time, date, system status, memory, jokes, and more.";
    }

    // ========================================
    // Chat Messaging
    // ========================================
    function addMessage(sender, content, isHtml = false, source = '') {
        const msg = document.createElement('div');
        msg.classList.add('message');
        if (sender === 'user') msg.classList.add('user-msg');

        const avatarLabel = sender === 'jarvis' ? '⌘' : '&gt;_';
        const senderLabel = sender === 'jarvis' ? '[ J.A.R.V.I.S. // KERNEL_EXEC ]' : '[ OPERATOR@JARVIS-LOBBY:~# ]';
        const sourceTag = source ? `<div class="message-source">${source === 'voice' ? '[ 🎙️ AUDIO_INTERCEPT ]' : '[ ⌨️ TTY_INPUT ]'}</div>` : '';

        msg.innerHTML = `
            <div class="message-avatar ${sender}">${avatarLabel}</div>
            <div class="message-body">
                <div class="message-sender ${sender}">${senderLabel}</div>
                <div class="message-content">${isHtml ? content : escapeHtml(content)}</div>
                ${sourceTag}
            </div>
        `;

        DOM.chatMessages.appendChild(msg);
        scrollToBottom();
        playTone(sender === 'jarvis' ? 880 : 520, 0.05, 0.03);
        return msg;
    }

    function addJarvisMessage(htmlContent) {
        return addMessage('jarvis', formatMessage(htmlContent), true);
    }

    function addUserMessage(text, source = '') {
        STATE.conversationHistory.push({ role: 'user', content: text, source });
        return addMessage('user', text, false, source);
    }

    function showTypingIndicator() {
        const typing = document.createElement('div');
        typing.classList.add('message');
        typing.id = 'typing-indicator';
        typing.innerHTML = `
            <div class="message-avatar jarvis">J</div>
            <div class="message-body">
                <div class="message-sender jarvis">J.A.R.V.I.S.</div>
                <div class="message-content">
                    <div class="typing-indicator">
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                    </div>
                </div>
            </div>
        `;
        DOM.chatMessages.appendChild(typing);
        scrollToBottom();
    }

    function removeTypingIndicator() {
        const el = document.getElementById('typing-indicator');
        if (el) el.remove();
    }

    function scrollToBottom() {
        requestAnimationFrame(() => {
            DOM.chatMessages.scrollTop = DOM.chatMessages.scrollHeight;
        });
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatMessage(text) {
        return text.replace(/\n/g, '<br>');
    }

    // ========================================
    // Memory UI
    // ========================================
    function updateMemoryUI() {
        if (STATE.memories.length === 0) {
            DOM.memoryList.innerHTML = '<p class="memory-empty">No memories stored yet.</p>';
            return;
        }

        DOM.memoryList.innerHTML = '';
        STATE.memories.forEach((mem) => {
            const el = document.createElement('div');
            el.classList.add('memory-item');
            el.innerHTML = `
                ${escapeHtml(mem.content)}
                <span class="memory-time">${mem.timestamp || mem.time || ''}</span>
                <button class="memory-delete" data-id="${mem.id}" title="Remove">✕</button>
            `;
            DOM.memoryList.appendChild(el);
        });

        DOM.memoryList.querySelectorAll('.memory-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const memId = parseInt(e.target.dataset.id);
                if (STATE.hasPyBridge && window.pywebview && window.pywebview.api) {
                    try {
                        const success = await window.pywebview.api.delete_memory(memId);
                        if (success) {
                            STATE.memories = STATE.memories.filter(m => m.id !== memId);
                            updateMemoryUI();
                        }
                    } catch (err) {
                        console.error('[JARVIS] Failed to delete memory from Python:', err);
                    }
                } else if (STATE.hasHttpApi) {
                    try {
                        const res = await fetch(`/api/delete_memory?id=${memId}`);
                        if (res.ok) {
                            const data = await res.json();
                            if (data && data.success) {
                                STATE.memories = STATE.memories.filter(m => m.id !== memId);
                                updateMemoryUI();
                            }
                        }
                    } catch (err) {
                        console.error('[JARVIS] Failed to delete memory via HTTP:', err);
                    }
                } else {
                    STATE.memories = STATE.memories.filter(m => m.id !== memId);
                    updateMemoryUI();
                }
            });
        });
    }

    // ========================================
    // Particles & Clock
    // ========================================
    function createParticles() {
        if (!DOM.particlesContainer) return;
        for (let i = 0; i < 30; i++) {
            const p = document.createElement('div');
            p.classList.add('particle');
            p.style.left = `${Math.random() * 100}%`;
            p.style.animationDuration = `${6 + Math.random() * 10}s`;
            p.style.animationDelay = `${Math.random() * 8}s`;
            p.style.width = `${1 + Math.random() * 2}px`;
            p.style.height = p.style.width;
            DOM.particlesContainer.appendChild(p);
        }
    }

    function updateClock() {
        const now = new Date();
        DOM.systemClock.textContent = now.toLocaleTimeString('en-GB');
    }

    function updateUptime() {
        const elapsed = Math.floor((Date.now() - STATE.uptimeStart) / 1000);
        const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
        const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
        const s = String(elapsed % 60).padStart(2, '0');
        DOM.uptimeVal.textContent = `${h}:${m}:${s}`;
    }

    function updateStats() {
        const cpu = 15 + Math.random() * 30;
        const mem = 35 + Math.random() * 20;
        const net = 40 + Math.random() * 40;
        DOM.cpuBar.style.width = `${cpu}%`;
        DOM.memBar.style.width = `${mem}%`;
        DOM.netBar.style.width = `${net}%`;
        DOM.cpuVal.textContent = `${Math.round(cpu)}%`;
        DOM.memVal.textContent = `${Math.round(mem)}%`;
        DOM.netVal.textContent = `${Math.round(net)}%`;
    }

    // ========================================
    // Python Bridge Callbacks (called from Python)
    // ========================================
    // These functions are called by jarvis_desktop.py via evaluate_js

    window.onWakeWord = function () {
        setVoiceState('wake');
        DOM.vizLabel.textContent = 'Wake word detected!';
        playTone(880, 0.1, 0.08);
    };

    window.onListening = function () {
        setVoiceState('listening');
        DOM.vizLabel.textContent = 'Listening for command...';
        animateVizBars(true);
    };

    window.onCommand = function (command) {
        setVoiceState('processing');
        DOM.vizLabel.textContent = `Processing: "${command}"`;
        addUserMessage(command, 'voice');
        showTypingIndicator();
    };

    window.onResponse = function (response) {
        removeTypingIndicator();
        addJarvisMessage(response);
    };

    window.onSpeaking = function () {
        setVoiceState('speaking');
        DOM.vizLabel.textContent = 'Speaking...';
        animateVizBars(true);
    };

    window.onIdle = function () {
        setVoiceState('idle');
        DOM.vizLabel.textContent = 'Say "JARVIS" to activate';
        animateVizBars(false);
    };

    window.onVoiceError = function (errorMsg) {
        DOM.vizLabel.textContent = `Error: ${errorMsg}`;
    };

    window.updateVoiceStatus = function (status) {
        setVoiceState(status);
    };

    // ========================================
    // Event Listeners
    // ========================================
    function initEventListeners() {
        // Send button
        DOM.sendBtn.addEventListener('click', () => processTextInput(DOM.userInput.value));

        // Enter key
        DOM.userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                processTextInput(DOM.userInput.value);
            }
        });

        // Auto-resize textarea
        DOM.userInput.addEventListener('input', () => {
            DOM.userInput.style.height = 'auto';
            DOM.userInput.style.height = Math.min(DOM.userInput.scrollHeight, 150) + 'px';
        });

        // Mode Selector (Sidebar & Header)
        if (DOM.pillModePython) {
            DOM.pillModePython.addEventListener('click', () => setVoiceMode('python'));
        }
        if (DOM.pillModeBrowser) {
            DOM.pillModeBrowser.addEventListener('click', () => setVoiceMode('browser'));
        }
        if (DOM.pillModeText) {
            DOM.pillModeText.addEventListener('click', () => setVoiceMode('text'));
        }
        if (DOM.hModePython) {
            DOM.hModePython.addEventListener('click', () => setVoiceMode('python'));
        }
        if (DOM.hModeBrowser) {
            DOM.hModeBrowser.addEventListener('click', () => setVoiceMode('browser'));
        }
        if (DOM.hModeText) {
            DOM.hModeText.addEventListener('click', () => setVoiceMode('text'));
        }
        if (DOM.hModeEarth) {
            DOM.hModeEarth.addEventListener('click', openPlanetaryDeck);
        }
        if (DOM.planetaryClose) {
            DOM.planetaryClose.addEventListener('click', closePlanetaryDeck);
        }
        if (DOM.planetaryPopout) {
            DOM.planetaryPopout.addEventListener('click', () => {
                window.open('earth_landing_page.html', '_blank');
            });
        }
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && DOM.planetaryOverlay && DOM.planetaryOverlay.style.display !== 'none') {
                closePlanetaryDeck();
            }
        });
        if (DOM.statVoiceMode) {
            DOM.statVoiceMode.addEventListener('click', () => {
                if (STATE.activeVoiceMode === 'python') setVoiceMode('browser');
                else if (STATE.activeVoiceMode === 'browser') setVoiceMode('text');
                else setVoiceMode('python');
            });
        }

        // Direct Mic Listening Trigger Buttons
        if (DOM.vizMicBtn) {
            DOM.vizMicBtn.addEventListener('click', () => triggerListening());
        }
        if (DOM.inputMicBtn) {
            DOM.inputMicBtn.addEventListener('click', () => triggerListening());
        }

        // Toggle voice button (triggers listening or activates voice)
        if (DOM.btnToggleVoice) {
            DOM.btnToggleVoice.addEventListener('click', () => triggerListening());
        }

        // Stop speaking
        DOM.btnStopSpeak.addEventListener('click', stopSpeaking);

        // Quick commands
        document.querySelectorAll('.cmd-btn[data-cmd]').forEach(btn => {
            btn.addEventListener('click', () => {
                const cmd = btn.dataset.cmd;
                if (cmd) processTextInput(cmd);
            });
        });

        // Gemini connect
        DOM.btnSetGemini.addEventListener('click', async () => {
            const key = DOM.geminiKeyInput.value.trim();
            if (!key) {
                DOM.geminiStatus.textContent = 'Please enter an API key';
                DOM.geminiStatus.className = 'gemini-status error';
                return;
            }

            // If we have a Python bridge, send the key there
            if (STATE.hasPyBridge && window.pywebview && window.pywebview.api) {
                try {
                    DOM.geminiStatus.textContent = 'Testing connection...';
                    DOM.geminiStatus.className = 'gemini-status';
                    const response = await window.pywebview.api.set_gemini_key(key);
                    if (response && response.success) {
                        DOM.geminiStatus.textContent = '✓ Gemini connected!';
                        DOM.geminiStatus.className = 'gemini-status connected';
                        STATE.geminiConnected = true;
                        DOM.geminiKeyInput.value = ''; // clear input
                        addJarvisMessage(`<strong>Gemini AI connected.</strong> ${response.message || 'Connection established, Sir.'}`);
                        await syncStatusWithPython();
                    } else {
                        const err = (response && response.error) ? response.error : 'Connection failed';
                        DOM.geminiStatus.textContent = `✗ ${err}`;
                        DOM.geminiStatus.className = 'gemini-status error';
                        STATE.geminiConnected = false;
                        addJarvisMessage(`<strong>System alert.</strong> Gemini connection failed: ${err}`);
                    }
                } catch (e) {
                    DOM.geminiStatus.textContent = '✗ Connection failed';
                    DOM.geminiStatus.className = 'gemini-status error';
                }
            } else if (STATE.hasHttpApi) {
                try {
                    DOM.geminiStatus.textContent = 'Testing connection...';
                    DOM.geminiStatus.className = 'gemini-status';
                    const res = await fetch(`/api/set_key?key=${encodeURIComponent(key)}`);
                    if (res.ok) {
                        const response = await res.json();
                        if (response && response.success) {
                            DOM.geminiStatus.textContent = '✓ Gemini connected!';
                            DOM.geminiStatus.className = 'gemini-status connected';
                            STATE.geminiConnected = true;
                            DOM.geminiKeyInput.value = ''; // clear input
                            addJarvisMessage(`<strong>Gemini AI connected.</strong> ${response.message || 'Connection established, Sir.'}`);
                            await syncStatusWithPython();
                        } else {
                            const err = (response && response.error) ? response.error : 'Connection failed';
                            DOM.geminiStatus.textContent = `✗ ${err}`;
                            DOM.geminiStatus.className = 'gemini-status error';
                            STATE.geminiConnected = false;
                            addJarvisMessage(`<strong>System alert.</strong> Gemini connection failed: ${err}`);
                        }
                    }
                } catch (e) {
                    DOM.geminiStatus.textContent = '✗ Connection failed';
                    DOM.geminiStatus.className = 'gemini-status error';
                }
            } else {
                // Store key for local Gemini REST calls
                STATE.geminiApiKey = key;
                DOM.geminiStatus.textContent = '✓ Key saved — testing...';
                DOM.geminiStatus.className = 'gemini-status connected';

                // Enable Gemini in the local AI
                enableLocalGemini(key);
            }
        });
    }

    // ========================================
    // Local Gemini REST Integration
    // ========================================
    let geminiHistory = [];

    async function enableLocalGemini(apiKey) {
        STATE.geminiApiKey = apiKey;

        // Override the AI response function
        const originalGetAIResponse = getAIResponse;

        window._geminiRespond = async function (input) {
            const isOR = apiKey.startsWith('sk-or-v1-');
            if (isOR) {
                const models = ['google/gemini-3.8-flash', 'google/gemini-2.5-flash', 'meta-llama/llama-3.3-70b-instruct'];
                geminiHistory.push({ role: 'user', content: input });
                
                for (const model of models) {
                    try {
                        const url = 'https://openrouter.ai/api/v1/chat/completions';
                        const messages = [
                            { role: 'system', content: "You are JARVIS (Just A Rather Very Intelligent System), an advanced AI voice assistant. Address the user as 'Sir'. Be concise — responses will be spoken aloud via TTS. Keep answers to 2-4 sentences for simple queries. Do NOT use markdown, bullet points, code blocks, asterisks, or special formatting. Write naturally as spoken English. Be intelligent, calm, professional, and proactive. Never fabricate facts." }
                        ];
                        for (const m of geminiHistory.slice(-20)) {
                            const entry = { role: m.role, content: m.content };
                            if (m.reasoning_details) entry.reasoning_details = m.reasoning_details;
                            messages.append ? messages.append(entry) : messages.push(entry);
                        }

                        const response = await fetch(url, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${apiKey}`,
                                'Content-Type': 'application/json',
                                'HTTP-Referer': window.location.origin,
                                'X-Title': 'JARVIS Terminal'
                            },
                            body: JSON.stringify({
                                model: model,
                                messages: messages,
                                reasoning: { enabled: true }
                            })
                        });

                        if (!response.ok) continue;

                        const data = await response.json();
                        const msgObj = data.choices?.[0]?.message;
                        const text = msgObj?.content?.trim();
                        if (!text) continue;

                        const histObj = { role: 'assistant', content: text };
                        if (msgObj.reasoning_details) histObj.reasoning_details = msgObj.reasoning_details;
                        geminiHistory.push(histObj);
                        return text;
                    } catch (e) {
                        console.warn(`[JARVIS] OpenRouter (${model}) error:`, e);
                    }
                }
                DOM.geminiStatus.textContent = `✗ Connection failed`;
                DOM.geminiStatus.classList.remove('connected');
                return null;
            }

            const models = ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-2.5-flash', 'gemini-2.0-flash'];
            geminiHistory.push({ role: 'user', parts: [{ text: input }] });

            const payload = {
                system_instruction: {
                    parts: [{ text: "You are JARVIS (Just A Rather Very Intelligent System), an advanced AI voice assistant. Address the user as 'Sir'. Be concise — responses will be spoken aloud via TTS. Keep answers to 2-4 sentences for simple queries. Do NOT use markdown, bullet points, code blocks, asterisks, or special formatting. Write naturally as spoken English. Be intelligent, calm, professional, and proactive. Never fabricate facts." }]
                },
                contents: geminiHistory.slice(-20),
                generationConfig: { temperature: 0.75, maxOutputTokens: 350 }
            };

            for (const model of models) {
                try {
                    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                    });

                    if (response.status === 404) {
                        console.warn(`[JARVIS] Model ${model} returned 404, trying next fallback...`);
                        continue;
                    }

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }

                    const data = await response.json();
                    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                    if (!text) throw new Error('Empty response from Gemini');

                    geminiHistory.push({ role: 'model', parts: [{ text }] });
                    return text;

                } catch (e) {
                    console.warn(`[JARVIS] Gemini (${model}) error:`, e);
                }
            }

            DOM.geminiStatus.textContent = `✗ Connection failed`;
            DOM.geminiStatus.classList.remove('connected');
            return null;
        };

        // Test the connection
        try {
            const testResult = await window._geminiRespond('Say "Connection established" in one sentence.');
            if (testResult) {
                DOM.geminiStatus.textContent = '✓ Gemini AI connected!';
                DOM.geminiStatus.classList.add('connected');
                STATE.geminiConnected = true;
                addJarvisMessage(`<strong>Gemini AI connected.</strong> I now have full conversational intelligence, Sir. Ask me anything.`);
            }
        } catch (e) {
            DOM.geminiStatus.textContent = '✗ Connection failed';
            DOM.geminiStatus.classList.remove('connected');
        }
    }


    // ========================================
    // Utilities
    // ========================================
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ========================================
    // Status Synchronization & Python Bridge
    // ========================================
    async function syncStatusWithPython() {
        if (STATE.hasPyBridge && window.pywebview && window.pywebview.api) {
            try {
                const status = await window.pywebview.api.get_status();
                if (status) {
                    handleStatusSync(status);
                }
            } catch (e) {
                console.error('[JARVIS] Failed to sync status with Python:', e);
            }
        } else if (STATE.hasHttpApi) {
            try {
                const res = await fetch('/api/status');
                if (res.ok) {
                    const status = await res.json();
                    if (status) {
                        handleStatusSync(status);
                    }
                }
            } catch (e) {
                console.error('[JARVIS] Failed to sync status via HTTP API:', e);
            }
        }
    }

    function handleStatusSync(status) {
        if (status.using_gemini) {
            DOM.geminiStatus.textContent = `✓ Gemini active (${status.model_name})`;
            DOM.geminiStatus.className = 'gemini-status connected';
            STATE.geminiConnected = true;
        } else {
            STATE.geminiConnected = false;
            if (status.last_error) {
                DOM.geminiStatus.textContent = `✗ ${status.last_error}`;
                DOM.geminiStatus.className = 'gemini-status error';
            } else {
                DOM.geminiStatus.textContent = 'Local AI mode';
                DOM.geminiStatus.className = 'gemini-status';
            }
        }

        // Sync memories
        if (status.memories) {
            STATE.memories = status.memories.map(m => ({
                id: m.id,
                content: m.content,
                timestamp: m.time,
            }));
            updateMemoryUI();
        }
    }

    async function checkPyBridge() {
        if (window.pywebview && window.pywebview.api) {
            STATE.hasPyBridge = true;
            console.log('[JARVIS] Python bridge detected.');
            await syncStatusWithPython();
        }
    }

    // ========================================
    // Matrix Digital Rain Animation
    // ========================================
    let matrixRainActive = true;

    function initMatrixRain() {
        const canvas = document.getElementById('matrix-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        resize();
        window.addEventListener('resize', resize);

        const chars = '0123456789ABCDEF01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン☠⚡☣☢⌘⌥';
        const fontSize = 13;
        let columns = Math.floor(canvas.width / fontSize);
        let drops = Array(columns).fill(1);

        window.addEventListener('resize', () => {
            columns = Math.floor(canvas.width / fontSize);
            drops = Array(columns).fill(1);
        });

        function draw() {
            if (!matrixRainActive) return;

            const isRed = document.body.classList.contains('theme-red');
            const isCyber = document.body.classList.contains('theme-cyber');

            ctx.fillStyle = isRed ? 'rgba(11, 2, 4, 0.08)' : (isCyber ? 'rgba(2, 7, 18, 0.08)' : 'rgba(3, 7, 4, 0.08)');
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.font = `${fontSize}px 'Share Tech Mono', monospace`;

            for (let i = 0; i < drops.length; i++) {
                const text = chars.charAt(Math.floor(Math.random() * chars.length));
                const x = i * fontSize;
                const y = drops[i] * fontSize;

                if (Math.random() > 0.88) {
                    ctx.fillStyle = '#ffffff';
                } else if (isRed) {
                    ctx.fillStyle = '#ff1744';
                } else if (isCyber) {
                    ctx.fillStyle = '#00f0ff';
                } else {
                    ctx.fillStyle = '#00ff41';
                }

                ctx.fillText(text, x, y);

                if (y > canvas.height && Math.random() > 0.975) {
                    drops[i] = 0;
                }
                drops[i]++;
            }
        }

        setInterval(draw, 45);
    }

    // ========================================
    // Theme Switcher & Rain Controls
    // ========================================
    function initThemeSwitcher() {
        const savedTheme = localStorage.getItem('jarvis_theme') || 'kali';
        setCyberTheme(savedTheme, false);

        const btnKali   = document.getElementById('btn-theme-kali');
        const btnMatrix = document.getElementById('btn-theme-matrix');
        const btnCyber  = document.getElementById('btn-theme-cyber');
        const btnRed    = document.getElementById('btn-theme-red');
        const btnRain   = document.getElementById('btn-toggle-rain');

        if (btnKali)   btnKali.addEventListener('click',   () => setCyberTheme('kali'));
        if (btnMatrix) btnMatrix.addEventListener('click', () => setCyberTheme('matrix'));
        if (btnCyber)  btnCyber.addEventListener('click',  () => setCyberTheme('cyber'));
        if (btnRed)    btnRed.addEventListener('click',    () => setCyberTheme('red'));

        if (btnRain) {
            btnRain.addEventListener('click', () => {
                matrixRainActive = !matrixRainActive;
                const canvas = document.getElementById('matrix-canvas');
                if (canvas) canvas.classList.toggle('hidden', !matrixRainActive);
                btnRain.textContent = matrixRainActive ? 'ACTIVE' : 'OFF';
                btnRain.classList.toggle('active', matrixRainActive);
                playTone(matrixRainActive ? 880 : 440, 0.08, 0.05);
            });
        }
    }

    function setCyberTheme(theme, playSound = true) {
        document.body.classList.remove('theme-kali', 'theme-matrix', 'theme-cyber', 'theme-red');
        document.body.classList.add(`theme-${theme}`);
        localStorage.setItem('jarvis_theme', theme);

        const buttons = [
            { id: 'btn-theme-kali',   theme: 'kali'   },
            { id: 'btn-theme-matrix', theme: 'matrix' },
            { id: 'btn-theme-cyber',  theme: 'cyber'  },
            { id: 'btn-theme-red',    theme: 'red'    },
        ];
        buttons.forEach(b => {
            const el = document.getElementById(b.id);
            if (el) el.classList.toggle('active', b.theme === theme);
        });

        if (playSound) playTone(660, 0.08, 0.05);
    }

    // ========================================
    // Search Engine
    // ========================================
    function initSearch() {
        const searchInput  = document.getElementById('search-input');
        const searchBtn    = document.getElementById('search-btn');
        const engineSelect = document.getElementById('search-engine-select');

        function doSearch() {
            const query = searchInput ? searchInput.value.trim() : '';
            if (!query) return;
            const baseUrl = engineSelect ? engineSelect.value : 'https://www.google.com/search?q=';
            const url = baseUrl + encodeURIComponent(query);
            window.open(url, '_blank');
            // Also tell JARVIS about the search
            const msg = `Searching for "${query}" on ${engineSelect ? engineSelect.options[engineSelect.selectedIndex].text : 'Google'}, Sir.`;
            addJarvisMessage(msg);
            speak(msg);
            if (searchInput) searchInput.value = '';
        }

        if (searchInput) {
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
            });
        }
        if (searchBtn) {
            searchBtn.addEventListener('click', doSearch);
        }

        // Quick link buttons
        document.querySelectorAll('.sq-link[data-url]').forEach(btn => {
            btn.addEventListener('click', () => {
                window.open(btn.dataset.url, '_blank');
                playTone(880, 0.06, 0.04);
            });
        });

        // Also handle JARVIS voice/text command: "search for X"
        console.log('[JARVIS] Search engine initialized.');
    }

    // ========================================
    // Init
    // ========================================
    function init() {
        initMatrixRain();
        initThemeSwitcher();
        initSearch();
        createParticles();
        createVizBars();
        initEventListeners();

        updateClock();
        setInterval(updateClock, 1000);
        setInterval(updateUptime, 1000);
        setInterval(updateStats, 3000);

        // Listen for Python bridge ready event
        window.addEventListener('pywebviewready', checkPyBridge);
        // Also check if already injected
        if (window.pywebview && window.pywebview.api) {
            checkPyBridge();
        }

        // Web Fallback/HTTP API Detection
        setTimeout(async () => {
            if (!STATE.hasPyBridge) {
                console.log('[JARVIS] Python bridge not detected. Testing local HTTP API...');
                try {
                    const res = await fetch('/api/status');
                    if (res.ok) {
                        STATE.hasHttpApi = true;
                        console.log('[JARVIS] Local HTTP API detected.');
                        await syncStatusWithPython();
                        // Auto-load Gemini key from server config
                        try {
                            const cfgRes = await fetch('/api/config');
                            if (cfgRes.ok) {
                                const cfg = await cfgRes.json();
                                if (cfg && cfg.gemini_connected && !STATE.geminiConnected) {
                                    // Server has a valid key — load from config.json for browser use
                                    const cfgJson = await fetch('/config.json');
                                    if (cfgJson.ok) {
                                        const rawCfg = await cfgJson.json();
                                        if (rawCfg && rawCfg.gemini_api_key) {
                                            await enableLocalGemini(rawCfg.gemini_api_key);
                                            console.log('[JARVIS] Auto-loaded Gemini key from config.');
                                        }
                                    }
                                }
                            }
                        } catch(configErr) {
                            console.warn('[JARVIS] Auto-config load skipped:', configErr);
                        }
                    } else {
                        await loadLocalConfigFallback();
                    }
                } catch (e) {
                    console.log('[JARVIS] Local HTTP API not active. Running in pure browser fallback.');
                    await loadLocalConfigFallback();
                }
            }
        }, 1000);

        async function loadLocalConfigFallback() {
            try {
                const response = await fetch('/config.json');
                if (response.ok) {
                    const config = await response.json();
                    if (config && config.gemini_api_key) {
                        enableLocalGemini(config.gemini_api_key);
                    }
                }
            } catch (e) {
                console.warn('[JARVIS] Could not load config.json directly:', e);
            }
        }

        // Run boot
        runBootSequence();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
