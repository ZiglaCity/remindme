import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRecording,
  SILENCE_TIMEOUT_MS,
  type Recognition,
} from "../../src/lib/voice/recording";
function setup() {
  const instances: Recognition[] = [];
  const onText = vi.fn();
  const onState = vi.fn();
  const onError = vi.fn();
  const recording = createRecording(
    () => {
      const instance: Recognition = {
        lang: "",
        interimResults: false,
        continuous: false,
        onstart: null,
        onspeechstart: null,
        onspeechend: null,
        onresult: null,
        onerror: null,
        onend: null,
        start() {
          this.onstart?.();
        },
        stop: vi.fn(),
        abort: vi.fn(),
      };
      instances.push(instance);
      return instance;
    },
    { language: "en-US", onText, onState, onError },
  );
  return { recording, instances, onText, onState, onError };
}
const result = (recognition: Recognition, ...parts: string[]) =>
  recognition.onresult?.({
    results: parts.map((transcript) => [{ transcript }]),
  });
afterEach(() => vi.useRealTimers());
describe("recording session", () => {
  it("replaces interim text, survives native restarts and allows a full silence interval", () => {
    vi.useFakeTimers();
    const s = setup();
    s.recording.start("Existing note");
    const first = s.instances[0];
    expect(first.continuous).toBe(true);
    result(first, "buy flower");
    result(first, "buy flour");
    expect(s.onText).toHaveBeenLastCalledWith("Existing note buy flour");
    vi.advanceTimersByTime(5000);
    first.onend?.();
    vi.advanceTimersByTime(250);
    expect(s.instances).toHaveLength(2);
    result(s.instances[1], "tomorrow", "at noon");
    expect(s.onText).toHaveBeenLastCalledWith(
      "Existing note buy flour tomorrow at noon",
    );
    s.instances[1].onspeechstart?.();
    result(s.instances[1], "tomorrow", "at noon");
    vi.advanceTimersByTime(SILENCE_TIMEOUT_MS * 2);
    expect(s.instances[1].stop).not.toHaveBeenCalled();
    s.instances[1].onspeechend?.();
    vi.advanceTimersByTime(SILENCE_TIMEOUT_MS - 1);
    expect(s.instances[1].stop).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(s.instances[1].stop).toHaveBeenCalledOnce();
    s.instances[1].onend?.();
    expect(s.onState).toHaveBeenLastCalledWith("idle");
  });
  it("retains final results after manual stop and never restarts after disposal or denial", () => {
    vi.useFakeTimers();
    const s = setup();
    s.recording.start("");
    result(s.instances[0], "draft");
    s.recording.stop();
    result(s.instances[0], "final draft");
    s.instances[0].onend?.();
    vi.advanceTimersByTime(20_000);
    expect(s.onText).toHaveBeenLastCalledWith("final draft");
    expect(s.instances).toHaveLength(1);
    s.recording.start("final draft");
    s.instances[1].onerror?.({ error: "not-allowed" });
    expect(s.onError).toHaveBeenLastCalledWith(
      expect.stringContaining("denied"),
    );
    s.recording.dispose();
    vi.advanceTimersByTime(20_000);
    expect(s.instances).toHaveLength(2);
  });
});
