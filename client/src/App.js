import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";

const socket = io("http://localhost:5000");

function App() {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const pendingCandidatesRef = useRef([]);

  const [roomId] = useState("test-room");
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        socket.emit("join-room", roomId);
      } catch (err) {
        console.error("Error accessing camera/mic:", err);
      }
    }
    startCamera();
  }, [roomId]);

  useEffect(() => {
    socket.on("connect", () => {
      console.log("Connected to server with id:", socket.id);
    });

    socket.on("user-joined", async (otherUserId) => {
      console.log("User joined:", otherUserId);
      const pc = createPeerConnection(otherUserId);
      peerConnectionRef.current = pc;

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("offer", { target: otherUserId, offer });
    });

    socket.on("offer", async ({ from, offer }) => {
      console.log("Received offer from:", from);
      const pc = createPeerConnection(from);
      peerConnectionRef.current = pc;

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await flushPendingCandidates(pc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("answer", { target: from, answer });
    });

    socket.on("answer", async ({ from, answer }) => {
      console.log("Received answer from:", from);
      const pc = peerConnectionRef.current;
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        await flushPendingCandidates(pc);
      }
    });

    socket.on("ice-candidate", async ({ from, candidate }) => {
      const pc = peerConnectionRef.current;
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error("Error adding ICE candidate:", err);
        }
      } else {
        pendingCandidatesRef.current.push(candidate);
      }
    });

    socket.on("user-left", (id) => {
      console.log("User left:", id);
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      pendingCandidatesRef.current = [];
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
    });

    return () => {
      socket.off("connect");
      socket.off("user-joined");
      socket.off("offer");
      socket.off("answer");
      socket.off("ice-candidate");
      socket.off("user-left");
    };
  }, [roomId]);

  async function flushPendingCandidates(pc) {
    while (pendingCandidatesRef.current.length > 0) {
      const candidate = pendingCandidatesRef.current.shift();
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("Error flushing ICE candidate:", err);
      }
    }
  }

  function createPeerConnection(otherUserId) {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", {
          target: otherUserId,
          candidate: event.candidate,
        });
      }
    };

    return pc;
  }

  function toggleMute() {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = isMuted; // flips current state
    });
    setIsMuted(!isMuted);
  }

  function toggleCamera() {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((track) => {
      track.enabled = isCameraOff; // flips current state
    });
    setIsCameraOff(!isCameraOff);
  }

  return (
    <div className="App">
      <h2>VirtualConnect</h2>
      <div style={{ display: "flex", gap: "20px", justifyContent: "center" }}>
        <div>
          <p>You</p>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{ width: "400px", border: "2px solid #333" }}
          />
        </div>
        <div>
          <p>Remote</p>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            muted
            style={{ width: "400px", border: "2px solid #333" }}
          />
        </div>
      </div>

      <div style={{ marginTop: "15px" }}>
        <button onClick={toggleMute} style={{ marginRight: "10px", padding: "8px 16px" }}>
          {isMuted ? "Unmute" : "Mute"}
        </button>
        <button onClick={toggleCamera} style={{ padding: "8px 16px" }}>
          {isCameraOff ? "Turn Camera On" : "Turn Camera Off"}
        </button>
      </div>
    </div>
  );
}

export default App;