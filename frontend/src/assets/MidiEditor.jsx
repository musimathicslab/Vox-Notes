import React, { useState, useEffect, useRef } from "react";
import { Stage, Layer, Rect, Line, Text } from "react-konva";
import { Midi } from "@tonejs/midi";
import * as Tone from "tone";

const NOTE_HEIGHT = 14;
const DEFAULT_PPS = 120;
const HANDLE_WIDTH = 6;
const MIN_DURATION = 0.05;

export default function MidiEditor({ midiFileUrl }) {
  const [notes, setNotes] = useState([]);
  const [pps, setPps] = useState(DEFAULT_PPS);
  const [minPitch, setMinPitch] = useState(48);
  const [maxPitch, setMaxPitch] = useState(84);
  const [isPlaying, setIsPlaying] = useState(false);
  const stageRef = useRef(null);
  const synthRef = useRef(null);
  const lastClickRef = useRef({ id: null, time: 0 });
  const timeoutsRef = useRef([]);
  const [playhead, setPlayhead] = useState(0);
  const [resumeTime, setResumeTime] = useState(0);
  const playheadRef = useRef(null);


  useEffect(() => {
    if (!midiFileUrl) return;
    (async () => {
      try {
        const res = await fetch(midiFileUrl);
        const buf = await res.arrayBuffer();
        const midi = new Midi(buf);
        const track = midi.tracks[0] || { notes: [] };
        const loaded = track.notes.map((n, i) => ({
          id: `${Date.now()}_${i}`,
          midi: n.midi,
          time: n.time,
          duration: n.duration || 0.5,
          playing: false,
        }));
        setNotes(loaded);
      } catch (err) {
        console.error("Errore loading MIDI:", err);
      }
    })();
  }, [midiFileUrl]);


  useEffect(() => {
    synthRef.current = new Tone.PolySynth(Tone.Synth).toDestination();
    return () => {
      try { synthRef.current.disconnect(); } catch {}
    };
  }, []);


  const clearScheduled = () => {
    timeoutsRef.current.forEach((t) => clearTimeout(t));
    timeoutsRef.current = [];
    setNotes((prev) => prev.map(n => ({ ...n, playing: false })));
  };


  const handlePlay = async () => {
  if (!notes.length) return;
  await Tone.start();
  clearScheduled();
  setIsPlaying(true);

  const offset = resumeTime;
  startPlayhead();

  notes.forEach((n) => {
    const when = Tone.now() + (n.time - offset);
    if (n.time >= offset) {
      synthRef.current.triggerAttackRelease(
        Tone.Frequency(n.midi, "midi"),
        n.duration,
        when
      );

      const tOn = setTimeout(() => {
        setNotes((prev) => prev.map(p => p.id === n.id ? { ...p, playing: true } : p));
      }, (n.time - offset) * 1000);

      const tOff = setTimeout(() => {
        setNotes((prev) => prev.map(p => p.id === n.id ? { ...p, playing: false } : p));
      }, (n.time - offset + n.duration) * 1000);

      timeoutsRef.current.push(tOn, tOff);
    }
  });

  const lastEnd = Math.max(...notes.map(n => n.time + n.duration));
  const endTimeout = setTimeout(() => {
    handleStop();
    setResumeTime(0);
    setPlayhead(0);
  }, (lastEnd - offset) * 1000 + 200);
  timeoutsRef.current.push(endTimeout);
  };

  const startPlayhead = () => {
    const start = Date.now();
    playheadRef.current = setInterval(() => {
      setPlayhead(((Date.now() - start) / 1000) + resumeTime);
    }, 30);
  };

  const stopPlayhead = () => {
    clearInterval(playheadRef.current);
    playheadRef.current = null;
  };

  const handleStop = () => {
    if (synthRef.current) {
      synthRef.current.releaseAll();
    }
    clearScheduled();
    stopPlayhead();
    setIsPlaying(false);
    setResumeTime(playhead);
  };


  const handleResume = () => {
    if (!isPlaying) {
      handlePlay();
    }
  };


  const handleStageClick = (e) => {
    const evtTarget = e.target;
    if (evtTarget !== stageRef.current) {
      if (e.target.getClassName && e.target.getClassName() !== "Stage") {
        return;
      }
    }

    const stage = stageRef.current.getStage();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const pitch = Math.max(minPitch, Math.min(maxPitch, maxPitch - Math.floor(pointer.y / NOTE_HEIGHT)));
    const time = Math.max(0, pointer.x / pps);

    const newNote = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
      midi: pitch,
      time,
      duration: 0.5,
      playing: false,
    };
    setNotes(prev => [...prev, newNote]);
  };

  const handleNoteMouseDown = (noteId) => {
    const now = Date.now();
    const last = lastClickRef.current;
    if (last.id === noteId && (now - last.time) < 350) {
      setNotes(prev => prev.filter(n => n.id !== noteId));
      lastClickRef.current = { id: null, time: 0 };
      return;
    }
    lastClickRef.current = { id: noteId, time: now };
  };

  const onNoteDragEnd = (idx, e) => {
    const newX = e.target.x();
    const newY = e.target.y();
    const updated = [...notes];
    const newTime = Math.max(0, newX / pps);
    const newMidi = Math.max(minPitch, Math.min(maxPitch, maxPitch - Math.floor(newY / NOTE_HEIGHT)));
    updated[idx] = { ...updated[idx], time: newTime, midi: newMidi };
    setNotes(updated);
  };

  const onHandleDragEnd = (idx, e) => {
    const handleX = e.target.x(); // absolute x
    const updated = [...notes];
    const note = updated[idx];
    const noteStartX = note.time * pps;
    const newDuration = Math.max(MIN_DURATION, (handleX - noteStartX) / pps);
    updated[idx] = { ...note, duration: newDuration };
    setNotes(updated);
  };

  const handleExport = (uploadToServer = false) => {
    const midi = new Midi();
    const track = midi.addTrack();
    notes.forEach(n => {
      track.addNote({
        midi: n.midi,
        time: n.time,
        duration: n.duration,
      });
    });

    const bytes = midi.toArray();
    const blob = new Blob([bytes], { type: "audio/midi" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "edited.mid";
    a.click();

    if (uploadToServer) {
      const form = new FormData();
      form.append("file", new File([blob], "edited.mid"));
      fetch("http://localhost:8000/save-midi/", { method: "POST", body: form })
        .then(res => res.json())
        .then(data => {
          if (data.midi_file) alert(`Saved on server as ${data.midi_file}`);
          else console.error(data);
        })
        .catch(err => console.error("Upload error:", err));
    }
  };

  const canvasWidth = Math.max(800, (Math.max(0, ...notes.map(n => n.time + n.duration)) * pps) + 200);
  const canvasHeight = (maxPitch - minPitch + 1) * NOTE_HEIGHT;

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{display: "flex", gap: 12, alignItems: "center", marginBottom: 8}}>
        <button onClick={isPlaying ? handleStop : handlePlay} style={{padding: "8px 12px"}}>
          {isPlaying ? "⏹ Stop" : "▶️ Play"}
        </button>

        <button onClick={handleResume} disabled={isPlaying} style={{padding: "8px 12px"}}>
          ⏯ Resume
        </button>

        <button onClick={() => handleExport(false)} style={{padding: "8px 12px"}}>
          💾 Save .mid
        </button>

        <label style={{marginLeft: 12, flex: 1}}>
          Posizione:
          <input
              type="range"
              min="0"
              max={Math.max(0, ...notes.map(n => n.time + n.duration))}
              step="0.01"
              value={playhead}
              onChange={(e) => {
                const newTime = parseFloat(e.target.value);
                setPlayhead(newTime);
                setResumeTime(newTime);
                clearScheduled(); // reset evidenziazione note
                setNotes((prev) => prev.map(n => ({...n, playing: false})));

                if (isPlaying) {
                  handleStop();
                  setTimeout(() => handlePlay(), 100); // riparte dal nuovo punto
                }
              }}
              style={{width: "100%", marginLeft: 8}}
          />
          <span style={{marginLeft: 6}}>{playhead.toFixed(2)}s</span>
        </label>


        <label style={{marginLeft: 12}}>
          Zoom (px/s)
          <input
              type="range"
              min="40"
              max="300"
              value={pps}
              onChange={(e) => setPps(Number(e.target.value))}
              style={{marginLeft: 8}}
          />
          <span style={{marginLeft: 6}}>{pps}</span>
        </label>

        <label style={{marginLeft: 12}}>
          Pitch range:
          <input
              type="number"
              value={minPitch}
              onChange={(e) => setMinPitch(Number(e.target.value))}
              style={{width: 60, marginLeft: 8}}
          />
          —
          <input
              type="number"
              value={maxPitch}
              onChange={(e) => setMaxPitch(Number(e.target.value))}
              style={{width: 60, marginLeft: 6}}
          />
        </label>
      </div>

      <div style={{border: "1px solid #ccc", borderRadius: 6, overflow: "auto"}}>
        <Stage
            width={Math.min(window.innerWidth - 40, canvasWidth)}
            height={Math.min(600, canvasHeight)}
            onMouseDown={handleStageClick}
            ref={stageRef}
        >
          <Layer>
            {Array.from({length: Math.ceil((canvasWidth / pps) * 4) + 1}).map((_, i) => {
              const x = (i * 0.25) * pps;
              return (
                  <Line
                      key={`v-${i}`}
                      points={[x, 0, x, canvasHeight]}
                      stroke={i % 4 === 0 ? "#ccc" : "#eee"}
                      strokeWidth={i % 4 === 0 ? 1.2 : 0.6}
                />
              );
            })}


            <Line
              points={[playhead * pps, 0, playhead * pps, canvasHeight]}
              stroke="red"
              strokeWidth={2}
            />

            {Array.from({ length: maxPitch - minPitch + 1 }).map((_, row) => {
              const y = row * NOTE_HEIGHT;
              const pitch = maxPitch - row;
              return (
                <React.Fragment key={`row-${row}`}>
                  <Line points={[0, y, canvasWidth, y]} stroke={pitch % 12 === 0 ? "#d0d0d0" : "#f4f4f4"} />
                  { (row % 12 === 0) && (
                    <Text x={4} y={y+1} text={`${pitch}`} fontSize={10} fill="#999" />
                  )}
                </React.Fragment>
              );
            })}

            {notes.map((note, idx) => {
              const noteY = (maxPitch - note.midi) * NOTE_HEIGHT;
              const noteX = note.time * pps;
              const noteW = Math.max(4, note.duration * pps);
              const fill = note.playing ? "#ff8c42" : "#2196f3";
              return (
                <React.Fragment key={note.id}>
                  <Rect
                    x={noteX}
                    y={noteY}
                    width={noteW}
                    height={NOTE_HEIGHT - 1}
                    fill={fill}
                    cornerRadius={3}
                    draggable
                    onMouseDown={() => handleNoteMouseDown(note.id)}
                    onDragEnd={(e) => onNoteDragEnd(idx, e)}
                    onDragMove={(e) => {
                      const newY = Math.max(0, Math.min(canvasHeight - NOTE_HEIGHT, e.target.y()));
                      const newX = Math.max(0, e.target.x());
                      e.target.y(newY);
                      e.target.x(newX);
                    }}
                  />

                  <Rect
                    x={noteX + noteW - HANDLE_WIDTH / 2}
                    y={noteY}
                    width={HANDLE_WIDTH}
                    height={NOTE_HEIGHT - 1}
                    fill="#333"
                    cornerRadius={2}
                    draggable
                    dragBoundFunc={(pos) => {
                      const x = Math.max(noteX + MIN_DURATION * pps, pos.x);
                      return { x, y: noteY };
                    }}
                    onDragEnd={(e) => onHandleDragEnd(idx, e)}
                  />
                </React.Fragment>
              );
            })}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
