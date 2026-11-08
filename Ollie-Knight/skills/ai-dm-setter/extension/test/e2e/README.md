# End to end test

Runs real Google Chrome with this extension against the app and a local stand-in for Instagram. Nothing touches instagram.com.

1. In this folder, make a throwaway certificate: `openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 30 -subj "/CN=www.instagram.com" -addext "subjectAltName=DNS:www.instagram.com"`
2. Start the app on port 3000 with scratch data and no waiting between sends: `SETTER_DATA_DIR=/tmp/setter-e2e SETTER_OUTREACH_GAP_SCALE=0 PORT=3000 node ../../../web/scripts/serve.mjs`
3. `node fake-ig.mjs` in one terminal, `node run.mjs` in another (add `--headed` to watch it).

It sends five tasks: a normal send, a profile that does not exist, a business name with no first name, an assisted send, and a profile that shows an Instagram warning. Expect 23 passes.
