# Google sign-in and the public demo

BandIt lets anyone play the demo or sign in with a verified Google account for a separate studio on their device.

## Why

Each account and the public demo get separate IndexedDB libraries so players sharing a browser can keep their own drawings and mixes.

## How it works

Choose **See demo** below the sign-in button to open `?demo` without an account.
It uses the site's configured provider keys for live features.

After **Continue with Google**, the **Your API keys** prompt accepts optional Gemini and ElevenLabs keys for photo recognition and generated sounds.
**Skip for now** or an empty field uses the site's quota for that provider.
Use the **API keys** button in the studio to change or clear either key.
Personal keys stay in page memory, travel through BandIt's server to the corresponding provider on demand, and are forgotten on reload or sign-out.
A rejected personal key reports an error for that feature.
Signing out returns open signed-in tabs to the login page.

### Hosting configuration

Set `GEMINI_API_KEY` and `ELEVENLABS_API_KEY` on the server to enable shared photo recognition and sound generation respectively.
Use the ignored `.env.local` for Vite or the deployment environment for Vercel.
Static hosting supports sketch recognition, beatbox, synthesized sounds, and bundled or previously cached recordings.
Camera recognition and live sound generation need the API endpoints.

BandIt's public Auth0 SPA and API identifiers are in [the shared configuration](../auth/config.ts).
To use a different tenant, override all three public values in the [environment example](../.env.example) at build time and in the API runtime.
The optional `VITE_AUTH0_OWNER_SUB` assigns the existing `pocket-band` drawing library to its original account.
Provider secrets belong in server variables and must never use the `VITE_` prefix.

### Auth0 configuration

1. Create a **Single Page Application** and enable its **Google** (`google-oauth2`) connection.
   Configure the connection with your Google OAuth credentials for production. [Google connection guide](https://developer.auth0.com/resources/labs/authentication/google-social-connection-to-login)
2. Under **URLs**, add the studio URL to **Allowed Callback URLs** and **Allowed Logout URLs**, including the trailing slash.
   Register the origin without a trailing slash in **Allowed Web Origins**.
   BandIt uses `https://www.bandit.select/`, `http://localhost:5173/` and `http://localhost:4173/`.
3. Register a custom **RS256** API with the configured audience and allow delegated access for the BandIt SPA.
4. Attach the following **Post Login** action to the **Login** trigger and set `BANDIT_CLIENT_ID` to the SPA's public client ID.

```js
exports.onExecutePostLogin = async (event, api) => {
  if (event.client.client_id !== event.secrets.BANDIT_CLIENT_ID) return;
  if (event.connection.strategy !== 'google-oauth2' || event.user.email_verified !== true) {
    api.access.deny('Sign in with a verified Google account to use BandIt.');
  }
};
```

## Key files

- [Studio session](../src/auth.ts) handles sign-in callbacks, library names, and API credentials.
- [API access](../server/access.ts) authorizes signed-in and demo requests for both providers.
- [Local library](../src/library.ts) persists instruments, slot assignments, and musical parts.

## Decisions and gotchas

The browser uses the Auth0 authorization code flow with PKCE and keeps tokens in memory.
The API validates the token signature, issuer, audience, client, expiry and Google subject on signed-in requests.
The studio marks public demo requests with `X-BandIt-Demo: 1`.

## Related

- [Object recognition](recognition.md)
- [Object sounds and caching](sounds.md)
