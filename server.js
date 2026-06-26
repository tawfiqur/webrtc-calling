// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Initialize Socket.io with strict proxy-aware CORS configurations
//replace example.com with your website link

const io = new Server(server, {
    cors: {
        origin: [
            "https://example.com",
            "http://example.com"
        ],
        methods: ["GET", "POST"],
        credentials: true
    },
    allowEIO3: true,
    transports: ['polling', 'websocket']
});

// Serve frontend static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

let nextClientId = 1001;
// Maps unique 4-digit Extension ID -> Socket ID
const activeUsers = new Map(); 
// Maps Socket ID -> unique 4-digit Extension ID
const socketToId = new Map();

io.on('connection', (socket) => {
    console.log(`Socket path established: temporary connection ID (${socket.id})`);

    // Assign a fresh extension number immediately on connection
    const assignedId = nextClientId.toString();
    nextClientId++;

    activeUsers.set(assignedId, socket.id);
    socketToId.set(socket.id, assignedId);

    socket.emit('assigned-id', assignedId);
    console.log(`Fresh User Authorized: Extension ${assignedId} (Socket: ${socket.id})`);

    // Handle outbound call routing initialization
    socket.on('initiate-call', ({ targetId, type }) => {
        const targetSocketId = activeUsers.get(targetId);
        const callerId = socketToId.get(socket.id);

        console.log(`Call Request: Ext. ${callerId} calling Ext. ${targetId} (${type})`);

        if (targetSocketId) {
            io.to(targetSocketId).emit('incoming-call', { from: callerId, type });
        } else {
            socket.emit('call-error', `Extension ${targetId} is not active or unavailable.`);
        }
    });

    // Forward WebRTC signaling messages (SDP Offer, Answer, ICE Candidates)
    socket.on('webrtc-signal', ({ targetId, signalData }) => {
        const targetSocketId = activeUsers.get(targetId);
        if (targetSocketId) {
            const senderId = socketToId.get(socket.id);
            io.to(targetSocketId).emit('webrtc-signal', { from: senderId, signalData });
        }
    });

    // Handle End/Reject Call notifications cleanly
    socket.on('end-call', ({ targetId }) => {
        const targetSocketId = activeUsers.get(targetId);
        if (targetSocketId) {
            io.to(targetSocketId).emit('call-ended');
        }
    });

    // Handle user disconnects and clean up maps
    socket.on('disconnect', () => {
        const assignedId = socketToId.get(socket.id);
        if (assignedId) {
            activeUsers.delete(assignedId);
            socketToId.delete(socket.id);
            console.log(`User disconnected: Extension ${assignedId}`);
        }
    });
});

// Run application on port 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(` Signaling Server successfully running on Port ${PORT}`);
    console.log(` CORS Configured for: https://example.com`);
    console.log(`===================================================`);
});
