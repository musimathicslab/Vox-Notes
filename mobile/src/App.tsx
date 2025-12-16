import React from "react";
import VoiceRecorder from "./components/VoiceRecorder";

function App() {
  return (
    <div className="app-container" style={{ fontFamily: "Montserrat, sans-serif", padding: 20, backgroundColor :"#121212", color: "#e0e0e0", minHeight: "100vh" }}>
      <h1 style={{
          textAlign: "center",
          fontWeight: 800,
          letterSpacing: "-1px",
          background: "linear-gradient(90deg, #00e5ff, #ff00ff)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent"
      }}>🎶 Vox To MIDI</h1>
        <p style={{textAlign: "center", marginBottom: 20}}>
            Registra la tua voce e trasformala in un file MIDI
        </p>
        <VoiceRecorder/>
    </div>
  );
}

export default App;
