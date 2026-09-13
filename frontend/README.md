# VirtualConnect

A full-stack, real-time video conferencing web app — built from scratch with WebRTC peer-to-peer video/audio, multi-user rooms, live chat, and screen sharing.

**Live demo:** https://virtualconnect-delta.vercel.app
**Note:** the backend runs on a free hosting tier and may take ~30–50 seconds to wake up on first load if it's been idle.

## Features

- Real-time peer-to-peer video and audio calling (WebRTC)
- Multi-user rooms — supports 3+ participants via a mesh peer connection architecture
- Live text chat alongside the video call
- Mute/unmute audio and turn camera on/off
- Screen sharing with automatic fallback to camera when sharing stops
- Automatic reconnect handling when a participant leaves or refreshes

## Tech Stack

**Frontend:** React, Socket.IO Client, WebRTC APIs
**Backend:** Node.js, Express, Socket.IO
**Deployment:** Vercel (frontend), Render (backend)

## How It Works

- A Socket.IO server handles **signaling** — the initial handshake where peers exchange connection info before a direct connection is established.
- Once signaling completes, browsers connect directly to each other via **WebRTC**, streaming audio/video peer-to-peer rather than routing through the server.
- For rooms with more than 2 people, the app creates a **separate peer connection for every pair of participants** (a mesh network) — each browser sends its own stream to every other participant.
- Screen sharing works by swapping the outgoing video track on every active peer connection via `RTCRtpSender.replaceTrack()`, without renegotiating the whole call.

## Running Locally

**1. Clone the repo**
```bash
git clone https://github.com/Kirankcdv/virtualconnect.git
cd virtualconnect
```

**2. Start the backend**
```bash
cd server
npm install
npm run dev
```
Runs on `http://localhost:5000`.

**3. Start the frontend** (in a separate terminal)
```bash
cd client
npm install
npm start
```
Runs on `http://localhost:3000`.

**4. Test a call**
Open `http://localhost:3000` in two or more browser tabs — they'll automatically join the same room and connect.

## Known Limitations

- The mesh network architecture (a direct peer connection between every pair of users) works well for small groups but doesn't scale efficiently past ~4–6 participants — a production version would use an SFU (Selective Forwarding Unit) like mediasoup or LiveKit to route media through a central server instead.
- Currently uses a single hardcoded room — no room creation/joining UI yet.

## License

MIT