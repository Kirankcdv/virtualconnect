import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";

const socket = io("http://localhost:5000");

function App() {
  const localVideoRef = useRef(null);
  
  const [roomId] = useState("test-room");

  useEffect(() => {
    socket.emit("join-room", roomId);

    socket.on("connect", () => {
      console.log("Connected to server with id:", socket.id);
    });

    return () => {
      socket.disconnect();
    };
  }, [roomId]);

  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Error accessing camera/mic:", err);
      }
    }
    startCamera();
  }, []);

  return (
    <div className="App">
      <h2>VirtualConnect</h2>
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        style={{ width: "400px", border: "2px solid #333" }}
      />
    </div>
  );
}

export default App;