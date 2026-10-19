"use client";
import { useEffect, useRef, useState } from "react";
import { ReminderForm } from "./reminder-form";
import { useSpeechInput } from "./use-speech-input";
import type { ParseResult, ReminderDraft } from "@/lib/validation/ai";
import { Icon } from "./icon";
import { SessionRecovery } from "./session-recovery";

export function ReminderCapture({
  timeZone,
  detectTimeZone,
}: {
  timeZone: string;
  detectTimeZone: boolean;
}) {
  const [text, setText] = useState("");
  const [history, setHistory] = useState<
    { question: string; answer: string }[]
  >([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    draft: ReminderDraft;
    source: string;
    version: number;
    interpretation?: string;
  } | null>(null);
  const [manual, setManual] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const review = useRef<HTMLElement | null>(null);
  const clarificationInput = useRef<HTMLInputElement | null>(null);
  const speech = useSpeechInput(text, updateText);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (confirmation) review.current?.focus();
  }, [confirmation]);
  useEffect(() => {
    if (question) clarificationInput.current?.focus();
  }, [question]);

  function updateText(value: string) {
    setText(value);
    setHistory([]);
    setQuestion("");
    setAnswer("");
    setConfirmation(null);
  }
  async function interpret() {
    if (busy || speech.listening) return;
    const clarification = question
      ? [...history, { question, answer: answer.trim() }]
      : history;
    if (!text.trim() || (question && !answer.trim())) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    setExpired(false);
    try {
      const response = await fetch("/api/ai/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, clarification }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) {
        setExpired(response.status === 401);
        setError(
          result.error?.message ??
            "Couldn’t interpret this. Try again or enter it manually.",
        );
        return;
      }
      const parsed = result as ParseResult;
      setHistory(clarification);
      if (parsed.status === "clarify") {
        setQuestion(parsed.question);
        setAnswer("");
      } else if (parsed.status === "ready" && parsed.draft) {
        setConfirmation((previous) => ({
          draft: parsed.draft,
          interpretation: parsed.interpretation,
          source: text,
          version: (previous?.version ?? 0) + 1,
        }));
        setQuestion("");
        setAnswer("");
        setManual(false);
      } else {
        setError("Couldn’t interpret this reliably. Please enter it manually.");
      }
    } catch {
      if (!controller.signal.aborted)
        setError(
          "Couldn’t connect. Your input is still here; retry or enter it manually.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <div className="capture-workspace space-y-6">
      <div className="step-strip" aria-label="Reminder creation steps">
        <span className={confirmation || manual ? "" : "current"}>
          <b>1</b>Capture a thought
        </span>
        <Icon name="arrow" size={15} />
        <span className={confirmation || manual ? "current" : ""}>
          <b>2</b>Make it yours
        </span>
        <Icon name="arrow" size={15} />
        <span>
          <b>3</b>Let it go
        </span>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void interpret();
        }}
        className="space-y-4"
      >
        <label className="block font-medium" htmlFor="reminder-text">
          What do you need to remember?
        </label>
        <textarea
          id="reminder-text"
          rows={4}
          maxLength={4000}
          value={text}
          disabled={busy}
          readOnly={speech.listening}
          onChange={(event) => updateText(event.target.value)}
          placeholder="Submit the report tomorrow at 3 PM"
          className="block w-full rounded-lg border border-stone-300 bg-white p-3"
        />
        <p className="capture-help">
          Dates use {timeZone.replaceAll("_", " ")}. You’ll review the details
          before anything is saved.
        </p>
        <div className="speech-controls">
          <button
            type="button"
            disabled={!speech.supported || busy || speech.stopping}
            onClick={speech.listening ? speech.stop : speech.start}
            aria-pressed={speech.listening}
            className="speech-button"
          >
            <Icon name="mic" size={16} />
            {speech.stopping
              ? "Finishing transcription…"
              : speech.listening
                ? "Stop recording"
                : "Use microphone"}
          </button>
          <span role="status" className="text-sm text-stone-600">
            {speech.listening
              ? "Listening… Pauses up to 15 seconds are allowed. Stop to review and edit your transcription."
              : !speech.supported
                ? "Voice input isn’t supported here. Type your reminder instead."
                : "You can edit the transcription before continuing."}
          </span>
        </div>
        {speech.speechError && (
          <p role="alert" className="text-sm text-red-800">
            {speech.speechError}
          </p>
        )}
        {question && (
          <div className="rounded-lg bg-amber-50 p-4" aria-live="polite">
            <label htmlFor="clarification" className="block font-medium">
              {question}
            </label>
            <input
              ref={clarificationInput}
              id="clarification"
              value={answer}
              maxLength={1000}
              disabled={busy}
              required
              onChange={(event) => setAnswer(event.target.value)}
              className="mt-3 w-full rounded-lg border border-stone-300 bg-white p-3"
            />
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-800">
            {error}
          </p>
        )}
        {history.length >= 5 && question && (
          <p role="status">
            Try rewriting the original reminder with the missing details, or
            enter it manually.
          </p>
        )}
        <SessionRecovery visible={expired} />
        <div className="capture-submit">
          <button
            disabled={
              busy ||
              speech.listening ||
              !text.trim() ||
              Boolean(question && (!answer.trim() || history.length >= 5))
            }
            className="rounded-lg bg-emerald-900 px-5 py-3 font-medium text-white disabled:opacity-50"
          >
            <Icon name="sparkle" size={17} />
            {busy
              ? "Finding the details…"
              : question
                ? "Use this answer"
                : "Preview reminder"}
          </button>
          <button
            type="button"
            disabled={busy || speech.listening}
            onClick={() => setManual(true)}
            className="px-2 py-3 underline"
          >
            Enter manually
          </button>
        </div>
      </form>
      {manual ? (
        <section aria-label="Manual reminder" className="confirmation-section">
          <h2 className="text-xl font-semibold">Enter the details</h2>
          <ReminderForm
            timeZone={timeZone}
            detectTimeZone={detectTimeZone}
            sourceText={text}
          />
        </section>
      ) : (
        confirmation && (
          <section
            aria-label="Confirm reminder"
            className="confirmation-section"
            ref={review}
            tabIndex={-1}
          >
            <h2 className="text-xl font-semibold">Review and confirm</h2>
            <p className="mt-2 text-sm text-stone-600">
              Nothing has been saved. Correct the details below, then choose
              Save reminder.
            </p>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer">Original input</summary>
              <p className="mt-2 whitespace-pre-wrap">{confirmation.source}</p>
            </details>
            {confirmation.interpretation && (
              <p className="mt-3 text-sm" role="status">
                {confirmation.interpretation} You can change it below.
              </p>
            )}
            <ReminderForm
              key={confirmation.version}
              timeZone={timeZone}
              draft={confirmation.draft}
              sourceText={confirmation.source}
            />
          </section>
        )
      )}
    </div>
  );
}
