# Vox Notes
Vox Notes is a project that implements a hybrid mobile application designed to bridge the gap between vocal musical ideation and digital notation. The project combines a modern React-based mobile frontend with a powerful Python AI backend to transform voice recordings into editable MIDI files in near real-time.
This project was created as part of a Bachelor's Thesis in Computer Science/Engineering, exploring the application of Deep Learning models in mobile environments through a Client-Server architecture.

## Key Idea

The project stems from the challenge of bringing high-accuracy music information retrieval tools to mobile devices, which often lack the computational resources required for heavy AI inference.
Vox Notes provides a solution to the "accuracy vs. portability" trade-off by decoupling the user interface from the processing logic.

The main focus is to implement and validate a hybrid architecture:

- *The Client*: focuses on usability, utilizing native plugins to ensure stable, high-quality audio capture and providing a fluid, touch-based interface for MIDI editing.
- *The Server*: focuses on performance, encapsulating the Basic Pitch neural network (developed by Spotify) to perform heavy audio-to-MIDI transcription tasks efficiently.

## Goal and Approach
The primary goal of this project is to democratize access to music notation, allowing musicians to capture and edit ideas anywhere, without needing complex desktop DAWs.

The approach leverages a specialized pipeline:
- Native acquisition: using Capacitor to bypass browser limitations and access the device's microphone directly.
- AI Inference: using Basic-Pitch via a FastAPI backend to detect notes and pitch bends with high precision.
- Interactive Editing: using a custom canvas-based Piano Roll editor to allow users to correct and refine the AI's output immediately.

## File Structure

- Main Directories
  - backend/ Contains the Python server implementation and AI logic.
    - *main.py*: The entry point for the FastAPI application. Handles audio normalization (pydub) and inference (basic-pitch).
  - mobile/ Contains the hybrid mobile application source code (React + Capacitor).
      - *src/components/VoiceRecorder.tsx*: Manages native audio recording via Capacitor and handles API communication.
      - *src/components/MidiEditor.tsx*: The core visual component. Parses binary MIDI data and renders the interactive Piano Roll using react-konva.

frontend/ is the directory of the prototype webapp, which is now deprecated.
    
## How to run

To run the project locally, you will need **Node.js**, **Python 3.9+**, and **FFmpeg** installed on your system.

### 1. Start the Backend (Server)
Navigate to the `backend` folder, install dependencies, and start the server:

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Start the Mobile App (Client)
The mobile application is built with Ionic and React.

If you haven't already, install the Ionic CLI globally:
```bash
npm install -g @ionic/cli
```
Then, navigate to the mobile folder and install the project dependencies:
```bash
cd mobile
npm install
```
**Important Configuration**: Before running, ensure your smartphone (or emulator) and your computer are connected to the same Wi-Fi network.
Find your computer's local IP address, open _mobile/src/components/VoiceRecorder.tsx_ and update the API_URL constant with your IP.

To start the app in your browser with live reload:
```bash
ionic serve
```
The app should automatically open at http://localhost:8100.

To build and deploy the app to a real device or emulator (requires Android Studio or Xcode):
```bash
ionic build
npx cap sync
npx cap open android  # or ios
```


