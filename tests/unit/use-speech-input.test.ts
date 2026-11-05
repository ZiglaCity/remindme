import { describe, expect, it } from "vitest";
import {
  isAndroidUserAgent,
  resolveRecognitionConstructor,
} from "../../src/lib/voice/browser";

describe("speech input browser detection", () => {
  it("prefers the webkit speech constructor when both constructors exist", () => {
    const Standard = class {};
    const Webkit = class {};
    expect(
      resolveRecognitionConstructor({
        SpeechRecognition: Standard as never,
        webkitSpeechRecognition: Webkit as never,
      } as never),
    ).toBe(Webkit);
  });

  it("falls back to the standard speech constructor", () => {
    const Standard = class {};
    expect(
      resolveRecognitionConstructor({
        SpeechRecognition: Standard as never,
      } as never),
    ).toBe(Standard);
  });

  it("detects Android user agents for non-continuous native sessions", () => {
    expect(
      isAndroidUserAgent(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/125.0 Mobile Safari/537.36",
      ),
    ).toBe(true);
    expect(
      isAndroidUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36",
      ),
    ).toBe(false);
  });
});
