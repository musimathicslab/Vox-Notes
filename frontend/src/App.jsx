import React from "react";
import VoiceRecorder from "./assets/VoiceRecorder";

function App() {
  return (
    <div style={{ padding: "20px", fontFamily: "Arial" }}>
      <h1>🎶 Vox To MIDI</h1>
      <p>Registra la tua voce, trasformala in un file MIDI ed editane le note</p>
      <VoiceRecorder />
    </div>
  );
}

export default App;
