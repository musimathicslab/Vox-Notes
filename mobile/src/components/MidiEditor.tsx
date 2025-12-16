import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Group, Layer, Line, Rect, Stage, Text} from "react-konva";
import type {KonvaEventObject} from "konva/lib/Node";
import type Konva from "konva";
import {Midi} from "@tonejs/midi";
import Soundfont from "soundfont-player";
import {Directory, Filesystem} from '@capacitor/filesystem';
import {
    FaArrowDown,
    FaArrowUp,
    FaCircle,
    FaDownload,
    FaFileDownload,
    FaPause,
    FaPlay,
    FaRedo,
    FaSearchMinus,
    FaSearchPlus,
    FaStop,
    FaTrash,
    FaUndo,
    FaVolumeMute,
    FaVolumeUp
} from "react-icons/fa";
import "./App.css";


const NOTE_HEIGHT = 22;
const LEFT_MARGIN = 70;
const TIMELINE_HEIGHT = 35;
const MIN_DURATION_SECONDS = 0.1;
const DEFAULT_PPS = 80;
const CANVAS_MAX_HEIGHT = 500;
const RESIZE_HANDLE_WIDTH = 15;
const LONG_PRESS_DURATION = 750;

const THEME = {
  bg: "#1e1e24", gridLine: "#2b2b36", barLine: "#3f3f4e",
  pianoWhite: "#2d2d38", pianoBlack: "#16161b", pianoStroke: "#16161b",
  text: "#9ca3af", textActive: "#ffffff", playhead: "#fbbf24",
  selectionBorder: "#60a5fa"
};
const DEFAULT_COLORS = ["#60a5fa", "#f472b6", "#34d399", "#fbbf24", "#a78bfa", "#f87171"];

// --- Tipi ---
interface Note { id: string; midi: number; time: number; duration: number; }
interface Track { id: string; name: string; instrumentName: string; color: string; notes: Note[]; isMuted: boolean; }
interface MidiEditorProps {
  midiFileUrl: string | null;
  onStartNewTrackRecording: () => Promise<void> | void;
  newlyRecordedTrack: Note[] | null;
  onClearNewlyRecordedTrack: () => void;
}

const midiToNoteName = (midi: number) => {
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const octave = Math.floor(midi / 12) - 1;
  const name = noteNames[midi % 12];
  return `${name}${octave}`;
};
const uint8ToBase64 = (arr: Uint8Array) => {
    let binary = ''; const len = arr.byteLength;
    for (let i = 0; i < len; i++) binary += String.fromCharCode(arr[i]);
    return window.btoa(binary);
};

interface NoteShapeProps {
  note: Note; trackId: string; color: string; isActive: boolean; isMuted: boolean; pps: number; maxPitch: number; totalHeight: number; totalWidth: number;
  onDragEnd: (e: KonvaEventObject<DragEvent>, trackId: string, noteId: string) => void;
  onResizeEnd: (newDuration: number, trackId: string, noteId: string) => void;
  onDelete: (trackId: string, noteId: string) => void;
}

const NoteShape: React.FC<NoteShapeProps> = React.memo(({
  note, trackId, color, isActive, isMuted, pps, maxPitch, totalWidth,
  onDragEnd, onResizeEnd, onDelete
}: NoteShapeProps) => {
  const groupRef = useRef<Konva.Group>(null);
  const noteBodyRef = useRef<Konva.Rect>(null);
  const resizeHandleRef = useRef<Konva.Rect>(null);
  const pressTimer = useRef<number | null>(null);

  const x = LEFT_MARGIN + note.time * pps;
  const y = TIMELINE_HEIGHT + (maxPitch - note.midi) * NOTE_HEIGHT;
  const width = Math.max(RESIZE_HANDLE_WIDTH, note.duration * pps);

  const handlePressStart = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!isActive) return;
    try {
      const targetName = e.target && typeof e.target.name === 'function' ? e.target.name() : '';
      if (targetName === 'resize-handle') return;
    } catch (_) {}
      pressTimer.current = window.setTimeout(() => onDelete(trackId, note.id), LONG_PRESS_DURATION);
  };

  const handlePressEnd = () => {
    if (pressTimer.current !== null) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  };

  const handleResizeMove = (e: KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true; if (!isActive) return;
    const handle = resizeHandleRef.current; const noteBody = noteBodyRef.current;
    if (!handle || !noteBody) return;
    const newW = Math.max(RESIZE_HANDLE_WIDTH, handle.x() + RESIZE_HANDLE_WIDTH);
    const clampedW = Math.min(newW, Math.max(RESIZE_HANDLE_WIDTH, totalWidth - x));
    noteBody.width(clampedW); handle.x(clampedW - RESIZE_HANDLE_WIDTH); handle.y(0);
  };

  const handleResizeEndInternal = (e: KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true; if (!isActive) return;
    const handle = resizeHandleRef.current; if (!handle) return;
    const finalHandleX = handle.x();
    handle.y(0);
    const newWidth = Math.max(RESIZE_HANDLE_WIDTH, finalHandleX + RESIZE_HANDLE_WIDTH);
    const newDuration = Math.max(MIN_DURATION_SECONDS, newWidth / pps);
    onResizeEnd(newDuration, trackId, note.id);
  };

  return (
    <Group
      ref={groupRef} key={note.id} x={x} y={y} draggable={isActive} opacity={isMuted ? 0.3 : (isActive ? 1.0 : 0.6)}
      onDragEnd={(e) => { handlePressEnd(); onDragEnd(e, trackId, note.id); }}
      onMouseDown={handlePressStart} onTouchStart={handlePressStart}
      onMouseUp={handlePressEnd} onTouchEnd={handlePressEnd} onDragMove={handlePressEnd}
      dragBoundFunc={(pos) => ({ x: Math.max(LEFT_MARGIN, pos.x), y: pos.y })}
    >
      <Rect ref={noteBodyRef} name="note-body" width={width} height={NOTE_HEIGHT - 1} fill={color} stroke={isActive ? "#fff" : "rgba(0,0,0,0.2)"} strokeWidth={1} cornerRadius={3} />
      <Rect ref={resizeHandleRef} name="resize-handle" x={width - RESIZE_HANDLE_WIDTH} width={RESIZE_HANDLE_WIDTH} height={NOTE_HEIGHT - 2} fill="rgba(255,255,255,0.4)" cornerRadius={[0, 4, 4, 0]} visible={isActive} draggable={isActive} dragDistance={2} onDragMove={handleResizeMove} onDragEnd={handleResizeEndInternal}
        dragBoundFunc={(pos) => {
            const groupAbsY = groupRef.current ? groupRef.current.getAbsolutePosition().y : 0;
            return { x: pos.x, y: groupAbsY };
        }}
      />
      {width > 30 && <Text text={midiToNoteName(note.midi)} fill="rgba(0,0,0,0.7)" fontSize={10} fontStyle="bold" fontFamily="'Inter', sans-serif" x={5} y={5} listening={false} opacity={0.7} />}
    </Group>
  );
});

export default function MidiEditor({ midiFileUrl, onStartNewTrackRecording, newlyRecordedTrack, onClearNewlyRecordedTrack }: MidiEditorProps) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [history, setHistory] = useState<Track[][]>([]);
  const [future, setFuture] = useState<Track[][]>([]);
  const [pps, setPps] = useState<number>(DEFAULT_PPS);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playhead, setPlayhead] = useState<number>(0);
  const [minPitch, setMinPitch] = useState<number>(48);
  const [maxPitch, setMaxPitch] = useState<number>(72);
  const [scrollX, setScrollX] = useState<number>(0);
  const [scrollY, setScrollY] = useState<number>(0);
  const [filename, setFilename] = useState<string>("edited-midi");

  const audioCtx = useRef<AudioContext | null>(null);
  const instrumentRefs = useRef(new Map<string, any>());
  const scheduledNodesRef = useRef<Array<{ node: any, stop?: () => void }>>([]);
  const playbackStartOffsetRef = useRef<number>(0);
  const animationRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!midiFileUrl || tracks.length > 0) return;
    (async () => {
      try {
        const res = await fetch(midiFileUrl); const buf = await res.arrayBuffer(); const midi = new Midi(buf);
        if (!midi.tracks.length) return;
        const track = midi.tracks[0];
        const parsedNotes = (track.notes || []).map((n, i) => ({ id: `note_${Date.now()}_${i}`, midi: n.midi, time: n.time, duration: n.duration || 0.5 }));
        const firstTrack: Track = { id: `track_${Date.now()}`, name: track.name || "Piano", instrumentName: "acoustic_grand_piano", color: DEFAULT_COLORS[0], notes: parsedNotes, isMuted: false };
        const pitches = parsedNotes.map(n => n.midi);
        setMinPitch(Math.max(0, Math.floor(Math.min(...pitches) / 12) * 12));
        setMaxPitch(Math.min(127, Math.ceil((Math.max(...pitches) + 1) / 12) * 12 - 1));
        setTracks([firstTrack]); setActiveTrackId(firstTrack.id); setHistory([[firstTrack]]); setFuture([]);
      } catch (e) { console.error(e); }
    })();
  }, [midiFileUrl, tracks.length]);

  useEffect(() => {
      if (newlyRecordedTrack && newlyRecordedTrack.length > 0) {
        const newTrack: Track = { id: `track_${Date.now()}`, name: `Track ${tracks.length + 1}`, instrumentName: "acoustic_grand_piano", color: DEFAULT_COLORS[tracks.length % DEFAULT_COLORS.length], notes: newlyRecordedTrack, isMuted: false };
        const newTracks = [...tracks, newTrack]; setTracks(newTracks); setActiveTrackId(newTrack.id); pushHistory(newTracks); onClearNewlyRecordedTrack();
      }
  }, [newlyRecordedTrack]);

  useEffect(() => {
    const load = async () => {
        if (!audioCtx.current) audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (audioCtx.current.state === "suspended") await audioCtx.current.resume();
        const instruments = [...new Set(tracks.map(t => t.instrumentName))];
        for (const inst of instruments) {
            if (!instrumentRefs.current.has(inst) && audioCtx.current) {
                try { const p = await Soundfont.instrument(audioCtx.current, inst as any); instrumentRefs.current.set(inst, p); } catch(e){}
            }
        }
    };
    load();
  }, [tracks]);

  const pushHistory = useCallback((ts: Track[]) => { setHistory(h => [...h, ts.map(t => ({...t, notes: t.notes.map((n:any) => ({...n}))}))]); setFuture([]); }, []);
  const maxEnd = useMemo(() => { const notes = tracks.flatMap(t => t.notes); return notes.length ? Math.max(...notes.map((n:any) => n.time + n.duration)) : 10; }, [tracks]);
  const pitchRange = maxPitch - minPitch;
  const totalWidth = (maxEnd + 5) * pps;
  const totalHeight = (pitchRange + 1) * NOTE_HEIGHT + TIMELINE_HEIGHT;

  const undo = () => { setHistory(h => { if(h.length<=1) return h; const prev=h[h.length-2]; setFuture(f=>[h[h.length-1],...f]); setTracks(prev.map((t:any)=>({...t,notes:t.notes.map((n:any)=>({...n}))}))); return h.slice(0,-1); }); };
  const redo = () => { setFuture(f => { if(f.length===0) return f; const next=f[0]; setHistory(h=>[...h,next.map((t:any)=>({...t,notes:t.notes.map((n:any)=>({...n}))}))]); setTracks(next.map((t:any)=>({...t,notes:t.notes.map((n:any)=>({...n}))}))); return f.slice(1); }); };

  const startPlayback = async () => {
      if (!audioCtx.current) audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioCtx.current.state === "suspended") await audioCtx.current.resume();
      playbackStartOffsetRef.current = audioCtx.current.currentTime - playhead;
      scheduleFromPlayhead(0); setIsPlaying(true);
      const step = () => {
          if(!audioCtx.current) return;
          const t = audioCtx.current.currentTime - playbackStartOffsetRef.current;
          setPlayhead(t);
          if (t * pps > scrollX + window.innerWidth * 0.8) setScrollX(t * pps - window.innerWidth * 0.2);
          if (t >= maxEnd) { pausePlayback(); return; }
          animationRef.current = requestAnimationFrame(step);
      }
      animationRef.current = requestAnimationFrame(step);
  };
  const pausePlayback = () => { scheduledNodesRef.current.forEach(n => {try{n.node.stop()}catch{}}); scheduledNodesRef.current=[]; setIsPlaying(false); if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  const stopPlayback = () => { pausePlayback(); setPlayhead(0); playbackStartOffsetRef.current = 0; setScrollX(0); };
  const togglePlayback = () => isPlaying ? pausePlayback() : startPlayback();
  const scheduleFromPlayhead = (offset=0) => {
       const base = playbackStartOffsetRef.current + offset; const curr = audioCtx.current!.currentTime - playbackStartOffsetRef.current;
       tracks.forEach(track => { if(track.isMuted) return; const inst = instrumentRefs.current.get(track.instrumentName); if(!inst) return;
           track.notes.forEach((n:any) => { if(n.time+n.duration<=curr) return; try { const node = inst.play(midiToNoteName(n.midi), base+n.time, {duration: n.duration}); scheduledNodesRef.current.push({node}); } catch(e){} })
       })
  };

  const handleBackgroundDragMove = (e: KonvaEventObject<DragEvent>) => {
    const dragX = e.target.x();
    const dragY = e.target.y();
    setScrollX(prev => Math.max(0, prev - dragX));
    setScrollY(prev => Math.max(0, Math.min(prev - dragY, totalHeight - 300)));
    e.target.position({ x: 0, y: 0 });
  };

  const handleStageTap = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (e.evt.type === 'touchend' && (e.evt as TouchEvent).changedTouches.length > 0) { }
    const target = e.target;
    if (target.name() !== 'background' && target !== target.getStage()) return;

    const pointerPos = target.getStage()?.getPointerPosition();
    if (!pointerPos) return;

    const xOnCanvas = pointerPos.x + scrollX;
    const yOnCanvas = pointerPos.y + scrollY;

    if (yOnCanvas <= TIMELINE_HEIGHT) {
      setPlayhead(Math.max(0, (xOnCanvas - LEFT_MARGIN) / pps));
      return;
    }
    if (!activeTrackId || xOnCanvas < LEFT_MARGIN) return;

    const pitch = maxPitch - Math.floor((yOnCanvas - TIMELINE_HEIGHT) / NOTE_HEIGHT);
    const time = (xOnCanvas - LEFT_MARGIN) / pps;
    if (pitch < minPitch || pitch > maxPitch) return;

    const newNote: Note = { id: `note_${Date.now()}`, midi: pitch, time, duration: 0.5 };
    setTracks(ts => ts.map(t => t.id===activeTrackId ? {...t, notes: [...t.notes, newNote]} : t));
    pushHistory(tracks); // Salva history
  };

  const deleteNote = (tid: string, nid: string) => setTracks(ts => ts.map(t => t.id===tid ? {...t, notes: t.notes.filter((n:any)=>n.id!==nid)} : t));

  const handleNoteDragEnd = (e: any, tid: string, nid: string) => {
      const node = e.target;
      const newTime = Math.max(0, (node.x() - LEFT_MARGIN)/pps);
      const newPitch = maxPitch - Math.floor((node.y() - TIMELINE_HEIGHT)/NOTE_HEIGHT);
      setTracks(ts => { const res = ts.map(t=>t.id===tid ? {...t, notes: t.notes.map((n:any)=>n.id===nid ? {...n, time:newTime, midi:Math.min(Math.max(newPitch, minPitch), maxPitch)} : n)} : t); pushHistory(res); return res; });
  };

  const handleResizeEnd = (dur: number, tid: string, nid: string) => setTracks(ts => ts.map(t => t.id===tid ? {...t, notes: t.notes.map((n:any)=>n.id===nid ? {...n, duration: dur} : n)} : t));
  const deleteTrack = (id: string) => { if(window.confirm("Eliminare?")) setTracks(ts => ts.filter(t=>t.id!==id)); };
  const toggleMuteTrack = (id: string) => setTracks(ts => ts.map(t=>t.id===id ? {...t, isMuted: !t.isMuted} : t));
  const handleTrackNameChange = (id: string, name: string) => setTracks(ts => ts.map(t=>t.id===id ? {...t, name} : t));
  const handleTrackInstrumentChange = (id: string, val: string) => setTracks(ts => ts.map(t=>t.id===id ? {...t, instrumentName: val} : t));


  const saveToDevice = async (midi: Midi, name: string) => {
    try {
        const base64 = uint8ToBase64(midi.toArray());
        const fileName = (name || "midi").replace(/[^a-z0-9]/gi, '_') + ".mid";
        await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Documents });
        alert(`Salvato in Documenti: ${fileName}`);
    } catch (e) { alert("Errore salvataggio file."); }
  };

  return (
    <div style={{ width: "100%", userSelect: "none", touchAction: "none", paddingBottom: 50 }}>
      <div className="track-list">
        {tracks.map(track => (
            <div key={track.id} className={`track-card ${track.id===activeTrackId?'active':''}`} onClick={() => setActiveTrackId(track.id)}>
                <div className="track-header">
                    <div className="track-color-dot" style={{backgroundColor: track.color}}></div>
                    <input className="track-name-input" value={track.name} onChange={(e) => handleTrackNameChange(track.id, e.target.value)} onClick={(e)=>e.stopPropagation()} placeholder="Nome Traccia" />
                    <div className="card-actions">
                        <button className="icon-btn download" onClick={(e) => { e.stopPropagation(); const m = new Midi(); const tr = m.addTrack(); tr.name=track.name; track.notes.forEach((n:any)=>tr.addNote({midi:n.midi,time:n.time,duration:n.duration})); saveToDevice(m, track.name); }}><FaFileDownload/></button>
                        <button className="icon-btn" onClick={(e) => { e.stopPropagation(); toggleMuteTrack(track.id); }}>{track.isMuted?<FaVolumeMute/>:<FaVolumeUp/>}</button>
                        <button className="icon-btn delete" onClick={(e) => { e.stopPropagation(); deleteTrack(track.id); }}><FaTrash/></button>
                    </div>
                </div>
                <div className="track-controls-row">
                    <span style={{fontSize: 12, color: '#888'}}>Strumento:</span>
                    <select className="instrument-select" value={track.instrumentName} onChange={(e) => handleTrackInstrumentChange(track.id, e.target.value)} onClick={(e) => e.stopPropagation()}>
                        <option value="acoustic_grand_piano">🎹 Piano</option>
                        <option value="acoustic_guitar_nylon">🎸 Chit. Classica</option>
                        <option value="electric_guitar_clean">🎸 Chit. Elettrica</option>
                        <option value="violin">🎻 Violino</option>
                        <option value="flute">🎶 Flauto</option>
                        <option value="trumpet">🎺 Tromba</option>
                    </select>
                </div>
            </div>
        ))}
      </div>

      <div className="mobile-toolbar">
        <div className="grid-controls-3">
            <button className={`big-btn btn-play ${isPlaying?'active':''}`} onClick={togglePlayback}>{isPlaying?<FaPause size={16}/>:<FaPlay size={16}/>}<span>{isPlaying?"Pause":"Play"}</span></button>
            <button className="big-btn btn-stop" onClick={stopPlayback}><FaStop size={16}/><span>Stop</span></button>
            <button className="big-btn btn-record" onClick={onStartNewTrackRecording}><FaCircle size={16}/><span>New Track</span></button>
        </div>
        <div className="grid-controls-4">
             <button className="big-btn" onClick={()=>{if(history.length>1)undo()}}><FaUndo/><span>Undo</span></button>
             <button className="big-btn" onClick={()=>{if(future.length>0)redo()}}><FaRedo/><span>Redo</span></button>
             <button className="big-btn" onClick={()=>setPps(p=>Math.max(20,p*0.8))}><FaSearchMinus/><span>Zoom -</span></button>
             <button className="big-btn" onClick={()=>setPps(p=>Math.min(400,p*1.25))}><FaSearchPlus/><span>Zoom +</span></button>
        </div>
        <div className="grid-controls-2">
            <button className="big-btn" onClick={()=>setMinPitch(p=>Math.max(0,p-12))}><FaArrowDown/><span>Basse</span></button>
            <button className="big-btn" onClick={()=>setMaxPitch(p=>Math.min(127,p+12))}><FaArrowUp/><span>Alte</span></button>
        </div>
        <div className="project-bar">
            <input className="project-input" value={filename} onChange={(e)=>setFilename(e.target.value)} placeholder="Nome Progetto"/>
            <button className="btn-export" onClick={()=>{const m=new Midi(); tracks.forEach(t=>{const tr=m.addTrack(); tr.name=t.name; t.notes.forEach((n:any)=>tr.addNote({midi:n.midi,time:n.time,duration:n.duration}));}); saveToDevice(m, filename);}}><FaDownload/></button>
        </div>
      </div>

      <div ref={containerRef} className="canvas-container">
        <Stage width={Math.max(totalWidth, window.innerWidth)} height={totalHeight} onTap={handleStageTap}>
          <Layer>
            <Group x={-scrollX} y={-scrollY}>
                <Rect name="background" x={0} y={0} width={totalWidth} height={totalHeight} fill={THEME.bg} draggable={true} onDragMove={handleBackgroundDragMove} onDragEnd={(e) => { e.target.position({x:0, y:0}) }} />

                {Array.from({ length: pitchRange + 2 }).map((_, i) => (
                <Line key={`row-${i}`} points={[0, TIMELINE_HEIGHT + i * NOTE_HEIGHT, totalWidth, TIMELINE_HEIGHT + i * NOTE_HEIGHT]} stroke={THEME.gridLine} strokeWidth={1} listening={false} />
                ))}
                {Array.from({ length: Math.ceil(maxEnd + 5) }).map((_, i) => (
                <Line key={`vline-${i}`} points={[LEFT_MARGIN + i * pps, 0, LEFT_MARGIN + i * pps, totalHeight]} stroke={i % 4 === 0 ? THEME.barLine : THEME.gridLine} strokeWidth={i % 4 === 0 ? 1 : 0.5} dash={i % 4 === 0 ? [] : [5, 5]} listening={false} />
                ))}

                {tracks.flatMap(track => {
                const isActive = track.id === activeTrackId;
                const isMuted = track.isMuted;
                return track.notes.map((note:any) => (
                    <NoteShape key={note.id} note={note} trackId={track.id} color={track.color} isActive={isActive} isMuted={isMuted} pps={pps} maxPitch={maxPitch} totalHeight={totalHeight} totalWidth={totalWidth} onDragEnd={handleNoteDragEnd} onResizeEnd={handleResizeEnd} onDelete={deleteNote} />
                ));
                })}
            </Group>

            <Group y={-scrollY}>
                <Rect x={0} y={0} width={LEFT_MARGIN} height={totalHeight} fill={THEME.bg} shadowColor="black" shadowBlur={10} shadowOffsetX={2} listening={false}/>
                {Array.from({ length: pitchRange + 1 }).map((_, i) => {
                    const pitch = maxPitch - i; if (pitch < 0 || pitch > 127) return null;
                    const y = TIMELINE_HEIGHT + i * NOTE_HEIGHT; const isBlack = [1,3,6,8,10].includes(pitch % 12);
                    return (<Group key={`key-${pitch}`}><Rect x={0} y={y} width={LEFT_MARGIN} height={NOTE_HEIGHT} fill={isBlack ? THEME.pianoBlack : THEME.pianoWhite} stroke={THEME.pianoStroke} strokeWidth={1} listening={false}/><Text x={6} y={y + 6} text={midiToNoteName(pitch)} fontSize={11} fill={THEME.text} listening={false}/></Group>);
                })}
            </Group>

            <Group x={-scrollX}>
                <Rect x={0} y={0} width={totalWidth} height={TIMELINE_HEIGHT} fill={THEME.bg} stroke={THEME.barLine} strokeWidth={1} listening={false}/>
                {Array.from({ length: Math.ceil(maxEnd + 5) }).map((_, i) => (
                    <Group key={`time-${i}`}><Text x={LEFT_MARGIN + i * pps + 4} y={10} text={`${i}`} fontSize={11} fill={THEME.text} listening={false}/><Line points={[LEFT_MARGIN + i * pps, 22, LEFT_MARGIN + i * pps, 30]} stroke={THEME.text} strokeWidth={1} opacity={0.5}/></Group>
                ))}
            </Group>

            <Rect x={0} y={0} width={LEFT_MARGIN} height={TIMELINE_HEIGHT} fill={THEME.bg} listening={false}/>
            <Line points={[LEFT_MARGIN + playhead * pps - scrollX, 0, LEFT_MARGIN + playhead * pps - scrollX, CANVAS_MAX_HEIGHT]} stroke={THEME.playhead} strokeWidth={1.5} listening={false} />
          </Layer>
        </Stage>
      </div>
    </div>
  );
}