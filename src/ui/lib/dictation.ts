import { useEffect, useRef, useState } from "react";

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

export function useDictation(value: string, onChange: (value: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  useEffect(() => {
    const ctor = (window as Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition
      ?? (window as Window & { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;
    setSupported(Boolean(ctor));
    if (!ctor) return;
    const next = new ctor();
    next.continuous = true;
    next.interimResults = true;
    next.lang = navigator.language || "en-US";
    next.onresult = (event) => {
      const text = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join("");
      if (text) onChange(`${value}${value && !value.endsWith(" ") ? " " : ""}${text}`);
    };
    next.onend = () => setListening(false);
    next.onerror = () => setListening(false);
    recognition.current = next;
    return () => next.stop();
  }, []);
  return {
    supported,
    listening,
    toggle: () => {
      if (!recognition.current) return;
      if (listening) recognition.current.stop();
      else {
        recognition.current.start();
        setListening(true);
      }
    },
  };
}
