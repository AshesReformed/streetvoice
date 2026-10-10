# Real SMS from a Pakistani SIM

StreetVoice sends and receives SMS through a spare Android phone running the free, open-source **SMS Gateway for Android** app ([sms-gate.app](https://sms-gate.app)). The phone sends from its own SIM, so messages come from a normal Pakistani number. Costs are only that SIM's SMS bundle.

## You need

- Any Android phone (Android 5 or newer) with a SIM that has an SMS bundle
- The phone charged and online (Wi-Fi or mobile data) during the demo

## Setup (about 10 minutes)

1. On the phone, install **SMS Gateway for Android** from Google Play or from [github.com/capcom6/android-sms-gateway](https://github.com/capcom6/android-sms-gateway/releases).
2. Open it, turn on **Cloud server**, and allow SMS permissions.
3. The app shows a **username** and **password**. Put them in `.env.local` (and in Render's Environment tab):

   ```
   SMS_PROVIDER=android
   SMS_GATEWAY_USERNAME=<username from the app>
   SMS_GATEWAY_PASSWORD=<password from the app>
   ```

4. In the app, go to **Settings → Webhooks → Signing key**, set a long random password of your own, and put the same text in `SMS_WEBHOOK_SIGNING_KEY`.
5. Register the webhooks once, after deploying. These are incoming SMS plus delivery reports, so the SMS page shows whether each message really went out:

   ```bash
   for e in sms:received sms:sent sms:delivered sms:failed; do
     curl -X POST -u "USERNAME:PASSWORD" -H "Content-Type: application/json" \
       -d "{\"url\":\"https://<your-app>.vercel.app/api/sms/incoming\",\"event\":\"$e\"}" \
       https://api.sms-gate.app/3rdparty/v1/webhooks
   done
   ```

6. In the control room, open **Departments** and give each department an **SMS number**. For the demo, use a teammate's phone as "the Electricity department".

## Test it

1. Make a call at `/call` and enter your own number for SMS updates.
2. You get "complaint registered" by SMS, and the teammate's phone gets the complaint in Urdu with a link.
3. The teammate replies `<number> OK`, then `<number> DONE`. You get an SMS for each step.
4. Everything appears live on the control room's **SMS** page.

## If something goes wrong

- **"Generic failure" on the SMS page:** the phone tried but its SIM could not send. Send a normal SMS from the phone's Messages app to check the SIM has an active SMS bundle or balance, and that it is the default SIM for SMS.
- **Android blocks the SMS permission:** apps installed from outside the Play Store need Settings → Apps → SMS Gateway → ⋮ → **Allow restricted settings** first.

- **Nothing is sent:** check that the phone is online and the app shows "connected". Failed sends are marked "failed" on the SMS page, with the reason.
- **Replies are ignored:** the webhook must point at the public URL, and the reply must come from the number saved on that department.
- **Without a phone:** the SMS page has a "Test an incoming SMS" form that runs the same reply handling.
