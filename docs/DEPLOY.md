# Putting StreetVoice online

StreetVoice runs on Vercel's free Hobby plan, which needs no card. It talks to Supabase, Gemini and, optionally, an Android SMS phone. All of these are free except the SIM's SMS bundle.

Live demo: **https://streetvoice.vercel.app**

## 1. Create the Vercel project

1. Sign up at [vercel.com](https://vercel.com) → **Hobby** → **Continue with GitHub**.
2. **Add New… → Project**, then **Import** the `streetvoice` repository. The framework is detected as Next.js. Leave the build settings as they are.
3. Add these environment variables:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page, the anon / public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page, the **service_role** secret key |
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) → Get API key |
| `WEBHOOK_SECRET` | Any long random string (the same one as in `.env.local`) |
| `AI_PROVIDER` | `gemini` |
| `SMS_PROVIDER` | `mock` until the SMS phone is set up, then `android` |
| `PUBLIC_BASE_URL` | Optional: your site's address. Defaults to the Vercel production domain |

4. Click **Deploy**. Then open `https://<your-app>.vercel.app/api/health`, which should say `healthy`.

Every push to `main` deploys automatically. After changing environment variables, redeploy from the **Deployments** tab (⋯ → Redeploy).

## 2. Retry job (recommended)

If the AI is busy (the free tier sometimes is), a complaint waits in "Processing". A free scheduler can retry those every 5 minutes:

1. Sign up at [cron-job.org](https://cron-job.org) (free).
2. Create a job:
   - URL: `https://<your-app>.vercel.app/api/jobs/process-pending`
   - Method: `POST`
   - Header: `x-webhook-secret: <WEBHOOK_SECRET>`
   - Schedule: every 5 minutes

## 3. Demo accounts

Run `npm run seed:officers` locally (it uses `.env.local`). The control-room login is `admin@streetvoice.pk` with the password from `SEED_ADMIN_PASSWORD`. Run `npm run seed:demo` to fill the dashboards with about 50 sample complaints, and `npm run seed:demo -- --clear` to remove them.

## 4. Switching things off

- `SIMULATOR_ENABLED=false` turns off the public `/call` page.
- `SMS_PROVIDER=mock` logs SMS on the SMS page instead of sending them.

## Render (alternative)

`render.yaml` describes the same app as a Render web service. Render's free plan now asks for a card, which is why the demo runs on Vercel.
