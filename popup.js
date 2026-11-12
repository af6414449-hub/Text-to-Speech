// popup.js
document.addEventListener('DOMContentLoaded', function () {
    try {
        const toggleSwitch = document.getElementById('toggleSwitch');
        const statusText = document.getElementById('statusText');
        const speedSlider = document.getElementById('speedSlider');
        const langBtns = document.querySelectorAll('.lang-btn');

        const DEFAULT_VOICE = 'Microsoft Mark - English (United States)';
        const DEFAULT_SPEED = 1.0;

        const VOICE_COLORS = {
            'Microsoft Mark - English (United States)': '#c2410c',
            'Microsoft Pavel - Russian (Russia)':       '#1e3a8a',
            'tr-TR-AhmetNeural':                         '#b03052'
        };

        function applyAccent(voice) {
            const color = VOICE_COLORS[voice] || VOICE_COLORS[DEFAULT_VOICE];
            document.body.style.setProperty('--accent', color);
        }

        function sendToTab(tabId, message) {
            if (!tabId) return;
            try {
                chrome.tabs.sendMessage(tabId, message, () => { void chrome.runtime.lastError; });
            } catch (e) {}
        }

        function queryActiveTab(cb) {
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                cb(tabs && tabs[0] ? tabs[0] : null);
            });
        }

        function snapSpeed(v) {
            const n = Number(v);
            if (!isFinite(n)) return DEFAULT_SPEED;
            const min = 0.5, max = 2.0, step = 0.25;
            const clamped = Math.min(Math.max(n, min), max);
            return Math.round(clamped / step) * step;
        }

        chrome.storage.local.get(['speechModeActive', 'speechSpeed', 'speechVoice'], function (result) {
            const isActive = result.speechModeActive || false;
            const speed = snapSpeed(typeof result.speechSpeed === 'number' ? result.speechSpeed : DEFAULT_SPEED);
            const voice = result.speechVoice || DEFAULT_VOICE;

            toggleSwitch.checked = isActive;
            updateStatus(isActive);

            speedSlider.value = String(speed);

            updateLangButtons(voice);
            applyAccent(voice);

            if (!result.speechVoice) chrome.storage.local.set({ speechVoice: DEFAULT_VOICE });
            if (typeof result.speechSpeed !== 'number' || snapSpeed(result.speechSpeed) !== result.speechSpeed) {
                chrome.storage.local.set({ speechSpeed: speed });
            }
        });

        function updateStatus(isActive) {
            statusText.textContent = isActive ? 'On' : 'Off';
            statusText.className = 'status ' + (isActive ? 'active' : 'inactive');
        }

        function updateLangButtons(voice) {
            langBtns.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.voice === voice);
            });
        }

        toggleSwitch.addEventListener('change', function () {
            const isActive = this.checked;
            updateStatus(isActive);
            chrome.storage.local.set({ speechModeActive: isActive });
            queryActiveTab(tab => {
                if (tab) sendToTab(tab.id, { action: 'toggleSpeechMode', active: isActive });
            });
        });

        speedSlider.addEventListener('input', function () {
            const speed = snapSpeed(parseFloat(this.value));
            chrome.storage.local.set({ speechSpeed: speed });
            queryActiveTab(tab => {
                if (tab) sendToTab(tab.id, { action: 'updateSpeed', speed });
            });
        });

        langBtns.forEach(btn => {
            btn.addEventListener('click', function () {
                const voice = this.dataset.voice;
                langBtns.forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                applyAccent(voice);
                chrome.storage.local.set({ speechVoice: voice });
                queryActiveTab(tab => {
                    if (tab) sendToTab(tab.id, { action: 'updateVoice', voice });
                });
            });
        });
    } catch (e) {
        console.error('Popup init error:', e);
    }
});