# NVIDIA launch catalog research

Reviewed November 17, 2026. Requested window: November 17, 2025 through November 17, 2026, inclusive. Scope is NVIDIA GeForce desktop GPU models, not laptops, workstation/datacenter hardware, every partner board SKU, or software releases.

## Coverage and date handling

NVIDIA's [current US RTX 50-series catalog](https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/) lists seven desktop models. The reviewed official sources did not establish a newly launched NVIDIA GeForce desktop GPU model inside the requested window. All seven existing models remain browsable as earlier releases; they must not be relabeled as launches in the last year.

NVIDIA's [Computex 2026 showcase](https://www.nvidia.com/en-us/geforce/news/computex-2026-partner-product-showcase/) describes new ASUS, GIGABYTE, MSI and PNY board designs based on existing RTX 50-series GPUs. It does not establish new NVIDIA GPU model names. This catalog does not claim exhaustive coverage of those third-party board SKUs.

| GPU model | Model availability | Date evidence | Technical reference |
| --- | --- | --- | --- |
| GeForce RTX 5090 | 2025-01-30 | [Launch source](https://www.nvidia.com/en-us/geforce/news/rtx-5090-5080-out-now/) | [Specifications](https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5090/) |
| GeForce RTX 5080 | 2025-01-30 | [Launch source](https://www.nvidia.com/en-us/geforce/news/rtx-5090-5080-out-now/) | [Specifications](https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5080/) |
| GeForce RTX 5070 Ti | 2025-02-20 | [Launch source](https://www.nvidia.com/en-us/geforce/news/rtx-5070-ti-out-now/) | [Specifications](https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5070-family/) |
| GeForce RTX 5070 | 2025-03-05 | [Launch source](https://www.nvidia.com/en-us/geforce/news/rtx-5070-out-now/) | [Specifications](https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5070-family/) |
| GeForce RTX 5060 Ti | 2025-04-16 | [Launch source](https://www.nvidia.com/en-us/geforce/news/geforce-rtx-5060-ti-game-ready-driver/) | [Specifications](https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5060-family/) |
| GeForce RTX 5060 | 2025-05-19 | [Launch source](https://www.nvidia.com/en-us/geforce/news/rtx-5060-out-now/) | [Specifications](https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5060-family/) |
| GeForce RTX 5050 | July 2025 | [Launch source](https://www.nvidia.com/en-us/geforce/news/rtx-5050-desktop-gpu-and-laptops/) | [Specifications](https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5050/) |

RTX 5070's date is the GPU model's first partner-card availability. Its official launch article says Founders Edition followed later in March; the product description preserves that distinction. RTX 5050's official announcement states desktop availability during July 2025 without an exact day. Its data uses `launchDatePrecision: "month"`, `launchLabel: "July 2025"`, and `2025-07-01` only as a sortable month anchor; the interface must never display July 1 as its verified retail launch day. The July 1 driver article still referred to availability later that month.

## Configurations and images

There are seven products and eight configuration records. RTX 5090 retains the existing `founders-edition` variant slug. RTX 5080 and RTX 5070 use their documented Founders Edition configuration. RTX 5070 Ti, RTX 5060 Ti, RTX 5060 and RTX 5050 have no invented Founders Edition option: their options describe GPU memory only, and shoppers must select the exact partner card at the retailer. RTX 5060 Ti has 8GB and 16GB GDDR7 variants. Desktop RTX 5050 has GDDR6, not the laptop GPU's GDDR7.

All images were downloaded unchanged from official NVIDIA pages and visually inspected. The partner-only GPU pages use NVIDIA's own promotional PC visuals, labeled as illustrative systems rather than photographs of a purchasable Founders Edition. These images do not mean a computer, monitor or game is included. No asset from RTX 5090 was substituted for a different GPU.

| Local asset | Original asset | Visual description |
| --- | --- | --- |
| `/images/products/rtx-5090-hero.jpg` | [Original manufacturer asset](https://www.nvidia.com/content/dam/en-zz/Solutions/geforce/graphic-cards/50-series/rtx-5090/geforce-rtx-5090-learn-more-og-1200x630.jpg) | NVIDIA GeForce RTX 5090 Founders Edition graphics card |
| `/images/launches/nvidia-rtx-5080.jpg` | [Original manufacturer asset](https://www.nvidia.com/content/dam/en-zz/Solutions/geforce/graphic-cards/50-series/rtx-5080/geforce-rtx-5080-og-1200x630.jpg) | NVIDIA GeForce RTX 5080 Founders Edition graphics card |
| `/images/launches/nvidia-rtx-5070-ti.jpg` | [Original manufacturer asset](https://www.nvidia.com/content/dam/en-zz/Solutions/geforce/news/rtx-5070-ti-out-now/geforce-rtx-5070-ti-out-now-ogimage.jpg) | NVIDIA's RTX 5070 Ti launch promotional image showing an illustrative desktop PC; computer not included |
| `/images/launches/nvidia-rtx-5070.jpg` | [Original manufacturer asset](https://www.nvidia.com/content/dam/en-zz/Solutions/geforce/news/rtx-5070-out-now/geforce-rtx-5070-out-now-ogimage.jpg) | NVIDIA GeForce RTX 5070 Founders Edition promotional image |
| `/images/launches/nvidia-rtx-5060-ti.jpg` | [Original manufacturer asset](https://www.nvidia.com/content/dam/en-zz/Solutions/geforce/graphic-cards/50-series/5060-family/geforce-rtx-5060-family-og-1200x630@2x.jpg) | NVIDIA's RTX 5060 family promotional image showing an illustrative desktop PC; computer not included |
| `/images/launches/nvidia-rtx-5060.jpg` | [Original manufacturer asset](https://www.nvidia.com/content/dam/en-zz/Solutions/geforce/news/rtx-5060-out-now/geforce-rtx-5060-out-now-ogimiage.jpg) | NVIDIA's RTX 5060 launch promotional image with a sample gaming PC and displays; system not included |
| `/images/launches/nvidia-rtx-5050.jpg` | [Original manufacturer asset](https://www.nvidia.com/content/dam/en-zz/Solutions/geforce/graphic-cards/50-series/rtx-5050/geforce-rtx-5050-og-1200x630.jpg) | NVIDIA's RTX 5050 desktop promotional image showing an illustrative PC; computer not included |

All six newly downloaded files are JPEGs under 500KB; the existing RTX 5090 photo is reused. Copyright and trademarks remain with NVIDIA and the relevant owners. Attribution is not a license grant.

This is product metadata, not inventory evidence. No prices, available stock, retailer observation times or monitored sources were manufactured by this research.
