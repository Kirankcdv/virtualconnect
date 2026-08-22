import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";

const socket = io(process.env.REACT_APP_SERVER_URL || "http://localhost:5000");

function App() {
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const cameraTrackRef = useRef(null); // keep original camera track to restore later
  const peersRef = useRef({});
  const pendingCandidatesRef = useRef({});
  const chatEndRef = useRef(null);

  const [roomId] = useState("test-room");
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [remoteStreams, setRemoteStreams] = useState({});

  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        localStreamRef.current = stream;
        cameraTrackRef.current = stream.getVideoTracks()[0];
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
      peersRef.current[otherUserId] = pc;

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("offer", { target: otherUserId, offer });
    });

    socket.on("offer", async ({ from, offer }) => {
      console.log("Received offer from:", from);
      const pc = createPeerConnection(from);
      peersRef.current[from] = pc;

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await flushPendingCandidates(from, pc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("answer", { target: from, answer });
    });

    socket.on("answer", async ({ from, answer }) => {
      console.log("Received answer from:", from);
      const pc = peersRef.current[from];
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        await flushPendingCandidates(from, pc);
      }
    });

    socket.on("ice-candidate", async ({ from, candidate }) => {
      const pc = peersRef.current[from];
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error("Error adding ICE candidate:", err);
        }
      } else {
        if (!pendingCandidatesRef.current[from]) {
          pendingCandidatesRef.current[from] = [];
        }
        pendingCandidatesRef.current[from].push(candidate);
      }
    });

    socket.on("user-left", (id) => {
      console.log("User left:", id);
      if (peersRef.current[id]) {
        peersRef.current[id].close();
        delete peersRef.current[id];
      }
      delete pendingCandidatesRef.current[id];
      setRemoteStreams((prev) => {
        const updated = { ...prev };
        delete updated[id];
        return updated;
      });
    });

    socket.on("chat-message", ({ from, message }) => {
      setMessages((prev) => [...prev, { from: "them", text: message }]);
    });

    return () => {
      socket.off("connect");
      socket.off("user-joined");
      socket.off("offer");
      socket.off("answer");
      socket.off("ice-candidate");
      socket.off("user-left");
      socket.off("chat-message");
    };
  }, [roomId]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  async function flushPendingCandidates(peerId, pc) {
    const queued = pendingCandidatesRef.current[peerId] || [];
    while (queued.length > 0) {
      const candidate = queued.shift();
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
      setRemoteStreams((prev) => ({
        ...prev,
        [otherUserId]: event.streams[0],
      }));
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
      track.enabled = isMuted;
    });
    setIsMuted(!isMuted);
  }

  function toggleCamera() {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((track) => {
      track.enabled = isCameraOff;
    });
    setIsCameraOff(!isCameraOff);
  }

  // Swap the video track on every active peer connection
  function replaceVideoTrackEverywhere(newTrack) {
    Object.values(peersRef.current).forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
      if (sender) {
        sender.replaceTrack(newTrack);
      }
    });
  }

  async function startScreenShare() {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      const screenTrack = screenStream.getVideoTracks()[0];

      replaceVideoTrackEverywhere(screenTrack);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = screenStream;
      }

      setIsScreenSharing(true);

      // When the user clicks the browser's built-in "Stop sharing" button
      screenTrack.onended = () => {
        stopScreenShare();
      };
    } catch (err) {
      console.error("Error starting screen share:", err);
    }
  }

  function stopScreenShare() {
    const cameraTrack = cameraTrackRef.current;
    if (cameraTrack) {
      replaceVideoTrackEverywhere(cameraTrack);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
    }
    setIsScreenSharing(false);
  }

  function toggleScreenShare() {
    if (isScreenSharing) {
      stopScreenShare();
    } else {
      startScreenShare();
    }
  }

  function sendMessage() {
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    socket.emit("chat-message", { roomId, message: trimmed });
    setMessages((prev) => [...prev, { from: "me", text: trimmed }]);
    setChatInput("");
  }

  function handleChatKeyDown(e) {
    if (e.key === "Enter") {
      sendMessage();
    }
  }

  return (
    <div className="App">
      <h2>VirtualConnect</h2>
      <div style={{ display: "flex", gap: "20px", justifyContent: "center", flexWrap: "wrap" }}>
        <div>
          <p>You {isScreenSharing ? "(sharing screen)" : ""}</p>
          <video
  autoPlay
  playsInline
  style={{ width: "300px", border: "2px solid #333" }}
  ref={(el) => {
    if (el && el.srcObject !== stream) {
      el.srcObject = stream;
      el.play().catch((err) => {
        console.warn("Autoplay with sound blocked, click the video to enable audio:", err);
      });
    }
  }}
/>
        </div>

        {Object.entries(remoteStreams).map(([peerId, stream]) => (
          <div key={peerId}>
            <p>{peerId.slice(0, 6)}</p>
            <video
              autoPlay
              playsInline
              muted
              style={{ width: "300px", border: "2px solid #333" }}
              ref={(el) => {
                if (el) el.srcObject = stream;
              }}
            />
          </div>
        ))}

        <div
          style={{
            width: "250px",
            height: "340px",
            border: "2px solid #333",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <p style={{ margin: "8px" }}>Chat</p>
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "8px",
              borderTop: "1px solid #ccc",
              borderBottom: "1px solid #ccc",
            }}
          >
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  textAlign: msg.from === "me" ? "right" : "left",
                  margin: "4px 0",
                }}
              >
                <span
                  style={{
                    background: msg.from === "me" ? "#daf1da" : "#eee",
                    padding: "4px 8px",
                    borderRadius: "8px",
                    display: "inline-block",
                  }}
                >
                  {msg.text}
                </span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div style={{ display: "flex", padding: "8px" }}>
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleChatKeyDown}
              placeholder="Type a message..."
              style={{ flex: 1, padding: "6px" }}
            />
            <button onClick={sendMessage} style={{ marginLeft: "6px" }}>
              Send
            </button>
          </div>
        </div>
      </div>

      <div style={{ marginTop: "15px" }}>
        <button onClick={toggleMute} style={{ marginRight: "10px", padding: "8px 16px" }}>
          {isMuted ? "Unmute" : "Mute"}
        </button>
        <button onClick={toggleCamera} style={{ marginRight: "10px", padding: "8px 16px" }}>
          {isCameraOff ? "Turn Camera On" : "Turn Camera Off"}
        </button>
        <button onClick={toggleScreenShare} style={{ padding: "8px 16px" }}>
          {isScreenSharing ? "Stop Sharing" : "Share Screen"}
        </button>
      </div>
    </div>
  );
}

export default App;