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

### 3. Create a key for the app
1. **IAM & Admin → Service accounts → Create service account**. Name: `fitting-room`.
2. Grant role **Vertex AI User** → Done.
3. Open the service account → **Keys → Add key → Create new key → JSON**. A `.json` file downloads.
4. Put it in `.env` as **one line**:
   ```bash
   # from the repo folder, replace the path with your downloaded file:
   echo "GOOGLE_APPLICATION_CREDENTIALS_JSON=$(tr -d '\n' < ~/Downloads/immerse-fitting-room-xxxx.json)" >> .env
   ```
   Then delete the downloaded file or keep it out of the repo. Share it with teammates privately (not on GitHub
   or Slack channels).
5. In `.env` also set `GOOGLE_CLOUD_PROJECT=<your project id>` and leave `GOOGLE_CLOUD_LOCATION=global`.

### 4. Budget alert (recommended)
**Billing → Budgets & alerts → Create budget**, $20, alerts at 50/90/100%.

### 5. Check it works
```bash
npm run dev
curl -s -X POST localhost:3000/api/avatar -H 'content-type: application/json' \
  -d '{"description":"woman in her 20s with curly black hair"}' | head -c 200
```
You should see `{"image":"data:image/png;base64,...`. If you see a "model not found" error, open
**Vertex AI → Model Garden**, search "Gemini Flash Image", and put the exact model ID it shows in
`GEMINI_IMAGE_MODEL` in `.env` (try `GOOGLE_CLOUD_LOCATION=us-central1` if `global` doesn't list it).

## Running on the Quest 2
The Quest Browser needs HTTPS (or `localhost`) for WebXR and the mic.
- **Quick:** deploy to Vercel (`npx vercel`), add the same env vars in the Vercel project settings, open the URL
  in the Quest Browser.
- **Local:** an HTTPS tunnel such as `npx cloudflared tunnel --url http://localhost:3000`, then open the printed
  `https://…trycloudflare.com` URL on the headset.
