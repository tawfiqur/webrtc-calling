// public/app.js
const socket = io();

const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:openrelay.metered.ca:80' },
        {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ],
    iceCandidatePoolSize: 10
};

let localStream = null;
let peerConnection = null;
let myExtensionId = null;
let activeTargetId = null;
let callType = null; // 'audio' or 'video'
let timerInterval = null;
let totalSeconds = 0;
let remoteIceCandidatesQueue = [];

// DOM Elements
const myIdDisplay = document.getElementById('my-id');
const dialDisplay = document.getElementById('dial-display');
const incomingModal = document.getElementById('incoming-modal');
const callerStatusText = document.getElementById('caller-status-text');
const ringtone = document.getElementById('ringtone-audio');

const audioCallBtn = document.getElementById('audio-call-btn');
const videoCallBtn = document.getElementById('video-call-btn');
const hangupBtn = document.getElementById('hangup-btn');

const acceptBtn = document.getElementById('accept-btn');
const rejectBtn = document.getElementById('reject-btn');

const durationBadge = document.getElementById('duration-badge');
const callDurationDisplay = document.getElementById('call-duration');

// --- APP ENTRY INITIALIZATION GATEWAY (ZERO PRIVACY SENSORS ACTIVE) ---
window.addEventListener('DOMContentLoaded', () => {
    console.log("Initializing secure signaling connection framework...");
    myIdDisplay.innerText = "Connecting...";
    myIdDisplay.classList.add('loading');

    // Request extension identity allocation instantly WITHOUT triggering hardware alerts
    socket.emit('request-fresh-id');
});

// --- Socket Handling Signals ---
socket.on('assigned-id', (id) => {
    console.log(`Successfully assigned phone line: ${id}`);
    myExtensionId = id;
    myIdDisplay.innerText = myExtensionId;
    myIdDisplay.style.color = ""; 
    myIdDisplay.classList.remove('loading');
});

socket.on('incoming-call', async ({ from, type }) => {
    activeTargetId = from;
    callType = type;
    callerStatusText.innerText = `Extension ${from} is requesting an ${type.toUpperCase()} call...`;
    incomingModal.classList.remove('hidden');
    playRingtone();
});

socket.on('webrtc-signal', async ({ from, signalData }) => {
    // If receiving an offer and peer connection is not yet initialized, set up constraints reactively
    if (!peerConnection) {
        await setupPeerConnection(callType, false);
    }

    if (signalData.sdp) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
        if (signalData.sdp.type === 'offer') {
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('webrtc-signal', { targetId: activeTargetId, signalData: { sdp: peerConnection.localDescription } });
        }
        processQueuedCandidates();
    } else if (signalData.ice) {
        if (!peerConnection || !peerConnection.remoteDescription) {
            remoteIceCandidatesQueue.push(signalData.ice);
        } else {
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(signalData.ice));
            } catch (e) { console.error("Error inserting ice node:", e); }
        }
    }
});

async function processQueuedCandidates() {
    while (remoteIceCandidatesQueue.length > 0) {
        const candidate = remoteIceCandidatesQueue.shift();
        try { await peerConnection.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) {}
    }
}

// Synchronized Instant Teardown Handler for User B
socket.on('call-ended', () => { 
    console.log("Inbound termination event captured. Triggering immediate local hardware shutdown.");
    resetUIState(); 
});

socket.on('call-error', (msg) => { alert(msg); resetUIState(); });

// --- Interface Input Utilities ---
function pressKey(num) { if (dialDisplay.value.length < 4) dialDisplay.value += num; }
function clearDisplay() { dialDisplay.value = ''; }
function backspaceDisplay() { dialDisplay.value = dialDisplay.value.slice(0, -1); }

function playRingtone() { ringtone.play().catch(() => {}); }
function stopRingtone() { ringtone.pause(); ringtone.currentTime = 0; }

// --- Duration Tracking Utilities ---
function startCallTimer() {
    if (timerInterval) clearInterval(timerInterval); 
    totalSeconds = 0;
    callDurationDisplay.innerText = "00:00";
    if (durationBadge) durationBadge.classList.remove('hidden');
    
    timerInterval = setInterval(() => {
        totalSeconds++;
        const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
        const seconds = String(totalSeconds % 60).padStart(2, '0');
        callDurationDisplay.innerText = `${minutes}:${seconds}`;
    }, 1000);
}

function stopCallTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    if (durationBadge) durationBadge.classList.add('hidden');
}

// --- Calling Core Controllers ---
async function startCall(type) {
    const targetId = dialDisplay.value;
    if (targetId.length !== 4 || !targetId.startsWith('1')) {
        alert("Invalid target: Dial a 4-digit extension beginning with 1.");
        return;
    }
    if (targetId === myExtensionId) {
        alert("You cannot call your own extension.");
        return;
    }
    activeTargetId = targetId;
    callType = type;
    toggleCallInterfaceUI(true);
    await setupPeerConnection(type, true);
}

async function setupPeerConnection(type, isCaller) {
    try {
        // Enforce specific media parameters strictly on-demand
        const constraints = { 
            audio: true, 
            video: (type === 'video') 
        };
        
        console.log("Activating required physical hardware sensors directly:", constraints);
        localStream = await navigator.mediaDevices.getUserMedia(constraints);

        // Bind local tracking node only if video processing track is active
        if (type === 'video') {
            document.getElementById('local-video').srcObject = localStream;
        }

        peerConnection = new RTCPeerConnection(rtcConfig);
        
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        peerConnection.ontrack = (event) => {
            const remoteVideo = document.getElementById('remote-video');
            if (remoteVideo && remoteVideo.srcObject !== event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
            }
        };

        peerConnection.onconnectionstatechange = () => {
            if (peerConnection.connectionState === "connected") {
                startCallTimer();
            } else if (["disconnected", "failed", "closed"].includes(peerConnection.connectionState)) {
                resetUIState();
            }
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('webrtc-signal', { targetId: activeTargetId, signalData: { ice: event.candidate } });
            }
        };

        if (isCaller) {
            socket.emit('initiate-call', { targetId: activeTargetId, type });
            const offer = await peerConnection.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: (type === 'video') });
            await peerConnection.setLocalDescription(offer);
            socket.emit('webrtc-signal', { targetId: activeTargetId, signalData: { sdp: peerConnection.localDescription } });
        }
    } catch (err) {
        alert(`Hardware access block error: ${err.message}`);
        resetUIState();
    }
}

function toggleCallInterfaceUI(isCallActive) {
    if (isCallActive) {
        audioCallBtn.classList.add('hidden');
        videoCallBtn.classList.add('hidden');
        hangupBtn.classList.remove('hidden');
    } else {
        audioCallBtn.classList.remove('hidden');
        videoCallBtn.classList.remove('hidden');
        hangupBtn.classList.add('hidden');
    }
}

// --- ABSOLUTE ZERO PERMISSION HARD CUTOFF LIFE CYCLE METHOD ---
function resetUIState() {
    console.log("Executing absolute hardware shutdown sequence...");
    stopRingtone();
    stopCallTimer();
    incomingModal.classList.add('hidden');
    toggleCallInterfaceUI(false);
    remoteIceCandidatesQueue = [];

    // 1. Terminate all physical tracking lines bound to the active local session stream
    if (localStream) {
        localStream.getTracks().forEach(track => {
            track.stop();
            console.log(`Stopped physical track: ${track.kind}`);
        });
        localStream = null;
    }

    // 2. Tear down tracks on WebRTC connection lines explicitly
    if (peerConnection) {
        peerConnection.getSenders().forEach(sender => {
            if (sender.track) sender.track.stop();
        });
        peerConnection.getReceivers().forEach(receiver => {
            if (receiver.track) receiver.track.stop();
        });

        peerConnection.onicecandidate = null;
        peerConnection.ontrack = null;
        peerConnection.onconnectionstatechange = null;
        peerConnection.close();
        peerConnection = null;
    }

    // 3. Clear video element pointers to break active memory links
    const remoteVideo = document.getElementById('remote-video');
    const localVideo = document.getElementById('local-video');
    if (remoteVideo) remoteVideo.srcObject = null;
    if (localVideo) localVideo.srcObject = null;

    activeTargetId = null;
    callType = null;
    console.log("Hardware fully disconnected. App returned to dormant mode.");
}

function hangUp() {
    if (activeTargetId) {
        socket.emit('end-call', { targetId: activeTargetId });
    }
    resetUIState();
}

acceptBtn.addEventListener('click', async () => {
    stopRingtone();
    incomingModal.classList.add('hidden');
    toggleCallInterfaceUI(true);
    await setupPeerConnection(callType, false);
});

rejectBtn.addEventListener('click', () => {
    socket.emit('end-call', { targetId: activeTargetId });
    resetUIState();
});
