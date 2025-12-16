import React, { useState, useRef } from "react";
import { VoiceRecorder } from "capacitor-voice-recorder";
import { Midi } from "@tonejs/midi";
import MidiEditor from "./MidiEditor";
import { FaMicrophone, FaStop, FaSpinner } from "react-icons/fa";
import "./App.css";


const API_URL = "http://:8000";

interface Note {
  id: string;
  midi: number;
  time: number;
  duration: number;
}

const VoiceRecorderComponent: React.FC = () => {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);

  const [initialMidiFileUrl, setInitialMidiFileUrl] = useState<string | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [newNotesForEditor, setNewNotesForEditor] = useState<Note[] | null>(null);
  const [editorKey, setEditorKey] = useState<number>(Date.now());

  const isRecordingForNewTrack = useRef(false);

  const startRecording = async () => {
    try {
      await VoiceRecorder.requestAudioRecordingPermission();
      await VoiceRecorder.startRecording();
      setRecording(true);
    } catch (err) {
      console.error("Errore avvio registrazione:", err);
      alert("Impossibile avviare la registrazione");
    }
  };

  const startInitialRecording = async () => {
    isRecordingForNewTrack.current = false;
    await startRecording();
  };

  const startNewTrackRecording = async () => {
    isRecordingForNewTrack.current = true;
    await startRecording();
  };

  const stopRecording = async () => {
    try {
      const result = await VoiceRecorder.stopRecording();
      setRecording(false);
      setProcessing(true);

      if (!result.value || !result.value.recordDataBase64){
        console.error("Nessun audio registrato");
        setProcessing(false);
        return;
      }

      const base64Data = result.value.recordDataBase64;
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "audio/wav" });
      const formData = new FormData();
      formData.append("file", blob, "recording.wav");

      const response = await fetch(`${API_URL}/upload-audio/`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      const midiFilename = data.midi_file;

      if (midiFilename) {
        const downloadUrl = `${API_URL}/download-midi/${midiFilename}`;

        if (isRecordingForNewTrack.current || !editorVisible) {
          const midiResponse = await fetch(downloadUrl);
          const arrayBuffer = await midiResponse.arrayBuffer();
          const midi = new Midi(arrayBuffer);

          if (!midi.tracks.length || !midi.tracks[0].notes.length) {
            console.error("File MIDI parsato è vuoto o non valido.");
            alert("Nessuna nota rilevata. Riprova!");
            setProcessing(false);
            return;
          }
          const track = midi.tracks[0];
          const parsedNotes: Note[] = track.notes.map((n, i) => ({
            id: `note_${Date.now()}_${i}`,
            midi: n.midi,
            time: n.time,
            duration: n.duration || 0.5,
          }));

          if (!editorVisible) {
            setInitialMidiFileUrl(downloadUrl);
            setEditorVisible(true);
            setEditorKey(Date.now());
          } else {
            setNewNotesForEditor(parsedNotes);
          }

        } else {
          setInitialMidiFileUrl(downloadUrl);
          setNewNotesForEditor(null);
          setEditorKey(Date.now());
        }
      }
    } catch (err) {
      console.error("Errore stop registrazione:", err);
      alert("Errore di connessione al server.");
    } finally {
      setProcessing(false);
    }
  };

  const handleClearNewNotes = () => {
    console.log("Genitore: Pulisco le note (l'editor le ha ricevute).");
    setNewNotesForEditor(null);
  };

  const getButtonContent = () => {
    if (processing) return { icon: <FaSpinner className="spin" size={20}/>, text: "Elaborazione..." };
    if (recording) return { icon: <FaStop size={20}/>, text: "Stop Recording" };
    return { icon: <FaMicrophone size={20}/>, text: "Record" };
  };

  const btnState = getButtonContent();

  return (
    <div style={{ padding: 16, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
        <button
          className={`main-record-btn ${recording ? 'recording' : ''}`}
          onClick={recording ? stopRecording : (processing ? undefined : startInitialRecording)}
          disabled={processing}
          style={{ opacity: processing ? 0.7 : 1 }}
        >
          {btnState.icon}
          <span style={{ marginLeft: 10 }}>{btnState.text}</span>
        </button>
      </div>

      {editorVisible && (
        <div style={{ flex: 1, marginTop: 10, animation: "fadeIn 0.5s" }}>
          <MidiEditor
            key={editorKey}
            midiFileUrl={initialMidiFileUrl}
            onStartNewTrackRecording={startNewTrackRecording}
            newlyRecordedTrack={newNotesForEditor}
            onClearNewlyRecordedTrack={handleClearNewNotes}
          />
        </div>
      )}
    </div>
  );
};

export default VoiceRecorderComponent;