# Direct stock verification - 18 November 2026

Historical verification record, not a current availability feed. The production app called the manufacturers through `/api/radar/stock-search`; no stored research response was substituted for these requests. Checks ran on 18 November in Asia/Karachi (17 November UTC).

## Coverage and results

- 242 mapped standard Apple configurations across all 24 Apple products in the catalog. Nine custom Mac configurations explicitly require confirmation with Apple.
- 19 mapped PlayStation configurations and three NVIDIA Founders Edition cards.
- 37 of 37 live checks succeeded: one configuration per Apple product, ten Sony configurations and all three NVIDIA Founders Editions. This does not claim that all 242 Apple configurations were individually live-tested.
- Apple checks matched the exact reviewed part and Apple Fifth Avenue (`R095`, ZIP 10153). Online checks matched the exact Sony product code or NVIDIA-owned offer.
- All 37 calls returned HTTP 200 and a known in-stock or out-of-stock result. No protection response occurred in this run.
- Database verification after the run: zero notifications and zero approved official sources. These checks did not enable background monitoring or external email.

## Live observations

| Product | Configuration | Observed status | Time (UTC, 17 Nov) |
| --- | --- | --- | --- |
| iPhone Duo | 256GB / Night Sky | Out of stock | 20:12:59 |
| iPhone 17e | Black / 256GB | In stock | 20:13:04 |
| iPhone 18 Pro | Burgundy / 256GB | In stock | 20:13:11 |
| iPhone 18 Pro Max | Burgundy / 256GB | Out of stock | 20:13:18 |
| iPad Air with M4 | 11-inch / Blue / 128GB / Wi-Fi | In stock | 20:13:23 |
| iPad mini with A20 Pro | Midnight / 128GB / Wi-Fi / Standard glass | In stock | 20:13:30 |
| MacBook Neo | Silver / 256GB / 8GB | Out of stock | 20:13:37 |
| MacBook Air with M5 | 13-inch / Sky Blue / 16GB / 512GB | In stock | 20:13:43 |
| MacBook Pro with M5 Pro or M5 Max | 14-inch / Space Black / M5 Pro / 24GB / 1TB | In stock | 20:13:50 |
| 14-inch MacBook Pro with M6 | Space Black / 16GB / 1TB | In stock | 20:13:57 |
| MacBook Pro with PROLED XDR | 14-inch / Space Black / M5 Pro / 24GB / 1TB | In stock | 20:14:02 |
| iMac with M6 | Blue / M6 10-core CPU / 10-core GPU / 16GB / 256GB | In stock | 20:14:10 |
| Mac mini with M6 or M5 Pro | M6 / 16GB / 256GB | In stock | 20:14:15 |
| Mac Studio with M5 Max or M5 Ultra | M5 Max / 36GB / 512GB | In stock | 20:14:23 |
| Studio Display (2026) | Standard glass / Tilt-adjustable stand | In stock | 20:14:29 |
| Studio Display XDR | Standard glass / Tilt- and height-adjustable stand | In stock | 20:14:36 |
| Apple Watch Series 12 | 42mm / Dark Bronze / GPS / Olive Sport Band / S/M | In stock | 20:14:42 |
| Apple Watch Ultra 4 | Natural Titanium / GPS + Cellular / Translucent Gray Ocean Band / One Size | In stock | 20:14:49 |
| AirPods 5 | USB-C Charging Case | In stock | 20:14:55 |
| AirPods Max 2 | Midnight | In stock | 20:15:01 |
| Apple HomeView | Tabletop / Silver | In stock | 20:15:07 |
| HomePod mini 2 | Pink | In stock | 20:15:14 |
| Apple TV 4K (4th generation) | 128GB / Wi-Fi + Ethernet | Out of stock | 20:15:21 |
| AirTag (2nd generation) | 1-pack | In stock | 20:15:28 |
| PlayStation 5 Pro | Standard | Out of stock | 20:15:34 |
| PlayStation 5 | Disc Edition | In stock | 20:15:40 |
| PlayStation 5 | Digital Edition | In stock | 20:15:46 |
| PlayStation Portal | White | In stock | 20:15:53 |
| PlayStation Portal | Midnight Black | In stock | 20:16:00 |
| DualSense Edge | White | In stock | 20:16:06 |
| DualSense Edge | Midnight Black | In stock | 20:16:13 |
| DualSense Hyperpop Collection | Techno Red | In stock | 20:16:19 |
| DualSense Hyperpop Collection | Remix Green | In stock | 20:16:26 |
| DualSense Hyperpop Collection | Rhythm Blue | In stock | 20:16:33 |
| NVIDIA GeForce RTX 5090 | Founders Edition · 32GB GDDR7 | Out of stock | 20:16:40 |
| NVIDIA GeForce RTX 5080 | Founders Edition · 16GB GDDR7 | Out of stock | 20:16:46 |
| NVIDIA GeForce RTX 5070 | Founders Edition · 12GB GDDR7 | Out of stock | 20:16:52 |

## Browser checks

- MacBook Air M5, 13-inch Sky Blue, 16GB/512GB, ZIP 10001, 50 miles: 31 of 31 directory stores had fresh direct observations; 27 in stock and four out of stock. Combined responses contained 33 store observations, including two outside the radius. Observed around 20:17:17-20 UTC.
- PlayStation 5 Disc Edition: the official online result showed in stock at 20:17:51 UTC.
- RTX 5080 Founders Edition: the official online result showed out of stock at 20:18:29 UTC.
- Custom M6 MacBook Pro Silver/24GB/2TB: the UI showed its exact Apple configuration link and coverage explanation. It did not invent a store or stock result.
- The local snapshots are recorded under `.local/expanded-apple-live.jpg`, `.local/expanded-playstation-live.jpg` and `.local/expanded-nvidia-live.jpg`. Research captures and raw responses are ignored by Git.

The final rebuilt app repeated the MacBook Air search at 20:22:25 UTC with the same 31 checked / 27 in-stock result. PlayStation Disc Edition returned in stock at 20:22:22 UTC with its full console configuration label. The custom Mac display contains only its coverage explanation and exact link, with no misleading zero-store counts. Browser error logs were empty. Both the main app (3000) and isolated test lab (3001) were restored.

## Automated checks

150 unit tests and 31 PostgreSQL integration tests passed. The final catalog-label edit also passed the 18 relevant catalog tests. The final production build, including TypeScript, passed. Automated tests use controlled responses and do not contact retailers or send email.

## Reproduce

```powershell
npm.cmd run db:seed
npm.cmd run sources:official -- --setup --zip 10001 --limit 1
npm.cmd run build
npm.cmd run start
```

Open `/stock`, choose a product and exact configuration, then enter a US ZIP for Apple pickup or use the official online check for Sony/NVIDIA. Each request records its actual timestamp. A stock result is a snapshot and never guarantees a reservation or shipping eligibility. Protection responses stop the provider; setup does not clear a block or approve a source.
