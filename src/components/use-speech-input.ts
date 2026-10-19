"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  createRecording,
  type Recognition,
  type RecordingState,
} from "@/lib/voice/recording";

type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
const constructor = () => {
  if (typeof window === "undefined") return undefined;
  const browser = window as SpeechWindow;
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
};
const subscribe = () => () => {};
export function useSpeechInput(text: string, onText: (text: string) => void) {
  const supported = useSyncExternalStore(
    subscribe,
    () => Boolean(constructor()),
    () => false,
  );
  const recording = useRef<ReturnType<typeof createRecording> | null>(null);
  const callback = useRef(onText);
  const [state, setState] = useState<RecordingState>("idle");
  const [speechError, setSpeechError] = useState("");
  useEffect(() => {
    callback.current = onText;
  }, [onText]);
  useEffect(() => () => recording.current?.dispose(), []);
  function start() {
    const SpeechRecognition = constructor();
    if (!SpeechRecognition || state !== "idle") return;
    recording.current?.dispose();
    recording.current = createRecording(() => new SpeechRecognition(), {
      language: navigator.language || "en-US",
      onText: (value) => callback.current(value),
      onState: setState,
      onError: setSpeechError,
    });
    recording.current.start(text);
  }
  return {
    supported,
    listening: state !== "idle",
    stopping: state === "stopping",
    speechError,
    start,
    stop: () => recording.current?.stop(),
  };
}
