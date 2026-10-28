# Text and voice capture

Open **New reminder** to type or dictate a reminder, interpret it, answer clarification questions, and review the editable draft. Only **Save reminder** creates a reminder and its schedules. **Enter manually** works without Gemini and keeps the original text available. Editing the original text starts a fresh clarification conversation.

Repeating phrases such as **every Sunday at 2 PM** now produce daily/weekly/monthly rules in the same confirmation form. The description is a polished summary of the event/context/preparation actually spoken, without invented participants, agendas, places or tasks. See [recurrence policies](./recurrence.md) for intervals, selected weekdays, month-day handling, advance notifications and whole-series completion.

Relative dates use the persisted settings time zone, shown beside the input. Review that setting before parsing; browser detection is only a convenience in manual entry. A date without a time stays date-only (11:59 PM locally), except the explicit **before-date** rule below. Missing dates, ambiguous weekdays and vague times require clarification. Server validation also rejects nonexistent/repeated DST times rather than choosing an instant silently. All confirmed fields go through the existing independent create validation.

## Interpretation rules (owner amendment, October 19)

- **Before January 1, 2027**, with no clock time, means **December 31, 2026 at 23:59** in the interpretation zone. The model returns the referenced date and `deadlineRelation: before_date`; the server subtracts one calendar day using Temporal and validates the resulting instant. The review explains this conversion beside the editable fields.
- **By/on January 1**, without a clock time, retains January 1 as a date-only deadline (23:59). Explicit clock times are preserved; midnight/12 AM means 00:00 at the beginning of the named date, and noon/12 PM means 12:00. No arbitrary additional lead time is invented.
- Obvious transcription mistakes may be repaired from context, such as “tomorrow at ate a.m.” → 08:00. Uncertain names, numbers, dates or competing meanings require one focused question. This is a model instruction, not a guarantee of perfect speech interpretation; the original text stays available and the owner confirms the editable result.
- This remains one bounded structured provider request per interpretation, with no tools, secondary agent, automatic reminder creation or extra model correction pass. Notification thresholds remain the agreed 50/75/90% formula; this amendment changes deadline interpretation only.

## Provider configuration

Set `GEMINI_API_KEY` privately in `.env.local`. `GEMINI_MODEL` defaults to `gemini-3.5-flash-lite`; model selection stays on the server. The official `@google/genai` SDK is pinned to 2.30.0. JSON-schema structured output is validated with a strict Zod schema, then calendar/zone semantics are checked with Temporal. Reminder text and clarification answers are untrusted data, separated from the system instruction. No tools or action execution are enabled.

The default `gemini-3.5-flash-lite` uses `ThinkingLevel.LOW` for this bounded extraction task. The former `gemini-3.8-flash` override also uses low; other custom models retain their provider defaults to avoid sending an unsupported thinking option. The supported low setting plus an explicit by-date example preserves the distinction between before-date and by-date deadlines. See [Google thinking configuration](https://ai.google.dev/gemini-api/docs/generate-content/thinking.md).

The authenticated, same-origin `POST /api/ai/parse` accepts `{ text, clarification?: [{ question, answer }] }`. Text is limited to 4,000 characters, clarification history to five exchanges, and the request body to 32 KiB. Responses are `{ status: "clarify", question }` or `{ status: "ready", draft, interpretation? }`. Parsing reads the owner's preferences and only writes the shared rate-limit counter; it never creates reminders or notifications. The durable limit is ten calls per user per minute; local throttling returns `Retry-After`. Provider requests have a 25-second timeout and one attempt (no automatic retries). Unavailable credentials, provider capacity, timeout and invalid output return sanitized actionable errors; raw inputs and provider errors are not logged.

Voice uses feature-detected `SpeechRecognition`/`webkitSpeechRecognition`, starts only when the microphone button is clicked, and uses the browser language. Stop recording to edit the transcription before interpretation. Unsupported browsers, denied access, missing speech or service errors leave typing available. Recognition is aborted on navigation. Speech recognition can depend on the browser's external speech service; there is no separate application speech API or audio storage.

October 19 voice fix: capture now uses continuous recognition and waits 15 seconds after speech ends before stopping. Interim results replace the previous hypothesis rather than being appended; native browser restarts retain the accumulated transcript and do not reset the silence deadline. Explicit Stop allows final results to arrive, and permission/service failures or navigation prevent automatic restarts. Recognition accuracy still depends on the selected browser language and its speech service.

## Verification

`npm run ai:check` makes eleven synthetic live Gemini requests without connecting to the database: weekly recurrence with supplied preparation/description, a relative-date example across a UTC/local date boundary, vague-time clarification, before-date/year boundary, by-date retention, a clear transcription error and midnight. The original seven passed on October 19, 2026 with the recurrence-aware prompt. Four task-list cases were added October 28. Run `node --import tsx scripts/ai-check.ts --recurrence` for only the targeted recurrence/description check. Unit checks cover structured output, fixed local context, before-date arithmetic across year/leap-day boundaries, invalid dates/DST and missing credentials. The focused browser journey uses deterministic provider responses for clarification and correction, the real unavailable-provider path, and real PostgreSQL persistence after explicit confirmation.

Earlier October 19 requests timed out or returned HTTP 504; those were recorded as pending rather than claimed as successful. The subsequent recurrence checkpoint completed all seven requests successfully, closing that synthetic interpretation gate. No production proxy workaround or extra retry loop was added, and no reminders were saved by these diagnostics. Live physical microphone accuracy remains a separate device check.

Live microphone capture and permission behavior still need hands-on checks in representative browsers/devices. Automated Chromium results do not prove a physical microphone or browser speech service works.

Implementation references: [Google structured output](https://ai.google.dev/gemini-api/docs/structured-output), [Gemini models](https://ai.google.dev/gemini-api/docs/models), and [Google SDK](https://github.com/googleapis/js-genai).

## October 20 diagnostic checkpoint

Firefox release builds do not expose the speech-recognition API used by this version; microphone permission alone does not add it. The unsupported-browser message now names speech recognition and points to Chrome or typing. Chrome recording behavior is unchanged. See [MDN browser compatibility data](https://github.com/mdn/browser-compat-data/blob/main/api/SpeechRecognition.json).

Current generation availability is unresolved: model metadata lookup succeeded in 952 ms using the configured key/model, while a minimal synthetic `Reply with OK` generation returned upstream HTTP 504 after 19.4 seconds. Both synthetic plant-watering parses failed at roughly 23 seconds, and a separate 60-second generation diagnostic was aborted without a result. These checks do not identify whether the timeout originates at Google or an intermediate gateway. No owner transcript was sent. The application now treats upstream 408/504 responses as timeouts even when they arrive before its own 25-second deadline. No model switch, automatic retry, speech fallback, database write or email was introduced. Existing parser/recurrence unit checks pass; live generation remains pending recovery of the upstream path.

## October 20 model investigation and resolution

The actual SDK error from the former configured model, `gemini-3.8-flash`, was HTTP 504 with provider status `DEADLINE_EXCEEDED` and message `Deadline expired before operation could complete.` A minimal prompt without parsing instructions, JSON schema or recurrence also failed. Direct REST generation timed out independently of the SDK, while metadata/model listing worked. This isolates the observed generation-path failure from the recent parsing-flow changes; it does not establish the underlying infrastructure cause or a permanent model outage.

`gemini-2.5-flash-lite` appeared in the model list but returned HTTP 404: unavailable to new users, recommending `gemini-3.5-flash-lite`. The 3.5 model returned a minimal response in about 1.5 seconds. All seven existing live synthetic parsing checks then passed using 3.5 Flash-Lite with low thinking and an explicit by-date prompt example: recurrence/description, local relative date, vague-time clarification, before-date, by-date, transcription repair and midnight. The first candidate run confused by with before; the final configuration corrects that example rather than weakening the date-policy checks.

Changed the application default, sample environment, local configured model and smoke-command default to `gemini-3.5-flash-lite`. No microphone code, repeating-event behavior, retries, billing setup or credentials changed. All live requests used synthetic examples and saved nothing.

Google documents [free-tier text input/output](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite) for the stable model. This is a free-tier option, not unlimited or guaranteed free capacity. Exact RPM/TPM/RPD depend on the project's tier and are visible in [AI Studio](https://aistudio.google.com/rate-limit); [Google's rate-limit guide](https://ai.google.dev/gemini-api/docs/rate-limits) says actual capacity may vary. A successful model request does not establish this project's billing tier, so no billing or unlimited-availability claim is made.

## October 26 Android recording compatibility

The owner observed growing repeated phrases in Chrome/Brave on Android while Chrome desktop worked. Android now uses non-continuous native recognition sessions, with the existing automatic restart and 15-second inactivity window preserving the app-level recording experience. Desktop continuous mode is unchanged. Each native session still replaces its interim snapshot; no text deduplication removes intentional repeated words.

Chromium's Android adapter [documents promotion of provisional results in continuous mode](https://chromium.googlesource.com/chromium/src/+/b29b632278fb50dd05453105533064ea189050ae/content/public/android/java/src/org/chromium/content/browser/SpeechRecognitionImpl.java), a plausible cause of the observed cumulative phrases. The change avoids that mode instead of guessing which user words to delete. Physical Android verification remains required.

Speech-service network/availability failures now have a separate message from microphone permission denial; audio-capture and unsupported-language failures also identify the relevant problem. Stale errors from an ended session cannot stop a replacement session. Brave may expose recognition APIs without an operational service; permission alone is not proof of support. No alternate audio provider, microphone diagnostics UI or automatic network retry loop was added.

## October 28 grouped tasks and clarification answers

A list of steps, topics or errands sharing one reminder schedule becomes one editable reminder, not a question asking the user to choose a main task. The parser generates a concise umbrella title and retains all supplied actions/details in the description. It does not invent specific library names or discard items. The latest clarification can explicitly group the items; that answer is legitimate reminder intent, while attempts to override the schema, reveal secrets or execute actions remain untrusted.

“Same day next week” means seven local calendar days later. An explicit “before 9 AM” retains 09:00 on that date rather than applying the previous-day rule reserved for before-date inputs without a clock time. Genuinely separate reminders with different deadlines still require a focused scheduling question; missing/vague dates and times remain subject to clarification. No extra AI calls or multi-reminder creation flow were added.

Run `node --import tsx scripts/ai-check.ts --lists` for four synthetic live scenarios: study list with generated title and all description items, the same list after an answered grouping question, unrelated errands with one shared deadline, and explicitly separate deadlines that must not be silently merged. All four passed on the configured provider October 28. The owner's actual transcript was not sent by this check, and no reminder or email was created.
