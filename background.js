// background.js
let currentAudioUrl = null;
let isPlaying = false;

const DEFAULT_VOICE = 'Microsoft Mark - English (United States)';

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'speakSelection',
        title: 'Speak selection',
        contexts: ['selection']
    });
});

function safeSend(tabId, message) {
    if (!tabId) return;
    try {
        chrome.tabs.sendMessage(tabId, message, () => { void chrome.runtime.lastError; });
    } catch (e) {}
}

async function generateSpeech(text, voice = DEFAULT_VOICE) {
    try {
        const escapedText = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');

        let lang = 'en-US';
        if (voice.startsWith('ru-RU') || voice.includes('Russian')) lang = 'ru-RU';
        else if (voice.startsWith('tr-TR') || voice.includes('Turkish')) lang = 'tr-TR';
        else if (voice.startsWith('en-US') || voice.includes('English')) lang = 'en-US';

        const edgeVoiceMap = {
            'Microsoft Mark - English (United States)': 'en-US-GuyNeural',
            'Microsoft Zira - English (United States)': 'en-US-JennyNeural',
            'Microsoft David - English (United States)': 'en-US-DavisNeural',
            'Microsoft Pavel - Russian (Russia)': 'ru-RU-DmitryNeural',
            'Microsoft Irina - Russian (Russia)': 'ru-RU-SvetlanaNeural',
            'tr-TR-AhmetNeural': 'tr-TR-AhmetNeural',
            'tr-TR-ElifNeural': 'tr-TR-EmelNeural'
        };

        const voiceName = edgeVoiceMap[voice] || edgeVoiceMap[DEFAULT_VOICE];

        const ssml = `<?xml version="1.0" encoding="UTF-8"?>
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="${lang}">
    <voice name="${voiceName}">
        <prosody rate="0.9" pitch="0%">
            ${escapedText}
        </prosody>
    </voice>
</speak>`;

        console.log('Sending SSML to Edge TTS, voice:', voiceName);

        const requestId = crypto.randomUUID();
        const timestamp = new Date().toISOString().replace(/[:-]/g, '').slice(0, 17);

        const response = await fetch('https://speech.platform.bing.com/consumer/speech/synthesize/readaloud', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/ssml+xml',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
                'X-RequestId': requestId,
                'X-Timestamp': timestamp,
                'Accept': 'audio/mpeg'
            },
            body: ssml
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Edge TTS error:', response.status, errorText);
            throw new Error(`HTTP ${response.status}`);
        }

        const audioBlob = await response.blob();
        console.log('Edge TTS audio generated, size:', audioBlob.size);
        return URL.createObjectURL(audioBlob);
    } catch (error) {
        console.error('Edge TTS exception:', error.message);
        return null;
    }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== 'speakSelection') return;

    const selectedText = info.selectionText;
    if (!selectedText || selectedText.length < 2) return;

    const tabId = tab ? tab.id : null;

    chrome.storage.local.get(['speechVoice', 'speechSpeed'], function (settings) {
        const voice = settings.speechVoice || DEFAULT_VOICE;
        const speed = settings.speechSpeed || 1.0;

        console.log('Context menu, text:', selectedText.substring(0, 50) + '...');

        generateSpeech(selectedText, voice).then(audioUrl => {
            if (audioUrl) {
                isPlaying = true;
                if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
                currentAudioUrl = audioUrl;
                safeSend(tabId, { action: 'playAudio', audioUrl });
            } else {
                safeSend(tabId, {
                    action: 'speakWebSpeech',
                    text: selectedText,
                    voice,
                    speed
                });
            }
        });
    });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background received:', request.action);

    if (request.action === 'speakEdgeTTS') {
        const tabId = sender.tab ? sender.tab.id : request.tabId;
        const voice = request.voice || DEFAULT_VOICE;

        generateSpeech(request.text, voice).then(audioUrl => {
            if (audioUrl) {
                isPlaying = true;
                if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
                currentAudioUrl = audioUrl;
                safeSend(tabId, { action: 'playAudio', audioUrl });
                sendResponse({ success: true });
            } else {
                sendResponse({ success: false, error: 'Edge TTS failed' });
            }
        });
        return true;
    }

    if (request.action === 'stopSpeech') {
        if (currentAudioUrl) {
            URL.revokeObjectURL(currentAudioUrl);
            currentAudioUrl = null;
        }
        isPlaying = false;
        const tabId = sender.tab ? sender.tab.id : request.tabId;
        safeSend(tabId, { action: 'stopAudio' });
        sendResponse({ success: true });
    }
});

console.log('Background service worker loaded');