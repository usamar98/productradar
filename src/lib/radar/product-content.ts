import { brands, launchDateLabel, launchProducts, type LaunchProduct } from "@/config/launch-catalog";
import { configurationValues } from "./configuration";
import { officialCatalog } from "./official-catalog";

export type ProductContent = {
  summary: string;
  brand: string;
  reviewedAt: string;
  coverage: string;
  officialLinks: { label: string; url: string }[];
  buyingNotes: string[];
  guideSections: { heading: string; body: string }[];
};

type CategoryContent = { description: string; buyingNotes: string[] };

const expandedCategoryContent: Record<string, CategoryContent> = {
  tablets: {
    description: "Compare iPad models by screen size, chip, storage and connectivity. Choose a documented configuration, then check the keyboard, Pencil and cellular compatibility that matters for your setup.",
    buyingNotes: ["Match the exact iPad model and generation to its keyboard or Pencil compatibility list.", "Choose storage and Wi-Fi or cellular connectivity before comparing offers; a cellular plan is a separate purchase.", "Confirm the contents of the box and any accessories included in a retailer bundle."],
  },
  laptops: {
    description: "Explore MacBook models, compare the documented chip and display options, and select a configuration for work or everyday use. Check memory, storage and external-display support on the exact model's specifications.",
    buyingNotes: ["Check chip, memory and storage together; the same laptop name can cover different hardware configurations.", "Verify the ports and external-display support required by your accessories.", "Review the included power adapter, keyboard layout and warranty for your region."],
  },
  desktops: {
    description: "Compare Mac desktop models by chip, memory, storage and form factor. Review the exact configuration and the display or peripherals you need before comparing retailer offers.",
    buyingNotes: ["Check the chip and memory in the full retailer configuration, rather than relying on the product family name.", "Review display support, ports and accessory compatibility for your workspace.", "Check which display, keyboard, mouse and cables are included with the specific model."],
  },
  displays: {
    description: "Explore Apple displays and their documented glass and stand choices. Compare the screen and mounting configuration, then check compatibility with your computer and workspace.",
    buyingNotes: ["Check the exact glass, stand or mounting option in the retailer's basket.", "Verify computer compatibility and required cables against the manufacturer's specifications.", "Measure desk space and mounting clearance before choosing a display configuration."],
  },
  smartwatches: {
    description: "Compare Apple Watch models by case, connectivity and supported configurations. Check phone compatibility and choose a case and band combination that suits your wrist.",
    buyingNotes: ["Check case size, material and connectivity together when comparing watch configurations.", "Confirm the required iPhone and software version on Apple's compatibility page.", "Review band sizing and, for cellular use, carrier support and plan terms separately."],
  },
  headphones: {
    description: "Compare Apple headphones and earbuds by their documented audio, charging and fit features. Check the exact generation and included charging accessories before choosing an offer.",
    buyingNotes: ["Match the generation and charging case to the exact product name.", "Check the requirements for features that depend on a compatible device or software version.", "Review fit, included accessories and the seller's return terms."],
  },
  "smart-home": {
    description: "Explore Apple smart-home hardware and compare its documented audio and connected-home features. Review device, app and network requirements before adding it to your home.",
    buyingNotes: ["Check compatibility with the devices and home services you already use.", "Review setup requirements, including a compatible device, software and network.", "Confirm the color, power accessories and regional model at the retailer."],
  },
  "item-trackers": {
    description: "Explore Apple item trackers and compare the documented pack options. Check device compatibility, attachment accessories and the features available with your phone before buying.",
    buyingNotes: ["Check the generation and number of trackers included in the pack.", "Verify the device requirements for setup and the finding features you want to use.", "Review whether holders or attachments are included or sold separately."],
  },
  controllers: {
    description: "Compare PlayStation controllers, including documented special editions and DualSense Edge. Select the exact model or design and review controls, compatibility and included accessories.",
    buyingNotes: ["Check the controller model and edition; cosmetic designs and controller features are separate choices.", "Verify device and game compatibility for the features you plan to use.", "Compare the included cables, cases and replaceable components in the exact listing."],
  },
  "remote-players": {
    description: "Explore PlayStation remote players and their documented editions. Review network, console and account requirements for your intended way of playing before choosing a device.",
    buyingNotes: ["Check the requirements for Remote Play and any supported cloud-streaming mode separately.", "Review network guidance and applicable account or subscription requirements on PlayStation's site.", "Confirm the exact device edition and included charging accessories."],
  },
  "vr-headsets": {
    description: "Explore PlayStation VR hardware and compare the documented headset configuration. Check the equipment, compatible games and play-space requirements for your intended setup.",
    buyingNotes: ["Verify the required console or PC equipment and any separate adapters.", "Check the features and games supported on your chosen platform.", "Review play-space guidance, included controllers and the contents of any bundle."],
  },
  "gaming-audio": {
    description: "Compare PlayStation gaming headsets and earbuds by fit, connection and documented audio features. Check platform compatibility and the accessories included with each model.",
    buyingNotes: ["Check the supported connection method for your console, computer or mobile device.", "Confirm whether the necessary adapter, charging case or cables are included.", "Review fit, microphone features and any device-specific feature requirements."],
  },
  "gaming-monitors": {
    description: "Explore PlayStation gaming displays and their documented screen and connection features. Match the monitor to your console or PC, available desk space and required inputs.",
    buyingNotes: ["Check the resolution and refresh rates supported by your console or PC and its connection.", "Confirm the inputs, included cables and stand or mounting arrangement.", "Compare the full regional specifications and warranty at the retailer."],
  },
  "console-covers": {
    description: "Explore PlayStation console cover designs and their stated model compatibility. Select the exact cover set for your console; these accessories do not include the console itself.",
    buyingNotes: ["Match the cover set to the exact PS5 model and hardware revision specified by PlayStation.", "Check whether the selected set fits your disc-drive configuration.", "Confirm the design and all included panels before ordering; a cover is an accessory."],
  },
};

function launchContent(product: LaunchProduct): ProductContent {
  const choices = product.options.map(option => `${option.label}: ${configurationValues(product.variants, option.key).join(", ")}.`);
  const hardwareNotes = expandedCategoryContent[product.category.slug]?.buyingNotes ?? (
    product.brand === "nvidia"
      ? ["Match the GPU, memory capacity and card manufacturer. Partner cards can have different coolers, dimensions and power requirements.", "Check case clearance, power supply and connectors against the exact card maker's installation guidance."]
      : product.category.slug === "smartphones"
        ? ["Check storage and finish together, then confirm carrier and eSIM compatibility for the regional model.", "Review activation, trade-in and financing terms separately from the phone's purchase price."]
        : ["Confirm the exact model, included accessories and compatible equipment using the manufacturer's specifications.", "Compare a standalone product and a bundle by their contents, condition and final price."]
  );
  return {
    summary: `${product.description} Compare the documented configurations and manufacturer specifications for ${product.name}.`,
    brand: brands[product.brand].name,
    reviewedAt: "2026-11-17",
    coverage: officialCatalog.some(mapping => mapping.itemSlug === product.slug)
      ? `${product.name} has ${officialCatalog.filter(mapping => mapping.itemSlug === product.slug).length} exact configurations connected to direct official stock checks. ${product.brand === "apple" ? "Search a US ZIP to check pickup at nearby Apple Stores. Custom configurations that Apple does not return are identified separately." : "Check the official US online store; delivery eligibility is confirmed at checkout."} Automatic alerts are not enabled.`
      : `${product.name} has ${product.variants.length} documented configurations. This product has no verified direct inventory listing yet. Use the manufacturer link to check the exact configuration.`,
    officialLinks: [
      { label: `${product.name} official product information`, url: product.officialUrl },
      ...(product.launchSourceUrl === product.officialUrl ? [] : [{ label: `${product.name} launch reference`, url: product.launchSourceUrl }]),
    ],
    buyingNotes: [
      ...choices,
      ...hardwareNotes,
      "Confirm the exact configuration, seller, condition, delivery or pickup option and final price with the retailer. This catalog does not reserve an item.",
    ],
    guideSections: [
      { heading: `Understand ${product.name}`, body: `${product.description} ${product.features.map(feature => `${feature.label}: ${feature.value}. ${feature.description}`).join(" ")}` },
      { heading: "Choose a documented configuration", body: `${choices.join(" ")} Select a complete configuration, then match all of its details to the retailer's listing. The choices shown here represent documented combinations, rather than every possible custom build or retailer bundle.` },
      { heading: "Check compatibility and included accessories", body: hardwareNotes.join(" ") },
      { heading: "Separate the launch from today's availability", body: `The documented launch is ${launchDateLabel(product)}. A launch date records when a product was introduced or made available; it does not show whether a retailer has it now. Use the stock checker for connected configurations, and the official product reference for other options. Confirm the exact configuration and fulfillment at the retailer before paying or traveling.` },
    ],
  };
}

// Editorial facts are reviewed independently from inventory. This date must never
// be presented as a retailer check time or used to manufacture a stock event.
export const productContent: Record<string, ProductContent> = {
  ...Object.fromEntries(launchProducts.map(product => [product.slug, launchContent(product)])),
  "rtx-5090": {
    summary: "Meet NVIDIA GeForce RTX 5090 Founders Edition. Explore 32GB GDDR7 memory, Blackwell architecture and exact retailer links for your next PC build.",
    brand: "NVIDIA",
    reviewedAt: "2026-11-17",
    coverage: "This tracker covers the RTX 5090 Founders Edition with 32GB GDDR7. The free checker requests NVIDIA’s own US product API for this exact card. Automatic alerts are not enabled; retailer links are also available for manual checks. Partner cards, bundles and other GeForce models are not interchangeable with this configuration.",
    officialLinks: [
      { label: "NVIDIA GeForce RTX 5090 specifications", url: "https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5090/" },
      { label: "RTX 5090 Founders Edition at NVIDIA Marketplace", url: "https://marketplace.nvidia.com/en-us/consumer/graphics-cards/geforce-rtx-5090-founders-edition/" },
      { label: "Compare NVIDIA GeForce graphics cards", url: "https://www.nvidia.com/en-us/geforce/graphics-cards/compare/" },
    ],
    buyingNotes: [
      "Choose RTX 5090 Founders Edition if you want NVIDIA's own card design. Partner cards can use different coolers, dimensions, connectors and factory clock settings.",
      "NVIDIA specifies 32GB GDDR7 memory and Blackwell architecture for RTX 5090. Check the exact model rather than relying on a listing photograph.",
      "Check your case clearance, power supply and cable requirements against NVIDIA's system preparation guide before buying. Other components affect total system requirements.",
      "Confirm the seller, condition, final price and return terms. A product link, an old stock period or an alert does not reserve a graphics card.",
    ],
    guideSections: [
      { heading: "Start with the exact card", body: "Founders Edition is a specific RTX 5090 configuration. A partner-manufactured RTX 5090 is a different product even when it uses the same GPU and memory capacity. Check the manufacturer and full model name in the retailer's basket. This page keeps the Founders Edition links together so your selected card remains consistent." },
      { heading: "Check your system before your basket", body: "Compare your chassis space, cooling layout, power supply and cable routing with the manufacturer's installation guidance. Leave room for the specified connectors and follow the cable maker's instructions. Review the requirements for the complete PC, especially if you are replacing a smaller or lower-power graphics card." },
      { heading: "Compare offers on equal terms", body: "Separate new, refurbished and open-box listings, and verify who sells and fulfills the order. Shipping, taxes and bundled components affect the final price. The retailer's checkout is the authority for current availability, fulfillment and purchase terms; Restock Radar does not place an order on your behalf." },
      { heading: "Use observed stock when it becomes available", body: "The free checker requests the exact Founders Edition offer from NVIDIA’s product API. It keeps NVIDIA’s own stock separate from other retailers and marks conflicting responses unknown. Compare each observation’s timestamp with the retailer’s current page; these checks do not enable automatic alerts. Recorded restocks describe the past and cannot guarantee a future shipment." },
    ],
  },
  "playstation-5-pro": {
    summary:
      "Compare PlayStation 5 Pro retailer sources, inspect their monitoring status and review recorded restocks for the standard console. Check the exact listing before choosing a console or bundle.",
    brand: "PlayStation",
    reviewedAt: "2026-11-17",
    coverage:
      "The catalog covers the standard PS5 Pro console. Retailer status and check times show which sources have actually reported availability. A paused source or missing observation does not establish whether that retailer has stock.",
    officialLinks: [
      {
        label: "PlayStation 5 Pro specifications and official buying options",
        url: "https://www.playstation.com/en-us/ps5/ps5-pro/",
      },
    ],
    buyingNotes: [
      "Confirm that the listing is for PlayStation 5 Pro. Other PS5 models, console covers and accessories can appear beside it in retailer search results.",
      "Compare the full basket price. Check whether a bundle includes games, a disc drive, a stand or another controller before comparing it with a standalone console.",
      "Sony lists 2TB of built-in SSD storage for PS5 Pro. Read the official specifications and the retailer's condition description before paying.",
      "Confirm the seller, delivery or pickup option, return terms and total price at the retailer. A recorded restock does not reserve a console.",
    ],
    guideSections: [
      {
        heading: "Decide which listing you want",
        body:
          "Start with the standard PS5 Pro console and make a short list of any extras you need. A bundle can be useful when it contains games or accessories you already planned to buy. Compare the value of those extras separately so a larger bundle price does not look like a change in the console's price. Check new, refurbished and open-box condition labels before treating two offers as equivalent.",
      },
      {
        heading: "Check the retailer source before setting an alert",
        body:
          "Open the retailer's listing and confirm the console model, seller and fulfillment option. Then check its status on Restock Radar. An active source can report observations; a paused source cannot currently produce new alerts. The most recent successful check matters more than the presence of a retailer logo. If no approved source is available, use the official buying options for a manual check.",
      },
      {
        heading: "Use restock history as a record",
        body:
          "A history entry describes availability that a source observed at a particular time. It does not promise another shipment at the same hour or show a retailer's entire inventory. Compare the source and timestamp before acting on an older entry. When there is no recorded event, there is not enough evidence here to estimate a usual restock time or how quickly a console sells out.",
      },
      {
        heading: "Complete the purchase with the retailer",
        body:
          "An alert is a prompt to check an offer. Restock Radar does not place an order or hold an item in your cart. Review the final price, pickup location or delivery date and the retailer's order confirmation. Once you have bought the console, remove alerts you no longer need and review your subscription settings so you control any future renewal.",
      },
    ],
  },
  "iphone-duo": {
    summary:
      "Explore all eight iPhone Duo color and storage combinations, follow exact US Apple purchase links and prepare an availability check for the configuration you want.",
    brand: "Apple",
    reviewedAt: "2026-11-17",
    coverage:
      "The free ZIP checker requests pickup availability directly from Apple for the selected iPhone Duo configuration. Each result matches an exact part and Apple Store. Unreturned stores remain unknown, and automatic alerts are not enabled. Delivery dates and future restocks are not inferred from pickup results.",
    officialLinks: [
      {
        label: "Apple iPhone Duo specifications",
        url: "https://www.apple.com/iphone-duo/specs/",
      },
      {
        label: "Shop iPhone Duo at Apple US",
        url: "https://www.apple.com/shop/buy-iphone/iphone-duo",
      },
    ],
    buyingNotes: [
      "Apple lists Night Sky and Star White finishes, each with 256GB, 512GB, 1TB or 2TB storage. Choose a complete color-and-storage combination before checking availability.",
      "The catalog's exact Apple links use the US connect-to-a-carrier-later option. Carrier offers, financing and activation choices are separate decisions on Apple's site.",
      "A model being listed for sale does not mean it can be picked up at your preferred store. Check the exact variant and location with Apple before making a trip.",
      "US iPhone Duo models use eSIM without a physical SIM tray. Confirm eSIM support with your carrier, especially if you plan to use the phone outside the US.",
    ],
    guideSections: [
      {
        heading: "Choose the full configuration",
        body:
          "The eight catalog choices pair two finishes with four storage capacities. Decide which combination you want and which alternatives you would actually buy. If you are flexible, make that list before checking stores so you can compare available options without accidentally ordering the wrong capacity. Open the link for your selected variant and confirm that Apple's checkout still shows your intended color and storage.",
      },
      {
        heading: "Separate pickup from delivery",
        body:
          "Local pickup and shipping answer different questions. A delivery estimate does not establish stock at a nearby store, and a store listing does not guarantee a walk-in purchase. Check the fulfillment option and location directly with Apple. Restock Radar’s free ZIP checker asks Apple for the selected configuration’s pickup availability. Check the observation time and exact store. Apple returns a limited set of stores per lookup; a missing result is unknown, not sold out.",
      },
      {
        heading: "Review activation and the total price",
        body:
          "The linked configurations use Apple's carrier-later purchase option. If you change to a carrier offer, read its activation, trade-in and financing requirements before comparing prices. A monthly payment and an outright purchase price describe different commitments. Check the total at checkout and confirm eSIM support with your carrier. Keep the exact model, finish and capacity consistent while comparing the choices.",
      },
      {
        heading: "Make a useful manual stock check",
        body:
          "Start from the exact variant link, choose your preferred fulfillment option and inspect the location or delivery information Apple shows. Repeat that check for an alternative variant only if you would buy it. There is no measured restock window on Restock Radar yet, so no particular hour is promised to work better. Complete any reservation or purchase with Apple and wait for its confirmation before traveling.",
      },
    ],
  },
};

export function getProductContent(slug: string): ProductContent | undefined {
  return Object.hasOwn(productContent, slug) ? productContent[slug] : undefined;
}

export const categoryContent: Record<string, CategoryContent> = {
  ...expandedCategoryContent,
  "graphics-cards": {
    description: "Explore the NVIDIA GeForce RTX desktop lineup by GPU model and documented memory configuration. Compare official specifications, distinguish Founders Edition from partner cards, and check that your PC matches the exact card you want.",
    buyingNotes: [
      "Compare the GPU and card manufacturer together; Founders Edition and partner cards can have different physical specifications.",
      "Check power, cable and case-clearance requirements against the manufacturer's guide before ordering.",
      "Use current retailer information for availability and price. Catalog specifications are not live inventory observations.",
    ],
  },
  consoles: {
    description:
      "Find console product pages, compare retailer sources and follow recorded restocks. Start with the exact console model, then compare standalone listings and bundles on their contents and final price.",
    buyingNotes: [
      "Check the model and condition; a console, a bundle and an accessory are different purchases.",
      "Choose retailers with current, verified observations before relying on alerts.",
      "Confirm the seller and shipping or pickup details at checkout; availability records do not reserve hardware.",
    ],
  },
  smartphones: {
    description:
      "Browse iPhone models and compare documented finishes, storage and hardware features. Choose the complete configuration before checking the manufacturer's buying options; use the ZIP checker for current pickup observations at nearby Apple Stores.",
    buyingNotes: [
      "Choose the complete model, capacity and finish before comparing offers.",
      "Check carrier compatibility, activation requirements and financing terms separately from the phone's listed price.",
      "Verify local pickup and delivery independently on the seller's site; a product listing alone is not stock evidence.",
    ],
  },
};
