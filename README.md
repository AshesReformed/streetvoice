# StreetVoice

**A voice-first civic complaint platform for Pakistan.** Citizens dial an ordinary phone number, speak a complaint in their own language, and it's automatically transcribed, translated, classified, and routed to the correct government department — no smartphone, no app download, no data plan, no literacy requirement.

---

## The Problem

Over 40% of Pakistanis still lack access to a personal smartphone, yet nearly everyone has access to a basic voice call — including feature-phone users. Existing civic complaint tools (department apps, web portals, WhatsApp bots) all assume a smartphone, mobile data, and app-store access, structurally excluding the rural, elderly, low-income, and low-literacy citizens who are often the ones most affected by broken infrastructure and least able to make themselves heard.

StreetVoice's goal: any citizen, on any phone, in their own spoken language, can lodge a trackable complaint with the correct authority.

---

## What's Real vs. Simulated

Built with zero budget and no government API access, per the project's founding constraints. Every AI capability was built as a **pluggable service interface** from day one specifically so mock and real implementations could be swapped without touching any business logic — this is why the honest gaps below are swap-outs, not missing features.

| Component | On your machine (localhost) | On the live deployment |
|---|---|---|
| Speech-to-text (Whisper) | **Real** — self-hosted, runs fully offline | Mocked — see *Hosting constraint* below |
| Translation (NLLB) | **Real** — self-hosted, runs fully offline | Mocked — see *Hosting constraint* below |
| Department classification/routing | **Real** | **Real** |
| Department data isolation (Row-Level Security) | **Real**, verified by automated tests and manual login testing | **Real** |
| Officer portal (queue, audio playback, transcripts, status updates) | **Real** | **Real** |
| Admin portal (departments, officers, re-routing, audit log, needs-review triage) | **Real** | **Real** |
| Status history / audit trail | **Real** — database-trigger enforced, cannot be bypassed | **Real** |
| Telephony (a real phone number) | Built and tested against Twilio's actual TwiML/webhook contract — see *Telephony* below | Not connected |
| Demo call trigger | "Simulate a test call" button — calls the **exact same production webhook and pipeline** a real call would use | Same |

The "Simulate a test call" feature is not a shortcut around the real system — it exercises the identical `/api/calls/webhook` → ASR → translation → classification → routing pipeline that a genuine phone call would trigger. It exists because acquiring real, always-on telephony was never assumed to be achievable within this project's budget and timeline.

---

## Why the Live Deployment Runs Mocked AI

This wasn't a shortcut — it was tested, and here's what we found. Real Whisper and NLLB models were fully wired in and verified with real recordings on a local machine, including finding and fixing a genuine memory leak (models weren't being released after use). Even after that fix, the models' combined footprint doesn't fit inside Render's free-tier 512MB memory limit — the deployment repeatedly crashed with out-of-memory errors, both with both models running and with each individually. This is a hosting-tier resource ceiling, not a code defect. The live deployment runs mocked ASR/translation as a documented, honest consequence of building on free infrastructure; the full real pipeline is provable on request or via a local run.

---

## Telephony: Built, and Genuinely Blocked by Something Outside Our Control

A complete Twilio integration exists in this codebase: real webhook signature validation (HMAC, using Twilio's own SDK), a multi-step IVR flow (language menu → recording → transcription → spoken tracking-ID confirmation), and full test coverage for the TwiML contract. It was never connected to a live, publicly-dialable number for one reason: Twilio's free trial is unavailable in Pakistan, and enabling a real number requires paying to upgrade the account — which directly conflicts with this project's zero-budget constraint. This is not specific to Twilio; it reflects how strictly many countries regulate international telecom/VoIP traffic, and other providers were assessed as likely to hit the same regional restriction. The engineering for this feature is complete; connecting it to a real line is a funding/regulatory question, not a technical one.

---

## Known Limitations (Found Through Real Testing, Not Assumed)

- **Regional language coverage is uneven.** Whisper transcribes Urdu reliably; coverage for Punjabi, Pashto, Sindhi, Saraiki, and Balochi is weaker, consistent with published multilingual ASR benchmarks.
- **Code-switching (mixed-language speech) is a real failure mode.** Testing with a genuine Urdu-English mixed recording showed Whisper can lock onto the wrong detected language for the whole clip and produce fluent, plausible-sounding — but wrong — text, rather than failing obviously. This is a known, unsolved challenge in current open-source ASR generally, not specific to this implementation.
- **ASR confidence is an approximation, not a true accuracy signal.** A library limitation (`@xenova/transformers` doesn't expose token-level probabilities) means confidence is estimated from the ratio of audio detected as speech versus silence. A fluently-spoken but wrongly-detected-language clip can still score a misleadingly high confidence.
- **Classification originally required matching most of a department's keyword list** to route correctly — nearly impossible for real, short complaints that naturally mention a topic once. This was found via real testing and fixed to route on a single strong keyword match instead, deliberately trading a small risk of over-eager routing for actually catching real complaints — a considered tradeoff, not an oversight.

---

## Architecture

- **Frontend/backend:** Next.js (App Router), deployed on Render
- **Database/Auth/Storage:** Supabase (Postgres, with Row-Level Security enforcing department isolation at the database layer — not just in application code)
- **Speech-to-text:** OpenAI Whisper (`whisper-small`, quantized), self-hosted via `@xenova/transformers` — no external API, no per-request cost
- **Translation:** Meta NLLB-200 (distilled 600M variant), self-hosted the same way
- **Classification:** Keyword-based routing engine, admin-editable department keyword lists
- **Telephony (built, not live):** Twilio SDK, TwiML-based IVR

All AI services are implemented behind swappable TypeScript interfaces (`ASRService`, `TranslationService`) with both mock and real implementations, controlled by environment variables (`ASR_PROVIDER`, `TRANSLATION_PROVIDER`) — the same code runs a full demo pipeline or the full real pipeline with zero logic changes.

---

## Running It Locally

1. Create a Supabase project and run the three migration files in `supabase/migrations/` in order via the SQL Editor.
2. Copy `.env.example` to `.env.local` and fill in your Supabase URL/keys.
3. Set `ASR_PROVIDER=whisper` and `TRANSLATION_PROVIDER=nllb` to run the real AI pipeline (leave as `mock` for instant, lightweight testing).
4. Run `npm install`, then `npm run seed:officers` to create demo accounts.
5. `npm run dev`, then open `localhost:3000`.

Demo login credentials are available on request rather than published here, since this repository is public.

---

## Roadmap

- Move AI inference to a higher-memory host (or split ASR/translation into a separate always-on process) to run the real pipeline live, not just locally
- Pursue a funded or regionally-compatible telephony path to connect the existing, tested Twilio integration to a real number
- Fine-tune ASR on open regional-language datasets (e.g., Mozilla Common Voice) to close the Punjabi/Pashto/Sindhi/Saraiki/Balochi coverage gap
- Formal partnership with a government department or telecom operator, since no such access exists at this stage