# Text and voice capture

Open **New reminder** to type or dictate a reminder, interpret it, answer clarification questions, and review the editable draft. Only **Save reminder** creates a reminder and its schedules. **Enter manually** works without Gemini and keeps the original text available. Editing the original text starts a fresh clarification conversation.

Relative dates use the persisted settings time zone, shown beside the input. Review that setting before parsing; browser detection is only a convenience in manual entry. A date without a time stays date-only (11:59 PM locally). Missing dates, ambiguous weekdays and vague times require clarification. Server validation also rejects nonexistent/repeated DST times rather than choosing an instant silently. All confirmed fields go through the existing independent create validation.

## Provider configuration

Set `GEMINI_API_KEY` privately in `.env.local`. `GEMINI_MODEL` defaults to `gemini-3.8-flash`; model selection stays on the server. The official `@google/genai` SDK is pinned to 2.30.0. JSON-schema structured output is validated with a strict Zod schema, then calendar/zone semantics are checked with Temporal. Reminder text and clarification answers are untrusted data, separated from the system instruction. No tools or action execution are enabled.

The authenticated, same-origin `POST /api/ai/parse` accepts `{ text, clarification?: [{ question, answer }] }`. Text is limited to 4,000 characters, clarification history to five exchanges, and the request body to 32 KiB. Responses are `{ status: "clarify", question }` or `{ status: "ready", draft }`. Parsing reads the owner's preferences and only writes the shared rate-limit counter; it never creates reminders or notifications. The durable limit is ten calls per user per minute; local throttling returns `Retry-After`. Provider requests have a 25-second timeout and one attempt (no automatic retries). Unavailable credentials, provider capacity, timeout and invalid output return sanitized actionable errors; raw inputs and provider errors are not logged.

Voice uses feature-detected `SpeechRecognition`/`webkitSpeechRecognition`, starts only when the microphone button is clicked, and uses the browser language. Stop recording to edit the transcription before interpretation. Unsupported browsers, denied access, missing speech or service errors leave typing available. Recognition is aborted on navigation. Speech recognition can depend on the browser's external speech service; there is no separate application speech API or audio storage.

October 19 voice fix: capture now uses continuous recognition and waits 15 seconds after speech ends before stopping. Interim results replace the previous hypothesis rather than being appended; native browser restarts retain the accumulated transcript and do not reset the silence deadline. Explicit Stop allows final results to arrive, and permission/service failures or navigation prevent automatic restarts. Recognition accuracy still depends on the selected browser language and its speech service.

## Verification

`npm run ai:check` makes two synthetic live Gemini requests without connecting to the database: a relative-date example across a UTC/local date boundary and a vague-time clarification. Both passed on October 18, 2026. Unit checks cover structured output, fixed local context, invalid dates/DST and missing credentials. The focused browser journey uses deterministic provider responses for clarification and correction, the real unavailable-provider path, and real PostgreSQL persistence after explicit confirmation.

Live microphone capture and permission behavior still need hands-on checks in representative browsers/devices. Automated Chromium results do not prove a physical microphone or browser speech service works.

Implementation references: [Google structured output](https://ai.google.dev/gemini-api/docs/structured-output), [Gemini models](https://ai.google.dev/gemini-api/docs/models), and [Google SDK](https://github.com/googleapis/js-genai).
