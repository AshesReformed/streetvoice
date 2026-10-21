# StreetVoice

**A voice-first civic complaint line for Pakistan.** A citizen calls, speaks in their own language, and hangs up. AI transcribes, translates and routes the complaint. The right department gets it as an Urdu SMS, and the citizen gets an SMS at every step. No smartphone, app, data plan or literacy needed.

---

## The problem

Many Pakistanis still don't have a personal smartphone, but nearly everyone can make a voice call. Department apps, web portals and WhatsApp bots all assume a smartphone, data and the ability to read. That leaves out the rural, elderly, low-income and low-literacy citizens who are often the most affected by broken infrastructure.

And on the government side, a complaint only helps if it reaches someone who can act on it. Department staff often don't read English or use new software.

## How it works

```
Citizen calls ──► says the complaint in Urdu, Punjabi, Pashto, Sindhi, Saraiki…
      │           hears a 6-digit tracking number within seconds, hangs up
      ▼
AI (one Gemini call, after the caller hangs up)
      │   transcript · Urdu + English translation · one-line summary
      │   department · area · urgency · "is a human needed?"
      ▼
Department's phone ◄── Urdu SMS: "نئی شکایت 482913 (فوری) علاقہ: ماڈل ٹاؤن…"
      │                 + a no-login link to listen to the call
      │  replies "482913 OK" / "482913 DONE" by SMS
      ▼
Citizen ◄── SMS when the complaint is registered, sent to the department,
            being worked on, and resolved
```

- **Departments need no new software and no login.** They get an Urdu SMS on a phone they already have, and reply by SMS. Only the department's own number can update its complaints.
- **A control room** (web, for the team running the line) shows every complaint live. It catches the ones the AI wasn't sure about, and shows every SMS in and out.
- **Spam and floods are stopped before they cost anything.** Each number can file a few complaints an hour, blocked numbers are refused before recording, and the AI labels pranks, abuse, silence and test calls as spam. Spam never reaches a department; repeat spammers are blocked automatically for 24 hours, and the control room can block or unblock any caller.
- **Anyone can track a complaint** by number on the bilingual tracking page, or by texting the number.

## What's in this repo

| Part | Where |
| --- | --- |
| AI analyzer: one multimodal Gemini call (audio in → structured JSON out), with a fallback model | `src/lib/services/gemini-analyzer.ts` |
| Call pipeline: file instantly, analyze in the background, up to 3 attempts, then manual review | `src/lib/pipeline/process-call.ts` |
| SMS: Urdu templates, department dispatch, reply commands, signed webhook | `src/lib/sms/`, `src/app/api/sms/` |
| Web phone simulator: Urdu voice menu, keypad, microphone recording | `src/app/call/` |
| Real phone line (Twilio IVR, signature-checked), ready if funded | `src/lib/twilio.ts`, `src/app/api/telephony/` |
| No-login department page | `src/app/c/[token]/` |
| Public tracker (Urdu/English) | `src/app/track/[trackingId]/` |
| Control room | `src/app/admin/` |
| Spam and flood guard: limits per number and IP, blocklist, AI spam label | `src/lib/abuse/guard.ts`, `src/app/admin/flagged/` |
| Database, security rules (Row-Level Security) | `supabase/migrations/` |
| Offline fallback: self-hosted Whisper + NLLB + keyword routing | `src/lib/services/staged-analyzer.ts` |

## What's real and what's simulated

| Component | Status |
| --- | --- |
| Speech-to-text, translation, routing, area and urgency extraction | **Real** (Gemini). Tested on Punjabi, Pashto, Urdu, Sindhi, Saraiki and mixed Urdu-English sample calls |
| Department delivery and replies by SMS | **Real**, through an Android phone with a local SIM ([docs/SMS-PHONE.md](docs/SMS-PHONE.md)). Runs in log-only mode until the phone is connected |
| Phone number callers can dial | **Simulated** in the browser at `/call`, through the same pipeline. A real Twilio line is built but needs a paid account (Twilio's free trial isn't available in Pakistan) |
| Sample recordings and voice prompts | Generated with text-to-speech. Real callers' recordings are still needed for a fair accuracy test |

## Known limitations

- **Regional languages vary.** Urdu is strongest. Punjabi, Pashto, Sindhi and Saraiki routed correctly in our sample calls, but those were synthetic voices, not real noisy phone audio. Balochi is untested.
- **Free AI tier.** Analysis takes 10–40 seconds per call. The free tier is rate-limited and sometimes overloaded, so StreetVoice retries on a second model and through a retry sweep. A real deployment would need a paid tier, and the free tier may use submitted data to improve Google's models.
- **No department partnership yet.** Departments are reached by SMS to a number we configure. Plugging into a department's own system would need its cooperation.

## Running it locally

1. `npm install`
2. Create a Supabase project and run the files in `supabase/migrations/` in order (SQL Editor).
3. Copy `.env.example` to `.env.local` and fill in the Supabase keys, a Gemini API key ([aistudio.google.com](https://aistudio.google.com), free) and the demo passwords.
4. `npm run seed:officers` creates the control-room logins. `npm run seed:demo` adds about 50 sample complaints (optional).
5. `npm run dev`, then open:
   - `localhost:3000/call` to make a call
   - `localhost:3000/login` for the control room (`admin@streetvoice.pk`)
   - `localhost:3000/track/<number>` to track a complaint

Going online: [docs/DEPLOY.md](docs/DEPLOY.md). Real SMS: [docs/SMS-PHONE.md](docs/SMS-PHONE.md).

### Useful scripts

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests (Vitest) |
| `npm run try:analyzer -- <file or folder>` | Run the AI on recordings and print what it extracted |
| `npm run make:samples` / `npm run make:prompts` | Regenerate sample calls / Urdu voice prompts with Gemini TTS |

## Demo script (3 minutes)

1. **Call.** Someone opens `/call` on their phone, enters their number, presses 2 for Punjabi and describes a sparking transformer in their area. They hear a 6-digit number and get an SMS.
2. **AI.** In the control room, the complaint appears with an English summary, the area and "high" urgency, routed to Electricity.
3. **Department.** A teammate's phone (playing the Electricity department) receives the complaint in Urdu, opens the link to hear the call, and replies `<number> DONE`.
4. **Close the loop.** The caller's phone gets "your complaint has been resolved". The tracker and the SMS page show every step.

## Roadmap

- Real callers' recordings to measure routing accuracy per language
- A real phone number once funded (the Twilio integration is built)
- A partnership with one city's complaint cell, to route into their existing system
- WhatsApp voice notes as a second channel
