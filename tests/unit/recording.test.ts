import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRecording,
  SILENCE_TIMEOUT_MS,
  type Recognition,
} from "../../src/lib/voice/recording";
function setup(continuous = true) {
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
    { language: "en-US", continuous, onText, onState, onError },
  );
  return { recording, instances, onText, onState, onError };
}
const result = (recognition: Recognition, ...parts: string[]) =>
  recognition.onresult?.({
    results: parts.map((transcript) => [{ transcript }]),
  });
afterEach(() => vi.useRealTimers());
describe("recording session", () => {
  it("uses short Android sessions and replaces growing hypotheses without repeating them", () => {
    vi.useFakeTimers();
    const s = setup(false);
    s.recording.start("Existing note");
    const first = s.instances[0];
    expect(first.continuous).toBe(false);
    expect(first.interimResults).toBe(true);
    for (const phrase of [
      "I",
      "I",
      "I am",
      "I am testing",
      "I am testing the app",
    ])
      result(first, phrase);
    expect(s.onText).toHaveBeenLastCalledWith(
      "Existing note I am testing the app",
    );
    first.onend?.();
    vi.advanceTimersByTime(250);
    const second = s.instances[1];
    expect(second.continuous).toBe(false);
    result(second, "remind");
    result(second, "remind me in six minutes");
    s.recording.stop();
    result(second, "remind me in 6 minutes");
    second.onend?.();
    expect(s.onText).toHaveBeenLastCalledWith(
      "Existing note I am testing the app remind me in 6 minutes",
    );
    vi.advanceTimersByTime(20_000);
    expect(s.instances).toHaveLength(2);
  });
  it("preserves deliberately repeated words instead of deduplicating the user's speech", () => {
    const s = setup(false);
    s.recording.start("");
    result(s.instances[0], "very very important");
    expect(s.onText).toHaveBeenLastCalledWith("very very important");
    s.recording.dispose();
  });
  it("distinguishes speech-service failures from microphone denial and ignores stale errors", () => {
    vi.useFakeTimers();
    const s = setup(false);
    s.recording.start("");
    const first = s.instances[0];
    const lateError = first.onerror!;
    result(first, "Keep this text");
    first.onend?.();
    vi.advanceTimersByTime(250);
    lateError({ error: "network" });
    expect(s.onError).toHaveBeenLastCalledWith("");
    s.instances[1].onerror?.({ error: "network" });
    expect(s.onError).toHaveBeenLastCalledWith(
      expect.stringContaining("speech service is unavailable"),
    );
    expect(s.onText).toHaveBeenLastCalledWith("Keep this text");
    expect(s.onState).toHaveBeenLastCalledWith("idle");
    vi.advanceTimersByTime(20_000);
    expect(s.instances).toHaveLength(2);
  });
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
