export type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
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
export type RecordingState = "idle" | "listening" | "stopping";
export const SILENCE_TIMEOUT_MS = 15_000;

export function createRecording(
  factory: () => Recognition,
  options: {
    language: string;
    onText(text: string): void;
    onState(state: RecordingState): void;
    onError(message: string): void;
  },
) {
  let current: Recognition | null = null;
  let wanted = false;
  let disposed = false;
  let base = "";
  let latest = "";
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let restartTimer: ReturnType<typeof setTimeout> | undefined;
  let stopTimer: ReturnType<typeof setTimeout> | undefined;
  const detach = (recognition: Recognition) => {
    recognition.onstart =
      recognition.onspeechstart =
      recognition.onspeechend =
      recognition.onend =
      recognition.onresult =
      recognition.onerror =
        null;
  };
  function finish() {
    wanted = false;
    clearTimeout(idleTimer);
    clearTimeout(restartTimer);
    clearTimeout(stopTimer);
    idleTimer = restartTimer = stopTimer = undefined;
    if (current) {
      detach(current);
      current.abort();
      current = null;
    }
    if (!disposed) options.onState("idle");
  }
  function stop() {
    wanted = false;
    clearTimeout(idleTimer);
    clearTimeout(restartTimer);
    idleTimer = restartTimer = undefined;
    if (!current) {
      finish();
      return;
    }
    options.onState("stopping");
    // Let final results arrive before releasing the microphone.
    stopTimer ??= setTimeout(finish, 1500);
    try {
      current.stop();
    } catch {
      finish();
    }
  }
  function armSilenceTimer() {
    clearTimeout(idleTimer);
    if (wanted) idleTimer = setTimeout(stop, SILENCE_TIMEOUT_MS);
  }
  function launch() {
    if (!wanted || disposed) return;
    const recognition = factory();
    current = recognition;
    const prefix = base;
    let speaking = false;
    recognition.lang = options.language;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => {
      // Native restarts must not reset the user's inactivity deadline.
      if (wanted && !idleTimer) armSilenceTimer();
    };
    recognition.onspeechstart = () => {
      speaking = true;
      clearTimeout(idleTimer);
      idleTimer = undefined;
    };
    recognition.onspeechend = () => {
      speaking = false;
      armSilenceTimer();
    };
    recognition.onresult = (event) => {
      if (disposed || current !== recognition) return;
      // Results are replaceable snapshots for this native session, not new text
      // to append on each event. Interim hypotheses can shrink or be corrected.
      const transcript = Array.from(
        event.results,
        (result) => result[0]?.transcript.trim() ?? "",
      )
        .filter(Boolean)
        .join(" ");
      latest = [prefix, transcript].filter(Boolean).join(" ").slice(0, 4000);
      options.onText(latest);
      if (!speaking) armSilenceTimer();
      if (latest.length >= 4000) {
        options.onError(
          "The 4,000 character limit was reached. Review the text before continuing.",
        );
        stop();
      }
    };
    recognition.onerror = (event) => {
      if (event.error === "no-speech") return;
      if (event.error === "aborted" && !wanted) return;
      options.onError(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone access was denied. Allow it in your browser settings, or type your reminder."
          : "Voice capture stopped. Your text is still here; try again or keep typing.",
      );
      finish();
    };
    recognition.onend = () => {
      if (current !== recognition) return;
      detach(recognition);
      current = null;
      base = latest;
      if (wanted && !disposed) {
        if (!idleTimer) armSilenceTimer();
        restartTimer = setTimeout(launch, 250);
      } else finish();
    };
    try {
      recognition.start();
    } catch {
      options.onError(
        "Couldn’t start the microphone. You can type your reminder instead.",
      );
      finish();
    }
  }
  return {
    start(text: string) {
      if (wanted || current || disposed) return;
      base = latest = text.trim();
      wanted = true;
      options.onError("");
      options.onState("listening");
      launch();
    },
    stop,
    dispose() {
      disposed = true;
      finish();
    },
  };
}
