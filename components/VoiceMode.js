"use client";

import { useEffect, useRef, useState } from "react";
import Orb from "./Orb";
import Icon from "./Icon";

// v8: full-screen voice mode. A big orb that reacts to your voice, a live transcript,
// and a Send button. Uses the browser's built-in speech recognition (Chrome, Edge, Safari):
// free, and no audio goes to our server.
export default function VoiceMode({ onSend, onClose }) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState("");
  const recognition = useRef(null);
  const orbHolder = useRef(null);

  function startListening() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setProblem("Voice input needs Chrome, Edge or Safari.");
      return;
    }

    const alreadySaid = text; // tapping the orb again ADDS to what you said before
    const listener = new SpeechRecognition();
    recognition.current = listener;
    listener.lang = navigator.language;
    listener.continuous = true; // keep listening through short pauses
    listener.interimResults = true; // show words while you're still saying them
    listener.onresult = (event) => {
      const heard = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join("");
      setText((alreadySaid + " " + heard).trim());
    };
    listener.onerror = (event) => {
      if (event.error === "not-allowed") setProblem("Allow the microphone to talk to the assistant.");
    };
    // Only the CURRENT listener may say "stopped". An old, cancelled one can end after a new one started.
    listener.onend = () => recognition.current === listener && setListening(false);
    listener.start();
    setListening(true);
  }

  function stopListening() {
    recognition.current?.stop();
  }

  function send() {
    const listener = recognition.current;
    recognition.current = null;
    listener?.abort();
    onSend(text);
    onClose();
  }

  // Start listening as soon as voice mode opens. Stop when it closes.
  useEffect(() => {
    startListening();
    const closeOnEscape = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      const listener = recognition.current;
      recognition.current = null;
      listener?.abort();
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The "hearing" animation: measure how loud the microphone is, many times a second,
  // and pass it to CSS as --level (0 = silence, 1 = very loud). CSS grows the orb with it.
  useEffect(() => {
    let cancelled = false;
    let stream = null;
    let audio = null;
    let frame = null;

    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((micStream) => {
        stream = micStream;
        if (cancelled) return stream.getTracks().forEach((track) => track.stop());
        audio = new AudioContext();
        const analyser = audio.createAnalyser();
        analyser.fftSize = 256;
        audio.createMediaStreamSource(stream).connect(analyser);
        const volumes = new Uint8Array(analyser.frequencyBinCount);

        function measure() {
          analyser.getByteFrequencyData(volumes);
          const average = volumes.reduce((sum, v) => sum + v, 0) / volumes.length / 255;
          orbHolder.current?.style.setProperty("--level", Math.min(1, average * 3).toFixed(3));
          frame = requestAnimationFrame(measure);
        }
        measure();
      })
      .catch(() => {}); // no microphone: the orb just doesn't move

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      audio?.close();
    };
  }, []);

  let status = "Tap the orb to talk";
  if (listening) status = "Listening…";
  if (problem) status = problem;

  return (
    <div className="voice-mode">
      <button className="round voice-close" onClick={onClose} title="Close (Esc)">
        <Icon name="x" />
      </button>

      <button
        ref={orbHolder}
        className={`voice-orb ${listening ? "listening" : ""}`}
        onClick={listening ? stopListening : startListening}
        title={listening ? "Pause" : "Talk"}
      >
        <Orb size="large" />
      </button>

      <p className="voice-status">{status}</p>
      <p className={`voice-text ${text ? "" : "muted"}`}>{text || "Ask anything about your PDF"}</p>

      <div className="voice-buttons">
        <button className="round" onClick={() => setText("")} disabled={!text} title="Clear">
          <Icon name="trash" />
        </button>
        <button className="round big" onClick={listening ? stopListening : startListening} title={listening ? "Pause" : "Talk"}>
          <Icon name={listening ? "stop" : "mic"} size={22} />
        </button>
        <button className="round send" onClick={send} disabled={!text.trim()} title="Send">
          <Icon name="arrow-up" />
        </button>
      </div>
    </div>
  );
}
