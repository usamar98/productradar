export type ProductContent = {
  summary: string;
  brand: string;
  reviewedAt: string;
  coverage: string;
  officialLinks: { label: string; url: string }[];
  buyingNotes: string[];
  guideSections: { heading: string; body: string }[];
};

// Editorial facts are reviewed independently from inventory. This date must never
// be presented as a retailer check time or used to manufacture a stock event.
export const productContent: Record<string, ProductContent> = {
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
      "Apple purchase links are available for manual checks. Store-level iPhone Duo pickup monitoring is not configured in Restock Radar. No local inventory, delivery date or restock schedule is inferred from these catalog links.",
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
          "Local pickup and shipping answer different questions. A delivery estimate does not establish stock at a nearby store, and a store listing does not guarantee a walk-in purchase. Check the fulfillment option and location directly with Apple. Restock Radar currently supplies catalog links for this product; it has no verified store-level pickup feed. Until monitoring is available, these pages cannot tell you which nearby store has a phone.",
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

export const categoryContent: Record<
  string,
  { description: string; buyingNotes: string[] }
> = {
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
      "Browse smartphone configurations by color and storage, with official purchase links and clear coverage information. The iPhone Duo catalog includes eight variants; local Apple Store pickup monitoring is not yet available.",
    buyingNotes: [
      "Choose the complete model, capacity and finish before comparing offers.",
      "Check carrier compatibility, activation requirements and financing terms separately from the phone's listed price.",
      "Verify local pickup and delivery independently on the seller's site; a product listing alone is not stock evidence.",
    ],
  },
};
