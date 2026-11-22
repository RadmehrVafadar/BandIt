# Google sign-in and the public demo

BandIt lets anyone play the demo or sign in with a verified Google account for a separate studio on their device.

## Using the studio

Choose **See demo** below the sign-in button to open `?demo` without an account.
**Continue with Google** opens a separate studio and offers the **Your API keys** prompt.
**Skip for now** opens the studio for drawing, beatbox, bundled clips and sounds from the shared cache.

In either mode, use **API keys** to add your own Gemini key for photo recognition or ElevenLabs key for sound generation.
The **Camera** button opens the keys dialog when a Gemini key is needed.
You can change or clear either key in **API keys**.
Personal keys stay in page memory, travel through BandIt's server to the corresponding provider on demand, and are forgotten on reload or exit.
A rejected personal key reports a feature error.

The browser stores each account's drawings in a separate IndexedDB library and keeps another library for the demo.
Signing out returns open signed-in tabs to the login page.
Personal-key requests cache clips by object and account when signed in, or by object and a hash of the ElevenLabs key in the demo.

## Hosting configuration

Vercel API functions and Vite's development and preview servers handle photo recognition and sound generation.
Static hosting serves sketch recognition, beatbox, bundled clips and synthesized sounds.

BandIt's public Auth0 SPA and API identifiers are in [the shared configuration](../auth/config.ts).
To use a different tenant, override all three public values in the [environment example](../.env.example) at build time and in the API runtime.
The optional `VITE_AUTH0_OWNER_SUB` assigns the existing `pocket-band` drawing library to its original account.

## Auth0 configuration

1. Create a **Single Page Application** and enable its **Google** (`google-oauth2`) connection.
   Configure the connection with your Google OAuth credentials for production. [Google connection guide](https://developer.auth0.com/resources/labs/authentication/google-social-connection-to-login)
2. Under **URLs**, add the studio URL to **Allowed Callback URLs** and **Allowed Logout URLs**, including the trailing slash.
   Register the origin without a trailing slash in **Allowed Web Origins**.
   BandIt uses `https://www.bandit.select/`, `http://localhost:5173/` and `http://localhost:4173/`.
3. Register a custom **RS256** API with the configured audience and allow delegated access for the BandIt SPA.
4. Attach the following **Post Login** action to the **Login** trigger and set `BANDIT_CLIENT_ID` to the SPA's public client ID.
   It applies the Google and email verification checks to BandIt.

```js
exports.onExecutePostLogin = async (event, api) => {
  if (event.client.client_id !== event.secrets.BANDIT_CLIENT_ID) return;
  if (event.connection.strategy !== 'google-oauth2' || event.user.email_verified !== true) {
    api.access.deny('Sign in with a verified Google account to use BandIt.');
  }
};
```

The browser uses the Auth0 authorization code flow with PKCE and keeps tokens in memory.
The API validates the token signature, issuer, audience, client, expiry and Google subject on signed-in requests.
Public demo requests are explicitly marked.
Live provider calls in both modes use the visitor-supplied key.
