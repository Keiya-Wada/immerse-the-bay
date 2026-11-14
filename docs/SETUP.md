# Setup

You need two sets of credentials, both kept in `.env` (git-ignored, never commit it):

| What | Used for | Where it comes from |
|---|---|---|
| `REACTOR_API_KEY` | Orbis live video | Team key from the **Visko table** (starts with `rk_`) |
| Google Cloud project + service-account key | Gemini image model on **Vertex AI** (avatar + try-on images) | Steps below |

```bash
cp .env.example .env     # then fill it in
npm install
npm run dev              # http://localhost:3000  (Orbis sandbox at /studio)
```

## Google Cloud / Vertex AI (about 15 minutes)

Why Vertex and not an AI Studio API key: the $300 free-trial credit **does not cover** Gemini through AI Studio,
but it does cover Vertex AI.

### 1. Create the account and start the trial
1. Use a Google account that has **never had Google Cloud before** (the trial is for new customers only).
2. Go to <https://cloud.google.com/free> → **Get started for free**. A card is required; it isn't charged when the
   trial ends unless you choose to upgrade.

### 2. Create a project and turn on Vertex AI
In the Cloud Console (<https://console.cloud.google.com>):
1. Project picker (top bar) → **New project** → name it `immerse-fitting-room` → Create. Note the **Project ID**.
2. Open <https://console.cloud.google.com/apis/library/aiplatform.googleapis.com>, make sure the new project is
   selected, click **Enable**.

### 3. Log the app in (laptop)
New Google Cloud organizations usually block downloading service-account keys, so locally the app uses your own
Google login, stored in its own folder so it doesn't touch any other gcloud login on your machine:
```bash
CLOUDSDK_CONFIG=$HOME/.config/gcloud-fitting-room gcloud auth application-default login
CLOUDSDK_CONFIG=$HOME/.config/gcloud-fitting-room gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```
Then in `.env`:
```
GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID
GOOGLE_CLOUD_LOCATION=global
GOOGLE_APPLICATION_CREDENTIALS=/Users/<you>/.config/gcloud-fitting-room/application_default_credentials.json
```
For deploying (Vercel) a service-account key is needed instead (`GOOGLE_APPLICATION_CREDENTIALS_JSON`); that
requires turning off the "Disable service account key creation" org policy first.

### 4. Budget alert (recommended)
**Billing → Budgets & alerts → Create budget**, $20, alerts at 50/90/100%.

### 5. Check it works
```bash
npm run dev
curl -s -X POST localhost:3000/api/avatar -H 'content-type: application/json' \
  -d '{"description":"woman in her 20s with curly black hair"}' | head -c 200
```
You should see `{"image":"data:image/png;base64,...`. If you see a "model not found" error, the model ID is
unavailable to your project: set `GEMINI_IMAGE_MODEL` / `GEMINI_TEXT_MODEL` in `.env` to one that is
(tested working Nov 2026: `gemini-2.5-flash-image` for images, `gemini-3.8-flash` for text;
`gemini-2.5-flash` returns 404 on new projects).

## Running on the Quest 2
The Quest Browser needs HTTPS (or `localhost`) for WebXR and the mic.
- **Quick:** deploy to Vercel (`npx vercel`), add the same env vars in the Vercel project settings, open the URL
  in the Quest Browser.
- **Local:** an HTTPS tunnel such as `npx cloudflared tunnel --url http://localhost:3000`, then open the printed
  `https://…trycloudflare.com` URL on the headset.
