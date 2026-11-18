# Local checkout and notification lab

The lab at [localhost:3001/local-test](http://localhost:3001/local-test) exercises Stripe sandbox checkout, verified webhook activation, the stock worker and signed notification links. Stock comes from controls you operate, not Apple inventory. The main app remains at [localhost:3000](http://localhost:3000) with its ordinary retailer sources paused.

The expanded main catalog contains **49 products and 290 curated configurations** across Apple, PlayStation and NVIDIA. Its 46 added products have no inventory sources; the [official integration setup](official-store-integrations.md) adds on-demand direct Apple pickup, PlayStation and NVIDIA sources. Automatic monitoring remains inactive. The lab still exercises the eight iPhone Duo configurations. Catalog browsing does not enable checkout for products without an eligible source. See [catalog implementation and maintenance](product-catalog.md) for scope, research references and stable IDs.

## Start the configured workspace again

The PostgreSQL cluster, lab database and ignored `.env.local-test` are already prepared in this workspace. After a computer restart, start PostgreSQL if it is not running:

```powershell
& 'C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe' -D 'D:\productfind\.local\postgres' -l 'D:\productfind\.local\postgres-server.log' -o '-p 55432 -h 127.0.0.1' start
```

Stop any main-app `npm run dev` process before starting the lab. Two Next development servers in this checkout caused reload loops because they share generated files, even though they use separate build directories. If you want both apps open, build the main app while the lab is stopped, then run the main app in production mode:

```powershell
npm run build
npm run start
```

The main app runs on port 3000. This is a local production build; it does not enable live payments or connect retailer inventory. Skip these commands if you only need the lab.

From `D:\productfind`, run these lab commands in separate terminals and leave both running:

```powershell
npm run local-test
```

```powershell
npm run stripe:listen:local-test
```

The first command starts the lab web app in development mode on port 3001 and its stock worker. The second forwards Stripe snapshot events to `/api/radar/webhook` on that port. Wait for its `Ready!` message before checkout. The ordinary worker can run separately with `npm run worker` when needed; the lab runner already starts its own worker. Restart the lab after changing its environment file. Stop the lab before rebuilding the main app, then restart it after the build.

Use the exact host configured in `APP_URL`: this workspace uses `http://localhost:3001`. Local inbox and stock-control requests validate the host and origin. Switching to `127.0.0.1` in the browser while `APP_URL` says `localhost` will fail those checks.

## Test the flow

1. Open [the lab controls](http://localhost:3001/local-test). Choose a configuration, select **Out of stock**, and wait until **Worker observed** also says out of stock.
2. Follow that configuration's **Test checkout** link. The selected source should be **Apple Fifth Avenue · LOCAL TEST**. Enter your email and continue with the $9 until-caught pass.
3. On Stripe's test checkout, use **4242 4242 4242 4242**, a future expiry such as **12/34**, and **123** as CVC. Test payments do not move funds. [Stripe test card instructions](https://docs.stripe.com/testing)
4. Return to the lab and wait for an **active** alert and a verified test payment record. The success page alone does not activate an alert; the signed webhook must arrive and pass verification.
5. Set the same configuration to **In stock**. The next worker tick records the observation, opens a stock period and queues its notification.
6. Open [the local inbox](http://localhost:3001/local-inbox). Follow the stock notification's signed link. The app records the click and ends an until-caught pass before redirecting to the product page. A click is not a confirmed hardware purchase.
7. On [My alerts](http://localhost:3001/alerts/manage), request a sign-in link with the same email. Read it in the local inbox, sign in, then inspect alert status and the Stripe billing portal. Login links expire after ten minutes and work once.

For another stock period, choose **Out of stock**, wait for the worker to observe it, then choose **In stock**. Repeated in-stock observations must not create duplicate periods. A caught or expired pass does not become active again merely because stock changes; use a new test checkout when needed. The billing portal can manage a subscription purchased through a monthly plan; the until-caught pass is a one-time payment.

The lab uses real Stripe **sandbox** objects and signed events. It does not insert fake payment records or grant access from a browser redirect. The controlled stock input and local email capture are simulations, so they do not establish live retailer access, external inbox delivery or push delivery.

### Verification checkpoint: November 17, 2026

At this earlier checkout checkpoint, the production build and 88 unit tests passed. A hosted Stripe sandbox checkout completed, and its signed webhook produced one verified payment record and an active alert. Replaying the canonical `charge.updated` event returned HTTP 200; a duplicate replay also returned HTTP 200 and retained one payment record. These checks establish checkout activation and replay handling. Notification-click, account and portal browser verification is recorded separately below. The latest catalog test counts are recorded in the expanded-catalog checkpoint.

## Isolation and local files

| Component | Main app | Lab |
| --- | --- | --- |
| Origin | `http://localhost:3000` | `http://localhost:3001` |
| Database | `restock_radar` | `restock_radar_local_test` |
| Environment | `.env` | `.env.local-test` |
| Build output | `.next` | `.next-local-test` |
| Stock source | Direct on-demand checks for three core products; no sources for 46 added products | Eight deterministic `local-test` sources |
| Notification delivery | Provider configuration or explicit local capture | Local capture only |

`RADAR_LOCAL_TEST_MODE=true` works only in development, with a loopback app origin and a database name ending in `_local_test`. The runner also requires local mailbox capture and port 3001. It clears inherited application settings before loading the lab file. Use a separately generated `RADAR_AUTH_SECRET` for the lab. The app uses a separate lab session cookie.

The signal map is `.local/test-stock.json`. The control API changes only that input and schedules a check; the worker creates stock events through its normal path. Local email is stored in an origin-specific directory under `.local/mailbox`, bounded to 50 messages and 24-hour retention. Captures have status `captured`, not `sent`, and are excluded from delivered-email proof. Local test sources are excluded from the main catalog and public proof calculations. The lab pages carry `noindex` and private/no-store headers.

Environment files, Stripe CLI credentials, capture files and build output are ignored by Git. Do not paste API keys, claim URLs, inbox login links or webhook secrets into chat or commit them.

## Prepare a fresh lab database

These steps are only needed on a new workspace or when intentionally creating another lab. Do not point the lab at the main database or the integration-test database.

Create `.env.local-test` with this structure, filling private credentials locally:

```dotenv
NODE_ENV=development
DATABASE_URL=postgresql://radar@127.0.0.1:55432/restock_radar_local_test
DIRECT_URL=postgresql://radar@127.0.0.1:55432/restock_radar_local_test
APP_URL=http://localhost:3001
BETTER_AUTH_URL=http://localhost:3001
RADAR_AUTH_SECRET=<separately generated random secret of at least 32 characters>
ADMIN_PASSWORD=<separately generated password of at least 16 characters>
RADAR_LOCAL_TEST_MODE=true
RADAR_LOCAL_MAILBOX=true
NEXT_DIST_DIR=.next-local-test
STRIPE_SECRET_KEY=<Stripe test key>
STRIPE_WEBHOOK_SECRET=<matching CLI listener signing secret>
STRIPE_PORTAL_CONFIGURATION_ID=<test portal configuration>
STRIPE_SANDBOX_EXPIRES_AT=2026-11-24
```

Leave Resend and VAPID credentials absent for this lab. Create the database once, apply migrations and seed catalog metadata:

```powershell
& 'C:\Program Files\PostgreSQL\17\bin\createdb.exe' -h 127.0.0.1 -p 55432 -U radar restock_radar_local_test
npm run db:generate
node --env-file=.env.local-test node_modules/prisma/build/index.js migrate deploy
node --env-file=.env.local-test --import=tsx prisma/seed.ts
npm run local-test:setup
```

`local-test:setup` pauses ordinary polling sources in the isolated database. It initializes eight iPhone signals and three signed inventory samples, preserving existing signals and history on subsequent runs. For a new manual test, set the selected configuration to out of stock before enrolling. The [three-brand email test](restock-emails.md) exercises verified signup, worker delivery and retailer links.

## Stripe sandbox and expiry

The current free temporary sandbox expires **November 24, 2026**. Claim it before expiry to retain the account and its data. Stripe documents a seven-day lifetime and the claim process. [Stripe sandbox CLI](https://docs.stripe.com/cli/sandbox)

The official CLI is installed privately under `.local/stripe-tools`; its configuration is `.local/stripe/config.toml`. To open the claim flow for this sandbox, run:

```powershell
node .local/stripe-tools/node_modules/@stripe/cli/bin/shim.js --config .local/stripe/config.toml sandbox claim
```

Complete the account claim yourself. If credentials change afterward, update the ignored environment files and restart the app, worker and listener. Never replace these with live keys for this test flow.

For a fresh checkout of the repository, install the CLI locally:

```powershell
npm install --prefix .local/stripe-tools --no-audit --no-fund @stripe/cli@1.55.11
```

The listener scripts read the key from the chosen environment file, pass it through the child environment and redact secrets from console output. `npm run stripe:listen:local-test` targets the lab; `npm run stripe:listen` targets the normal app. Use the correct listener for the app receiving the checkout, and avoid forwarding the same sandbox events to unrelated application databases. The CLI receives snapshot events with `--all-snapshot`; no public tunnel or Dashboard webhook endpoint is required for local forwarding. [Stripe listener documentation](https://docs.stripe.com/cli/listen)

## When a test does not advance

- **Checkout unavailable:** check the readiness message on the lab page. Confirm the test key, webhook secret, auth secret, local mailbox flag and selected active local-test source.
- **Paid but still pending:** keep the listener and app running; inspect the listener's HTTP response. Do not manually mark the alert paid. A valid verified webhook is the required activation path.
- **Stock controls work but observed status stays unchanged:** check the worker terminal and PostgreSQL. The desired input and worker observation are deliberately separate.
- **No notification:** wait for the alert to become active before changing out-of-stock to in-stock. Check its exact variant/source and whether the pass was already caught or expired.
- **Local page returns 404:** use the configured localhost origin and development runner. The local inbox and controls are intentionally unavailable in production.
- **Expired sandbox:** claim before expiry or configure a replacement test sandbox; do not treat an expired key as a stock-tracking error.

## End-to-end verification recorded November 17, 2026

The browser test completed a $9 Stripe sandbox pass for 256GB Star White, received the signed checkout webhook, signed in using the captured single-use link, and opened the Stripe sandbox billing portal. Changing that configuration from out of stock to in stock produced one worker stock event and one locally captured notification. Following its signed link redirected to the correct Apple configuration and expired the until-caught pass with a recorded click.

At that checkout checkpoint, final lab counts were one payment, one stock event and one captured notification. The main database retained zero payments, stock events and notifications, with its then-existing 12 ordinary sources paused. Production inbox/control endpoints and requests with the wrong Host returned 404. The production build, 88 unit tests and 23 integration tests passed. External email and browser push delivery were not exercised. Subsequent catalog changes and their current source/test counts are recorded below.

The early `charge.updated` delivery reached the app before checkout had created its payment projection and returned a retryable 503. A locally signed replay of that canonical Stripe test event returned 200; repeating it returned `duplicate: true` and the payment count stayed at one. This replay exercised webhook processing without manually granting payment or access.

## Product-page redesign verification — November 17, 2026

The earlier product-page redesign exposed iPhone Duo, PlayStation 5 Pro and NVIDIA GeForce RTX 5090, each with a manufacturer-inspired product overview, original product photography and configuration links. The iPhone finish and storage controls update the image and carry the exact variant into alert setup. NVIDIA includes a Founders Edition configuration, graphics-card category, buying guide, and manual NVIDIA Marketplace and Best Buy links. Image provenance is recorded in [product photography sources](product-visual-sources.md).

The production build, 93 unit tests and 23 integration tests passed. Desktop and 390px mobile browser checks covered all three product pages, with no horizontal page overflow; the iPhone 1TB Night Sky selection reached the matching alert form. HTTP checks verified all product pages, NVIDIA category/guide/variant/retailer routes, canonical metadata, social images and sitemap inclusion. Product structured data contains no unverified offers. All 14 ordinary retailer sources remain paused and unapproved; no live inventory was connected by this redesign. The isolated Stripe test lab and its previous payment/event/notification records remain separate.

## Expanded-catalog verification — November 17, 2026

The main catalog now contains **49 products / 290 configurations**: Apple **24 / 251**, PlayStation **18 / 31**, and NVIDIA **7 / 8**. The inclusive research window is **November 17, 2025–November 17, 2026**, containing 24 Apple launches, 10 PlayStation launches and no verified new NVIDIA desktop GPU model launches. Older core hardware stays in the full catalog with its actual release date. Configuration choices are curated valid combinations, not every manufacturer configure-to-order option.

Start at [Apple](http://localhost:3000/brands/apple), [PlayStation](http://localhost:3000/brands/playstation) or [NVIDIA](http://localhost:3000/brands/nvidia). Filter or compare products, open a product's features, choose its documented options and follow the selected variant into alert setup. Only an eligible connected source can proceed to checkout; use the separate iPhone Duo lab above for the complete Stripe and notification flow. New product pages do not imply live monitoring.

TypeScript checking, the production build, **104 unit tests and 23 integration tests (127 total)** passed. HTTP checks covered all three brand routes, all 49 product pages and 49 representative variant pages, the complete sitemap, canonical metadata, Product JSON-LD and images. No unverified offers were added. All **290 database configurations** were validated. The 46 added products have no sources; all 14 original ordinary sources remain paused and unapproved.

Browser checks verified Apple Mac filtering and comparison, brand-navigation state reset, the PlayStation recent-launch filter showing 10 products, and the DualSense Wolverine controller's Adamantium configuration/image switch. Selecting M5 Ultra on Mac Studio chose its valid 96GB / 1TB configuration and reached the exact alert form. RTX 5060 Ti 16GB / 8GB selections carried the matching variant into alert links. NVIDIA's past-year filter correctly showed zero verified launches. At 390px, the Apple hub and NVIDIA configuration page had no horizontal overflow; no browser console errors were observed. The screenshot is `.local/expanded-product-catalog.jpg`, and the app was left open at `/products`.

The broader route and configuration coverage above comes from HTTP, database and automated checks, not an assertion that every configuration was clicked in a browser. The earlier Stripe lab results remain separate; expanding the catalog did not establish live retailer stock or external notification delivery.

See [catalog maintenance](product-catalog.md), [Apple research](apple-launch-research.md), [PlayStation research](playstation-launch-research.md) and [NVIDIA research](nvidia-launch-research.md) for sources, date qualifications and configuration constraints.

## ZIP search and free-first-alert verification — November 17, 2026

Start with [the ZIP checker in the lab](http://localhost:3001/stock?item=iphone-duo&variant=256gb-star-white&zip=10001). It searches the real US store directory, while any lab inventory result is prominently labeled **LOCAL TEST**. The eight controlled sources are attached only to Apple Fifth Avenue (`apple-r095`) with pickup fulfillment. Other stores retain unknown availability.

1. On [test controls](http://localhost:3001/local-test), choose **256GB Star White**, set **Out of stock**, and wait for the worker to observe it.
2. Open the ZIP checker above. Select **Set a free alert** on Apple Fifth Avenue. The exact configuration, source and ZIP are preserved.
3. Keep **First alert free**, enter an email not previously used for the free offer in this lab, and submit. The source must be connected. No Stripe checkout opens.
4. Follow **Open local inbox**, then **Verify email for free alert** in the captured email, then **Confirm email & start free alert**. The email link expires in ten minutes. The confirmation creates one active $0 plan valid for 14 days and signs you in.
5. Set the same configuration to **In stock** in the controls. Wait for **Worker observed: In stock**, then open the inbox. The new message must identify **256GB Star White** and **Apple Fifth Avenue · LOCAL TEST**.
6. Trying another free signup with the same verified email must be rejected, including after pausing or expiry. A paid upgrade remains available. Use the previous Stripe test instructions to exercise that separate path.

The browser run completed steps 1–5 using `free-zip-test@example.test`. ZIP 10001 returned 31 stores within 50 miles; pagination exposed all 31, the in-stock filter isolated the single simulated Fifth Avenue source, city/store search found Fifth Avenue, and an invalid ZIP returned a helpful validation message. At a 390px viewport the controls had no horizontal overflow; switching to PlayStation 5 Pro selected online fulfillment. No location permission was requested during these checks.

TypeScript checking and **113 unit tests + 28 integration tests (141 total)** passed. The free-alert integration tests cover activation, delivery eligibility, concurrency, replay, replaced links, invalid sources and lifetime claim limits in the isolated test database. The production build also passed; the main source data still does not establish live store inventory. The local browser test produced a captured notification, not an externally delivered email or push notification.

See [functional gap review](store-stock-checker-case-study.md#functional-walkthrough-and-gap-review--november-17-2026) and [implementation details](stock-finder.md).

## Live iPhone inventory remains pending

The competitor's public JavaScript requests its own catalog, store, stock and nearby-store APIs. It does not expose the server-side inventory collector or an authorized feed. Its robots rules disallow `/api/`, so those endpoints were not used as our data source. Browser refresh timing does not prove its upstream polling interval. See [the research addendum](store-stock-checker-case-study.md#public-code-inspection-november-17-2026).

The original product brief requires respecting retailer terms. Apple's website terms restrict automated monitoring, so automatic Apple monitoring remains inactive. The direct-integration report describes separately requested public API lookups and protection-stop handling. The local lab makes the rest of the payment and notification flow testable without representing simulated stock as live Apple availability. [Apple website terms](https://www.apple.com/legal/internet-services/terms/site.html)


## Direct official stock checks — November 17, 2026

The main app now performs real user-requested checks for iPhone Duo pickup, PlayStation Direct PS5 Pro and NVIDIA's RTX 5090 product API. The browser run returned 12 Apple stores for ZIP 10001 and one official online listing for each other brand, all out of stock at their observed times. Unreturned Apple stores remain unknown. All eight Duo part identities are configured; the live run checked 256GB Star White. The 30-second response cache preserves the original timestamp, and snapshots become stale after 60 seconds without sending an automatic request.

The production build, 132 unit tests and 30 PostgreSQL integration tests passed. On-demand observations do not grant background approval, enable checkout for an alert, or send a notification. Operator pauses and actual API blocks stop further checks. External email is still unconfigured. See the [integration report](official-store-integrations.md) for endpoints, matching rules, diagnostic approval and verification boundaries.
