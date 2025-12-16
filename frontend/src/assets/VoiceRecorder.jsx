import React, { useState, useRef } from "react";
import MidiEditor from "../assets/MidiEditor";

function VoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [midiFile, setMidiFile] = useState(null);
  const chunks = useRef([]);

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => {
      chunks.current.push(e.data);
    };
    recorder.onstop = async () => {
      const blob = new Blob(chunks.current, { type: "audio/wav" });
      chunks.current = [];

      const formData = new FormData();
      formData.append("file", blob, "recording.wav");

      const response = await fetch("http://localhost:8000/upload-audio/", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (data.midi_file) {
        setMidiFile(`http://localhost:8000/download-midi/${data.midi_file}`);
      }
    };

    recorder.start();
    setMediaRecorder(recorder);
    setRecording(true);
  };

  const stopRecording = () => {
    mediaRecorder.stop();
    setRecording(false);
  };

  return (
    <div>
      <button onClick={recording ? stopRecording : startRecording}>
        {recording ? "⏹️ Stop" : "🎙️ Record"}
      </button>
      {midiFile && <MidiEditor midiFileUrl={midiFile} />}
    </div>
  );
}

export default VoiceRecorder;
