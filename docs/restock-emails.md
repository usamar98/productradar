# Restock emails

Customers choose an exact configuration and a retailer. Apple pickup alerts also match the selected US store. PlayStation Direct and NVIDIA Marketplace alerts cover their US online listings. The first free alert lasts 14 days and starts after the customer confirms their email.

## Run the complete flow locally

### Send a real email to the Resend account owner

In the main app's local `.env`, set `RADAR_RESEND_LOCAL_OAUTH=true`, `RADAR_LOCAL_MAILBOX=false`, `EMAIL_FROM="Restock Radar <onboarding@resend.dev>"` and `RADAR_RESEND_TEST_TO` to the email you use to sign in to Resend. Run `npm run email:connect`, open the printed loopback link, and approve the send-only grant. The local web app and worker share the encrypted grant under `.local` and renew it on use. If access was revoked, run `npm run email:connect -- --reconnect`. [Resend OAuth](https://resend.com/docs/guides/building-a-resend-oauth-client)

Run `npm run email:test` to send the account owner one delivery test per UTC day. The message identifies the original official-store observation time if one is available. The command prints Resend's acceptance ID. The `--dry-run` option previews the selected observation and `--wait` waits for an open authorization session. To send to customers, use the verified sender and server credentials described below. [Resend default sender](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)

For a single-step owner delivery test, `npm run email:setup` keeps a connection link open at `http://127.0.0.1:3424/connect` until you authorize. It sends the dated test immediately after approval and reports the result in the browser.

### Exercise simulated restocks in the local inbox

Start PostgreSQL and configure the isolated database and loopback settings described in [local testing](local-testing.md). In two terminals, run the following commands.

```sh
npm run local-test:setup
npm run local-test
```

```sh
npm run test:alerts:local
```

The test enrolls three unique test addresses, opens each confirmation, and publishes signed inventory updates over HTTP. It checks the displayed availability, one captured email per restock, the exact retailer redirect, replay handling, older reports and pause behavior. It pauses its own alerts and returns the three samples to out of stock. The email bodies stay in the isolated local inbox for up to 24 hours.

To try it by hand, open the [local test lab](http://localhost:3001/local-test). Choose a product, mark it out of stock and select **Set a free alert**. Confirm the signup in the [local inbox](http://localhost:3001/local-inbox), then mark that same product in stock. The server and worker run independently of the shopper's browser.

## Connect a supplier and a sender

1. Seed the catalog with `npm run db:seed`. Arrange an inventory stream with a supplier that can report exact manufacturer stock and, for Apple, individual pickup stores. Configure one random secret of at least 32 characters per connected supplier brand. The environment names are `RADAR_APPLE_FEED_SECRET`, `RADAR_PLAYSTATION_FEED_SECRET` and `RADAR_NVIDIA_FEED_SECRET`. Give each supplier only its own secret over a private channel.
2. Configure `RESEND_API_KEY`, `EMAIL_FROM` on a verified sending domain, `RADAR_AUTH_SECRET`, the public HTTPS `APP_URL`, and the same `DATABASE_URL` for both the web app and worker. Set `RADAR_LOCAL_MAILBOX=false` and leave `RADAR_LOCAL_TEST_MODE` off. For an owner-only delivery test, Resend also supports its default sender with the account owner's email as recipient. [Resend sender requirements](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)
3. Run the web app and `npm run worker` as separate long-running processes. Restart both when changing secrets. Have the supplier send a current baseline for each configuration and location. That source then appears in the alert form. Share the webhook instructions below with the supplier.

The local lab creates controlled reports and captures email. Customer delivery requires both an incoming supplier stream or an approved polling source, and a configured sender. A shopper's one-time official-store lookup runs separately.

## Supplier webhook

Send a JSON `POST` to `/api/radar/inventory/apple`, `/api/radar/inventory/playstation` or `/api/radar/inventory/nvidia`. Each request contains one observation of an exact published catalog configuration.

| Field | Value |
| --- | --- |
| `item`, `variant` | The two catalog slugs. For example, `rtx-5090` and `founders-edition`. |
| `storeId` | Required for Apple pickup, such as `apple-r095` for Fifth Avenue. Omit for US online stock. |
| `inStock` | A boolean from a confirmed observation. Skip unknown inventory or provider failures. |
| `observedAt` | The actual observation time, ISO 8601 UTC, within the last five minutes. |
| `priceCents` | Optional nonnegative integer in USD cents. |

Sign the exact UTF-8 JSON body that you send. `X-Radar-Timestamp` is the current Unix time in whole seconds. `X-Radar-Signature` is the lowercase hexadecimal HMAC-SHA256 of the version, brand, timestamp and raw JSON, joined by line feeds. Keep the body under 8 KiB. This example takes an actual stock observation from the supplier.

```js
import { createHmac } from "node:crypto";

async function publishInventory(origin, brand, key, observation) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify(observation);
  const signature = createHmac("sha256", key)
    .update(["v1", brand, timestamp, body].join("\n"))
    .digest("hex");
  return fetch(new URL("/api/radar/inventory/" + brand, origin), {
    method: "POST", redirect: "error",
    headers: { "Content-Type": "application/json", "X-Radar-Timestamp": timestamp, "X-Radar-Signature": signature },
    body,
  });
}
```

Send changes as they occur. While monitoring a configuration, report a fresh observation at least every five minutes to keep the displayed stock current. Retry a transient failure with the original observation timestamp and payload, using a fresh request signature. A successful response contains `sourceId` and a `result` of `recorded`, `duplicate` or `older`. Conflicting stock or prices at the same timestamp return HTTP 409. The first report establishes the baseline. A later out-of-stock to in-stock transition queues one email for each matching active alert. An update for another store or configuration has its own history.

Pausing a source in the admin panel closes its current stock period. **Resume feed** accepts new reports and establishes a fresh baseline. Removing a brand's feed secret from both processes stops new reports and makes its pending feed notifications ineligible. The worker rechecks subscription, inventory, age and alert status before delivery. In production it records a send only after Resend accepts the message. A local capture has a separate status.
