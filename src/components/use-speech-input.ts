"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
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
  const recognition = useRef<Recognition | null>(null);
  const [listening, setListening] = useState(false);
  const [speechError, setSpeechError] = useState("");
  useEffect(
    () => () => {
      const current = recognition.current;
      if (current) {
        current.onresult = current.onerror = current.onend = null;
        current.abort();
      }
    },
    [],
  );

  function stop() {
    recognition.current?.stop();
  }
  function start() {
    const SpeechRecognition = constructor();
    if (!SpeechRecognition || recognition.current) return;
    setSpeechError("");
    const current = new SpeechRecognition();
    recognition.current = current;
    current.lang = navigator.language || "en-US";
    current.continuous = false;
    current.interimResults = true;
    const prefix = text.trim();
    current.onresult = (event) => {
      const transcript = Array.from(
        event.results,
        (result) => result[0]?.transcript ?? "",
      ).join(" ");
      const combined = `${prefix}${prefix ? " " : ""}${transcript}`;
      onText(combined.slice(0, 4000));
      if (combined.length > 4000) {
        setSpeechError(
          "The 4,000 character limit was reached. Review the text before continuing.",
        );
        current.stop();
      }
    };
    current.onerror = (event) => {
      setSpeechError(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone access was denied. Allow it in your browser settings, or type your reminder."
          : event.error === "no-speech"
            ? "No speech was detected. Try again or type your reminder."
            : "Voice capture stopped. Your text is still here; try again or keep typing.",
      );
    };
    current.onend = () => {
      recognition.current = null;
      setListening(false);
    };
    try {
      current.start();
      setListening(true);
    } catch {
      recognition.current = null;
      setListening(false);
      setSpeechError(
        "Couldn’t start the microphone. You can type your reminder instead.",
      );
    }
  }
  return { supported, listening, speechError, start, stop };
}
