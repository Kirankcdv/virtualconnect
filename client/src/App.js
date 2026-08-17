import { useEffect, useRef } from "react";
import "./App.css";

function App() {
  const localVideoRef = useRef(null);

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