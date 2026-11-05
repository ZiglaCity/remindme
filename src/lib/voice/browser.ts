import type { Recognition } from "./recording";

export type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

export const resolveRecognitionConstructor = (browser?: SpeechWindow) =>
  browser?.webkitSpeechRecognition ?? browser?.SpeechRecognition;

export const isAndroidUserAgent = (userAgent: string) => /Android/i.test(userAgent);
