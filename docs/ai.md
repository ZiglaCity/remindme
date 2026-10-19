# Text and voice capture

Open **New reminder** to type or dictate a reminder, interpret it, answer clarification questions, and review the editable draft. Only **Save reminder** creates a reminder and its schedules. **Enter manually** works without Gemini and keeps the original text available. Editing the original text starts a fresh clarification conversation.

Relative dates use the persisted settings time zone, shown beside the input. Review that setting before parsing; browser detection is only a convenience in manual entry. A date without a time stays date-only (11:59 PM locally), except the explicit **before-date** rule below. Missing dates, ambiguous weekdays and vague times require clarification. Server validation also rejects nonexistent/repeated DST times rather than choosing an instant silently. All confirmed fields go through the existing independent create validation.

## Interpretation rules (owner amendment, October 19)

- **Before January 1, 2027**, with no clock time, means **December 31, 2026 at 23:59** in the interpretation zone. The model returns the referenced date and `deadlineRelation: before_date`; the server subtracts one calendar day using Temporal and validates the resulting instant. The review explains this conversion beside the editable fields.
- **By/on January 1**, without a clock time, retains January 1 as a date-only deadline (23:59). Explicit clock times are preserved; midnight/12 AM means 00:00 at the beginning of the named date, and noon/12 PM means 12:00. No arbitrary additional lead time is invented.
- Obvious transcription mistakes may be repaired from context, such as “tomorrow at ate a.m.” → 08:00. Uncertain names, numbers, dates or competing meanings require one focused question. This is a model instruction, not a guarantee of perfect speech interpretation; the original text stays available and the owner confirms the editable result.
- This remains one bounded structured provider request per interpretation, with no tools, secondary agent, automatic reminder creation or extra model correction pass. Notification thresholds remain the agreed 50/75/90% formula; this amendment changes deadline interpretation only.

## Provider configuration

Set `GEMINI_API_KEY` privately in `.env.local`. `GEMINI_MODEL` defaults to `gemini-3.8-flash`; model selection stays on the server. The official `@google/genai` SDK is pinned to 2.30.0. JSON-schema structured output is validated with a strict Zod schema, then calendar/zone semantics are checked with Temporal. Reminder text and clarification answers are untrusted data, separated from the system instruction. No tools or action execution are enabled.

The default `gemini-3.8-flash` uses `ThinkingLevel.LOW` for this bounded extraction task, rather than its default medium reasoning. Google documents low as a latency/cost control; minimal is unsupported for this model. Custom model overrides retain their provider defaults to avoid sending an unsupported thinking option. See [Google thinking configuration](https://ai.google.dev/gemini-api/docs/generate-content/thinking.md).

The authenticated, same-origin `POST /api/ai/parse` accepts `{ text, clarification?: [{ question, answer }] }`. Text is limited to 4,000 characters, clarification history to five exchanges, and the request body to 32 KiB. Responses are `{ status: "clarify", question }` or `{ status: "ready", draft, interpretation? }`. Parsing reads the owner's preferences and only writes the shared rate-limit counter; it never creates reminders or notifications. The durable limit is ten calls per user per minute; local throttling returns `Retry-After`. Provider requests have a 25-second timeout and one attempt (no automatic retries). Unavailable credentials, provider capacity, timeout and invalid output return sanitized actionable errors; raw inputs and provider errors are not logged.

Voice uses feature-detected `SpeechRecognition`/`webkitSpeechRecognition`, starts only when the microphone button is clicked, and uses the browser language. Stop recording to edit the transcription before interpretation. Unsupported browsers, denied access, missing speech or service errors leave typing available. Recognition is aborted on navigation. Speech recognition can depend on the browser's external speech service; there is no separate application speech API or audio storage.

October 19 voice fix: capture now uses continuous recognition and waits 15 seconds after speech ends before stopping. Interim results replace the previous hypothesis rather than being appended; native browser restarts retain the accumulated transcript and do not reset the silence deadline. Explicit Stop allows final results to arrive, and permission/service failures or navigation prevent automatic restarts. Recognition accuracy still depends on the selected browser language and its speech service.

## Verification

`npm run ai:check` makes six synthetic live Gemini requests without connecting to the database: a relative-date example across a UTC/local date boundary, vague-time clarification, before-date/year boundary, by-date retention, a clear transcription error and midnight. The original two passed on October 18, 2026. Unit checks cover structured output, fixed local context, before-date arithmetic across year/leap-day boundaries, invalid dates/DST and missing credentials. The focused browser journey uses deterministic provider responses for clarification and correction, the real unavailable-provider path, and real PostgreSQL persistence after explicit confirmation.

October 19 checkpoint: local validation and boundary tests pass. The expanded live check could not complete: direct generation requests timed out; a read-only authenticated models request succeeded, but generation through the session proxy returned HTTP 504. The six-example live interpretation gate remains pending. No production proxy workaround or extra retry loop was added, and no reminders were saved by these diagnostics.

Live microphone capture and permission behavior still need hands-on checks in representative browsers/devices. Automated Chromium results do not prove a physical microphone or browser speech service works.

Implementation references: [Google structured output](https://ai.google.dev/gemini-api/docs/structured-output), [Gemini models](https://ai.google.dev/gemini-api/docs/models), and [Google SDK](https://github.com/googleapis/js-genai).
