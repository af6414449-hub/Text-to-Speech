// content.js
(function () {
    'use strict';

    if (window.__ttsContentLoaded) return;
    window.__ttsContentLoaded = true;

    let isSpeechModeActive = false;
    let isSpeaking = false;
    let audioElement = null;
    let currentUtterance = null;
    let isStopped = false;
    let currentSpeed = 1.0;
    let currentVoice = 'Microsoft Mark - English (United States)';
    let isInitialized = false;
    let ctrlHeld = false;
    let hoveredEl = null;

    const HOVER_CLASS = 'tts-hover-target';

    const VOICE_COLORS = {
        'Microsoft Mark - English (United States)': '#c2410c',
        'Microsoft Pavel - Russian (Russia)':       '#1e3a8a',
        'tr-TR-AhmetNeural':                         '#b03052'
    };

    function accentColor(voice) {
        return VOICE_COLORS[voice] || VOICE_COLORS['Microsoft Mark - English (United States)'];
    }

    function log(message, data = null) {
        if (data !== undefined && data !== null) console.log('[TTS]', message, data);
        else console.log('[TTS]', message);
    }

    // ========== TEXT ==========
    function getSelectedText() {
        try {
            const selection = window.getSelection();
            if (!selection || selection.isCollapsed) return null;
            const text = selection.toString().trim();
            return text && text.length > 1 ? text : null;
        } catch (e) { return null; }
    }

    function getTextFromElement(el) {
        if (!el) return null;
        let node = el;
        for (let i = 0; i < 6 && node && node !== document.body; i++) {
            const text = (node.innerText || node.textContent || '').trim();
            if (text && text.length > 1) {
                return text.length > 5000 ? text.slice(0, 5000) : text;
            }
            node = node.parentElement;
        }
        return null;
    }

    // ========== HOVER HIGHLIGHT ==========
    function ensureHoverStyle() {
        let style = document.getElementById('tts-hover-style');
        if (!style) {
            style = document.createElement('style');
            style.id = 'tts-hover-style';
            (document.head || document.documentElement).appendChild(style);
        }
        const c = accentColor(currentVoice);
        style.textContent = `
            .${HOVER_CLASS} {
                outline: 2px solid ${c} !important;
                outline-offset: 2px !important;
                background-color: ${c}1a !important;
                cursor: pointer !important;
            }
        `;
    }

    function isTextElement(el) {
        if (!el || el.nodeType !== 1) return false;
        if (el.closest && el.closest('#tts-cursor-indicator')) return false;
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK', 'HEAD'].includes(el.tagName)) return false;
        return ((el.innerText || el.textContent || '').trim().length > 1);
    }

    function clearHover() {
        if (hoveredEl) {
            hoveredEl.classList.remove(HOVER_CLASS);
            hoveredEl = null;
        }
    }

    function highlightFromPoint(x, y) {
        if (!isSpeechModeActive || !ctrlHeld) { clearHover(); return; }
        ensureHoverStyle();
        const el = document.elementFromPoint(x, y);
        if (!el || !isTextElement(el)) { clearHover(); return; }
        if (hoveredEl === el) return;
        clearHover();
        hoveredEl = el;
        hoveredEl.classList.add(HOVER_CLASS);
    }

    function onMouseMove(e) {
        window.__ttsLastX = e.clientX;
        window.__ttsLastY = e.clientY;
        highlightFromPoint(e.clientX, e.clientY);
        positionIndicator(e.clientX, e.clientY);
    }

    function onMouseOut(e) {
        if (hoveredEl && e.target === hoveredEl) clearHover();
    }

    // ========== CROSS-FRAME CTRL SYNC ==========
    function broadcastCtrl(held) {
        const msg = { __tts: true, type: 'ctrl', held };
        try { window.parent.postMessage(msg, '*'); } catch (e) {}
        try {
            for (let i = 0; i < window.frames.length; i++) {
                window.frames[i].postMessage(msg, '*');
            }
        } catch (e) {}
    }

    window.addEventListener('message', function (e) {
        const d = e.data;
        if (!d || d.__tts !== true || d.type !== 'ctrl') return;
        ctrlHeld = !!d.held;
        if (!ctrlHeld) clearHover();
        else if (window.__ttsLastX != null && window.__ttsLastY != null) {
            highlightFromPoint(window.__ttsLastX, window.__ttsLastY);
        }
    });

    // ========== KEY HANDLERS ==========
    function onKeyDown(e) {
        if (!isSpeechModeActive) return;
        if (e.key === 'Control' || e.key === 'Meta') {
            ctrlHeld = true;
            broadcastCtrl(true);
            ensureHoverStyle();
            if (window.__ttsLastX != null && window.__ttsLastY != null) {
                highlightFromPoint(window.__ttsLastX, window.__ttsLastY);
            }
        }
    }

    function onKeyUp(e) {
        if (e.key === 'Control' || e.key === 'Meta') {
            ctrlHeld = false;
            broadcastCtrl(false);
            clearHover();
        }
    }

    function onWindowBlur() {
        ctrlHeld = false;
        broadcastCtrl(false);
        clearHover();
    }

    // ========== CTRL + LEFT CLICK = speak / stop ==========
    function onMouseDown(e) {
        if (!isSpeechModeActive) return;
        if (e.button !== 0) return;
        if (!(ctrlHeld || e.ctrlKey || e.metaKey)) return;

        e.preventDefault();
        e.stopPropagation();

        if (isSpeaking) {
            stopAllAudio();
            return;
        }

        const selected = getSelectedText();
        if (selected) {
            speakTextDirect(selected, currentSpeed, currentVoice);
            return;
        }

        const target = document.elementFromPoint(e.clientX, e.clientY) || e.target;
        if (!isTextElement(target)) return;

        const text = getTextFromElement(target);
        if (!text) return;

        speakTextDirect(text, currentSpeed, currentVoice);
    }

    function onClickCapture(e) {
        if (!isSpeechModeActive) return;
        if (!(ctrlHeld || e.ctrlKey || e.metaKey)) return;
        const target = document.elementFromPoint(e.clientX, e.clientY) || e.target;
        if (isTextElement(target)) {
            e.preventDefault();
            e.stopPropagation();
        }
    }

    function onAuxClick(e) {
        if (!isSpeechModeActive) return;
        if (!(ctrlHeld || e.ctrlKey || e.metaKey)) return;
        if (e.button === 0) {
            const target = document.elementFromPoint(e.clientX, e.clientY) || e.target;
            if (isTextElement(target)) {
                e.preventDefault();
                e.stopPropagation();
            }
        }
    }

    // ========== LISTENERS LIFECYCLE ==========
    function attachHoverListeners() {
        ensureHoverStyle();
        document.addEventListener('mousemove', onMouseMove, true);
        document.addEventListener('mouseout', onMouseOut, true);
        document.addEventListener('mousedown', onMouseDown, true);
        document.addEventListener('click', onClickCapture, true);
        document.addEventListener('auxclick', onAuxClick, true);
        document.addEventListener('keydown', onKeyDown, true);
        document.addEventListener('keyup', onKeyUp, true);
        window.addEventListener('blur', onWindowBlur);
    }

    function detachHoverListeners() {
        document.removeEventListener('mousemove', onMouseMove, true);
        document.removeEventListener('mouseout', onMouseOut, true);
        document.removeEventListener('mousedown', onMouseDown, true);
        document.removeEventListener('click', onClickCapture, true);
        document.removeEventListener('auxclick', onAuxClick, true);
        document.removeEventListener('keydown', onKeyDown, true);
        document.removeEventListener('keyup', onKeyUp, true);
        window.removeEventListener('blur', onWindowBlur);
        clearHover();
        ctrlHeld = false;
    }

    // ========== CURSOR INDICATOR (white, black outline) ==========
    const SPEAKER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
     fill="#ffffff" stroke="#000000" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
    <path class="tts-wave tts-wave-1" d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
    <path class="tts-wave tts-wave-2" d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
</svg>`;

    function ensureIndicatorStyle() {
        if (document.getElementById('tts-indicator-style')) return;
        const style = document.createElement('style');
        style.id = 'tts-indicator-style';
        style.textContent = `
            @keyframes ttsWave {
                0%   { opacity: 0.2; }
                50%  { opacity: 1; }
                100% { opacity: 0.2; }
            }
            #tts-cursor-indicator .tts-wave-1 { animation: ttsWave 1s ease-in-out infinite; }
            #tts-cursor-indicator .tts-wave-2 { animation: ttsWave 1s ease-in-out infinite 0.3s; }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    let indicatorEl = null;

    function ensureIndicator() {
        if (indicatorEl && indicatorEl.isConnected) return indicatorEl;
        ensureIndicatorStyle();
        const el = document.createElement('div');
        el.id = 'tts-cursor-indicator';
        el.style.cssText = `
            position: fixed;
            width: 26px;
            height: 26px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: transparent;
            pointer-events: none;
            z-index: 2147483647;
            opacity: 0;
            transition: opacity 0.15s ease;
            user-select: none;
        `;
        el.innerHTML = SPEAKER_SVG;
        document.body.appendChild(el);
        indicatorEl = el;
        return el;
    }

    function positionIndicator(x, y) {
        if (!indicatorEl) return;
        indicatorEl.style.left = (x + 16) + 'px';
        indicatorEl.style.top = (y - 30) + 'px';
    }

    function showIndicator() {
        const el = ensureIndicator();
        el.innerHTML = SPEAKER_SVG;
        el.style.opacity = '1';
    }

    function hideIndicator() {
        if (indicatorEl) indicatorEl.style.opacity = '0';
    }

    // ========== VOICE HELPERS ==========
    function findVoiceByName(voiceName) {
        const voices = window.speechSynthesis.getVoices();
        let voice = voices.find(v => v.name === voiceName);
        if (voice) return voice;

        const voiceMap = {
            'Microsoft Pavel - Russian (Russia)': ['Pavel', 'Russian'],
            'Microsoft Mark - English (United States)': ['Mark', 'English'],
            'Microsoft Irina - Russian (Russia)': ['Irina', 'Russian'],
            'Microsoft Zira - English (United States)': ['Zira', 'English'],
            'Microsoft David - English (United States)': ['David', 'English'],
            'tr-TR-AhmetNeural': ['Ahmet', 'Turkish'],
            'tr-TR-ElifNeural': ['Elif', 'Turkish']
        };
        const terms = voiceMap[voiceName] || [];
        for (const term of terms) {
            voice = voices.find(v => v.name.includes(term));
            if (voice) return voice;
        }

        const langMap = {
            'Microsoft Pavel - Russian (Russia)': 'ru',
            'Microsoft Irina - Russian (Russia)': 'ru',
            'Microsoft Mark - English (United States)': 'en',
            'Microsoft Zira - English (United States)': 'en',
            'Microsoft David - English (United States)': 'en',
            'tr-TR-AhmetNeural': 'tr',
            'tr-TR-ElifNeural': 'tr'
        };
        const lang = langMap[voiceName];
        if (lang) {
            voice = voices.find(v => v.lang.startsWith(lang));
            if (voice) return voice;
        }
        return voices[0] || null;
    }

    function stopAllAudio() {
        isStopped = true;
        isSpeaking = false;

        if (window.speechSynthesis && window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }
        currentUtterance = null;

        if (audioElement) {
            audioElement.pause();
            audioElement.remove();
            audioElement = null;
        }
        hideIndicator();
    }

    function speakTextDirect(text, speed = 1.0, voiceName = 'Microsoft Mark - English (United States)') {
        if (!window.speechSynthesis) return;
        if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();

        isStopped = false;
        isSpeaking = true;
        showIndicator();
        if (window.__ttsLastX != null && window.__ttsLastY != null) {
            positionIndicator(window.__ttsLastX, window.__ttsLastY);
        }

        const utterance = new SpeechSynthesisUtterance(text);

        let lang = 'en-US';
        if (voiceName.includes('English') || voiceName.startsWith('en-')) lang = 'en-US';
        else if (voiceName.includes('Turkish') || voiceName.startsWith('tr-')) lang = 'tr-TR';
        else if (voiceName.includes('Russian') || voiceName.startsWith('ru-')) lang = 'ru-RU';

        utterance.lang = lang;
        utterance.rate = Math.min(Math.max(speed, 0.5), 2.0);
        utterance.pitch = 1;
        utterance.volume = 1;

        const selectedVoice = findVoiceByName(voiceName);
        if (selectedVoice) utterance.voice = selectedVoice;

        currentUtterance = utterance;

        utterance.onend = function () {
            if (!isStopped) {
                isSpeaking = false;
                hideIndicator();
            }
            currentUtterance = null;
        };
        utterance.onerror = function () {
            if (!isStopped) {
                isSpeaking = false;
                hideIndicator();
            }
            currentUtterance = null;
        };

        window.speechSynthesis.speak(utterance);
    }

    function playAudioUrl(audioUrl) {
        if (audioElement) {
            audioElement.pause();
            audioElement.remove();
            audioElement = null;
        }

        isStopped = false;
        isSpeaking = true;
        showIndicator();
        if (window.__ttsLastX != null && window.__ttsLastY != null) {
            positionIndicator(window.__ttsLastX, window.__ttsLastY);
        }

        audioElement = document.createElement('audio');
        audioElement.src = audioUrl;
        audioElement.style.display = 'none';
        document.body.appendChild(audioElement);

        audioElement.onended = function () {
            isSpeaking = false;
            if (audioElement) { audioElement.remove(); audioElement = null; }
            hideIndicator();
        };
        audioElement.onerror = function () {
            isSpeaking = false;
            if (audioElement) { audioElement.remove(); audioElement = null; }
            hideIndicator();
        };

        audioElement.play().catch(() => {
            isSpeaking = false;
            hideIndicator();
        });
    }

    // ========== MODE ==========
    function toggleSpeechMode(active) {
        if (active !== undefined) isSpeechModeActive = active;
        else isSpeechModeActive = !isSpeechModeActive;

        if (!isSpeechModeActive) {
            if (isSpeaking) stopAllAudio();
            detachHoverListeners();
            hideIndicator();
        } else {
            attachHoverListeners();
        }

        chrome.storage.local.set({ speechModeActive: isSpeechModeActive });
    }

    function updateSpeed(speed) { currentSpeed = speed; }

    function updateVoice(voice) {
        currentVoice = voice;
        ensureHoverStyle();
    }

    // ========== MESSAGES ==========
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'playAudio') { playAudioUrl(request.audioUrl); sendResponse({ success: true }); }
        if (request.action === 'stopAudio') { stopAllAudio(); sendResponse({ success: true }); }
        if (request.action === 'toggleSpeechMode') {
            toggleSpeechMode(request.active);
            sendResponse({ success: true, active: isSpeechModeActive });
        }
        if (request.action === 'updateSpeed') { updateSpeed(request.speed); sendResponse({ success: true }); }
        if (request.action === 'updateVoice') { updateVoice(request.voice); sendResponse({ success: true }); }
        if (request.action === 'speakWebSpeech') {
            speakTextDirect(request.text, request.speed || 1.0, request.voice || currentVoice);
            sendResponse({ success: true });
        }
        if (request.action === 'stopSpeech') { stopAllAudio(); sendResponse({ success: true }); }
    });

    // ========== STORAGE SYNC ==========
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.speechVoice) updateVoice(changes.speechVoice.newValue || currentVoice);
        if (changes.speechSpeed) updateSpeed(changes.speechSpeed.newValue || currentSpeed);
        if (changes.speechModeActive) {
            const active = !!changes.speechModeActive.newValue;
            if (active !== isSpeechModeActive) toggleSpeechMode(active);
        }
    });

    // ========== INIT ==========
    function init() {
        if (isInitialized) return;
        isInitialized = true;

        if (window.speechSynthesis && window.speechSynthesis.getVoices().length === 0) {
            window.speechSynthesis.onvoiceschanged = function () {
                console.log('[TTS] Voices loaded:', window.speechSynthesis.getVoices().length);
            };
        }

        chrome.storage.local.get(['speechModeActive', 'speechSpeed', 'speechVoice'], function (result) {
            if (result.speechSpeed) currentSpeed = result.speechSpeed;
            if (result.speechVoice) currentVoice = result.speechVoice;

            ensureHoverStyle();

            if (result.speechModeActive) {
                isSpeechModeActive = true;
                attachHoverListeners();
            }
        });

        log('Content script loaded');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();