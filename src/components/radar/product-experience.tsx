"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowDown, ArrowRight, Check, ChevronRight, ShieldCheck } from "lucide-react";
import styles from "./product-experience.module.css";

type ProductVariant = { id: string; slug: string; label: string };

export type ProductExperienceItem = {
  slug: string;
  name: string;
  imageUrl?: string | null;
  variants: ProductVariant[];
};

type Brand = "apple" | "playstation" | "nvidia";
type ProductPresentation = {
  brand: Brand;
  label: string;
  eyebrow: string;
  title: string;
  tagline: string;
  description: string;
  image: string;
  detailImage: string;
  imageAlt: string;
  configureLabel: string;
  selectionNote: string;
  features: { value: string; label: string }[];
};

const presentations: Record<string, ProductPresentation> = {
  "iphone-duo": {
    brand: "apple",
    label: "Apple",
    eyebrow: "A LITTLE LESS WAITING. A LOT MORE POSSIBILITY.",
    title: "iPhone Duo",
    tagline: "Your next chapter. Unfolded.",
    description: "Two finishes. Four storage options. Find the iPhone that feels like yours, then explore where to get it.",
    image: "/images/products/iphone-duo-hero.jpg",
    detailImage: "/images/products/iphone-duo-star-white.png",
    imageAlt: "iPhone Duo with its folding display open",
    configureLabel: "Choose your iPhone",
    selectionNote: "Unlocked configurations. Confirm carrier compatibility, delivery and pickup details with the retailer.",
    features: [
      { value: "7.6-inch", label: "Folding inner display" },
      { value: "A20 Pro", label: "Apple silicon" },
      { value: "2 finishes", label: "Night Sky. Star White." },
    ],
  },
  "playstation-5-pro": {
    brand: "playstation",
    label: "PlayStation",
    eyebrow: "MAKE ROOM FOR YOUR NEXT ADVENTURE",
    title: "PlayStation 5 Pro",
    tagline: "Your next level. Within reach.",
    description: "An upgrade worth planning for. Explore the console, compare retailer listings, and keep your next gaming setup on the radar.",
    image: "/images/products/ps5-pro-hero.jpg",
    detailImage: "/images/products/ps5-pro-detail.jpg",
    imageAlt: "PlayStation 5 Pro console and DualSense wireless controller",
    configureLabel: "Explore the console",
    selectionNote: "Standard PS5 Pro console. Check the retailer listing for included accessories. Disc drive and vertical stand are sold separately.",
    features: [
      { value: "PSSR", label: "AI-assisted image clarity" },
      { value: "Ray tracing", label: "Enhanced lighting and reflections" },
      { value: "PS5 Pro", label: "Enhanced games supported" },
    ],
  },
  "rtx-5090": {
    brand: "nvidia",
    label: "NVIDIA GeForce",
    eyebrow: "FOR THE BUILD YOU HAVE IN MIND",
    title: "GeForce RTX 5090",
    tagline: "Big ideas. More horsepower.",
    description: "Bring your next gaming or creative build into focus. Explore the card and compare the exact edition before you buy.",
    image: "/images/products/rtx-5090-hero.jpg",
    detailImage: "/images/products/rtx-5090-detail.jpg",
    imageAlt: "NVIDIA GeForce RTX 5090 Founders Edition graphics card",
    configureLabel: "Explore the graphics card",
    selectionNote: "Confirm the exact card edition, case clearance, power supply and power connectors before ordering. Partner cards can have different dimensions.",
    features: [
      { value: "32 GB", label: "GDDR7 memory" },
      { value: "Blackwell", label: "NVIDIA architecture" },
      { value: "RTX", label: "Ray tracing and AI graphics" },
    ],
  },
};

function phoneDetails(variant: ProductVariant) {
  const match = variant.slug.match(/^(256gb|512gb|1tb|2tb)-(night-sky|star-white)$/);
  return match ? { storage: match[1], color: match[2] } : null;
}

function storageLabel(value: string) {
  return value.replace("gb", "GB").replace("tb", "TB");
}

function colorLabel(value: string) {
  return value === "night-sky" ? "Night Sky" : "Star White";
}

/** Product presentation is independent of stock observations and retailer prices. */
export function ProductExperience({ item }: { item: ProductExperienceItem }) {
  const presentation = presentations[item.slug];
  const [selectedSlug, setSelectedSlug] = useState(
    item.variants.find(variant => variant.slug === "256gb-star-white")?.slug ?? item.variants[0]?.slug ?? "",
  );

  if (!presentation) return null;

  const selected = item.variants.find(variant => variant.slug === selectedSlug) ?? item.variants[0];
  const phone = presentation.brand === "apple";
  const selectedDetails = selected ? phoneDetails(selected) : null;
  const phoneVariants = item.variants.flatMap(variant => {
    const details = phoneDetails(variant);
    return details ? [{ variant, ...details }] : [];
  });
  const colors = ["night-sky", "star-white"].filter(color => phoneVariants.some(variant => variant.color === color));
  const capacities = ["256gb", "512gb", "1tb", "2tb"].filter(storage => phoneVariants.some(variant => variant.storage === storage));
  const detailImage = phone && selectedDetails
    ? `/images/products/iphone-duo-${selectedDetails.color}.png`
    : presentation.detailImage;
  const detailAlt = phone && selectedDetails
    ? `iPhone Duo in ${colorLabel(selectedDetails.color)}`
    : presentation.brand === "playstation"
      ? "PlayStation 5 Pro console viewed horizontally"
      : "Close-up of the NVIDIA GeForce RTX 5090 Founders Edition cooler";
  const alertHref = selected
    ? `/alerts?item=${encodeURIComponent(item.slug)}&variant=${encodeURIComponent(selected.slug)}`
    : `/alerts?item=${encodeURIComponent(item.slug)}`;
  const detailsHref = selected ? `/${item.slug}/variants/${selected.slug}` : `/${item.slug}`;

  function selectPhonePart(part: "storage" | "color", value: string) {
    const next = phoneVariants.find(variant =>
      variant[part] === value &&
      (part === "storage" ? variant.color === selectedDetails?.color : variant.storage === selectedDetails?.storage),
    ) ?? phoneVariants.find(variant => variant[part] === value);
    if (next) setSelectedSlug(next.variant.slug);
  }

  return <section className={`${styles.experience} ${styles[presentation.brand]}`} aria-label={`${item.name} product overview`}>
    <div className={styles.productNav}>
      <div className={styles.productNavInner}>
        <a href="#overview" className={styles.productName}>{presentation.title}</a>
        <nav aria-label={`${item.name} page sections`}>
          <a href="#overview">Overview</a>
          <a href="#configure">Configurations</a>
          <a href="#availability">Availability</a>
          <Link href={`/how-to-get-${item.slug}`}>Buying guide</Link>
        </nav>
        <a href="#configure" className={styles.navButton}>Explore <ChevronRight size={13}/></a>
      </div>
    </div>

    <header id="overview" className={styles.hero}>
      <div className={styles.heroInner}>
        <div className={styles.heroCopy}>
          <span className={styles.brandLabel}>{presentation.label}</span>
          <p className={styles.eyebrow}>{presentation.eyebrow}</p>
          <h1>{presentation.title}</h1>
          <p className={styles.tagline}>{presentation.tagline}</p>
          <p className={styles.description}>{presentation.description}</p>
          <div className={styles.heroActions}>
            <a className={styles.primaryButton} href="#configure">{presentation.configureLabel}<ArrowRight size={17}/></a>
            <a className={styles.textButton} href="#availability">Check availability<ChevronRight size={17}/></a>
          </div>
        </div>
        <div className={styles.heroVisual}>
          <span className={styles.visualAccent} aria-hidden="true"/>
          <Image
            src={presentation.image}
            alt={presentation.imageAlt}
            fill
            sizes={phone ? "(max-width: 800px) 100vw, 1000px" : "(max-width: 800px) 100vw, 65vw"}
            preload
            className={styles.heroImage}
          />
        </div>
      </div>
      <div className={styles.heroFoot}>
        <span><ShieldCheck size={14}/>Independent stock tracker by Restock Radar</span>
        <a href="#configure">Find your configuration<ArrowDown size={14}/></a>
      </div>
    </header>

    <div className={styles.featureStrip}>
      {presentation.features.map(feature => <div className={styles.feature} key={feature.label}>
        <strong>{feature.value}</strong>
        <span>{feature.label}</span>
      </div>)}
    </div>

    <section className={styles.configure} id="configure" aria-labelledby="configuration-title">
      <div className={styles.sectionIntro}>
        <span className={styles.sectionEyebrow}>MAKE IT YOURS</span>
        <h2 id="configuration-title">The right one.<br/><span>Down to the details.</span></h2>
        <p>Choose your configuration before comparing retailers.</p>
      </div>
      <div className={styles.configureGrid}>
        <div className={styles.preview}>
          <div className={styles.previewTop}><span>{presentation.label}</span><span>Product overview</span></div>
          <div className={styles.previewImage}>
            <Image src={detailImage} alt={detailAlt} fill sizes="(max-width: 800px) 100vw, 600px" className={styles.productImage}/>
          </div>
          <div className={styles.previewCaption}>
            <strong>{presentation.title}</strong>
            <span>{phone ? "Explore every finish and storage option." : "A closer look at your next upgrade."}</span>
          </div>
        </div>

        <div className={styles.configurationPanel}>
          {phone && selectedDetails ? <>
            <fieldset className={styles.fieldset}>
              <legend><span>Finish.</span> Make it yours.</legend>
              <p className={styles.currentChoice}>{colorLabel(selectedDetails.color)}</p>
              <div className={styles.colorChoices}>
                {colors.map(color => <button
                  key={color}
                  type="button"
                  className={styles.colorOption}
                  aria-pressed={selectedDetails.color === color}
                  onClick={() => selectPhonePart("color", color)}
                >
                  <span className={`${styles.colorSwatch} ${color === "night-sky" ? styles.nightSky : styles.starWhite}`} aria-hidden="true"/>
                  <span>{colorLabel(color)}</span>
                </button>)}
              </div>
            </fieldset>
            <fieldset className={styles.fieldset}>
              <legend><span>Storage.</span> Space for your world.</legend>
              <div className={styles.capacityChoices}>
                {capacities.map(storage => <button
                  key={storage}
                  type="button"
                  className={styles.capacityOption}
                  aria-pressed={selectedDetails.storage === storage}
                  disabled={!phoneVariants.some(variant => variant.storage === storage && variant.color === selectedDetails.color)}
                  onClick={() => selectPhonePart("storage", storage)}
                >{storageLabel(storage)}{selectedDetails.storage === storage && <Check size={16} aria-hidden="true"/>}</button>)}
              </div>
            </fieldset>
          </> : <fieldset className={styles.fieldset}>
            <legend><span>{presentation.brand === "nvidia" ? "Edition." : "Your console."}</span> Choose the right match.</legend>
            <div className={styles.editionChoices}>
              {item.variants.map(variant => <button
                key={variant.id}
                type="button"
                className={styles.editionOption}
                aria-pressed={selected?.slug === variant.slug}
                onClick={() => setSelectedSlug(variant.slug)}
              >
                <span><strong>{variant.label}</strong><small>{presentation.title}</small></span>
                {selected?.slug === variant.slug && <Check size={20} aria-hidden="true"/>}
              </button>)}
            </div>
          </fieldset>}

          <p className={styles.selectionNote}>{presentation.selectionNote}</p>
          <div className={styles.selectionSummary}>
            <span className={styles.selectionLabel}>YOUR SELECTION</span>
            <p aria-live="polite" aria-atomic="true"><strong>{presentation.title}</strong><span>{selected?.label ?? "Choose a configuration"}</span></p>
            <Link href={detailsHref} className={styles.primaryButton}>View this configuration<ArrowRight size={17}/></Link>
            <Link href={alertHref} className={styles.alertLink}>Explore alert options<ChevronRight size={15}/></Link>
            <small>Stock and prices are confirmed separately by retailer. Product purchases happen on the retailer’s website.</small>
          </div>
        </div>
      </div>
    </section>
    <div className={styles.availabilityLead}>
      <div><span className={styles.sectionEyebrow}>THE NEXT STEP</span><h2>A clearer view of availability.</h2><p>Retailer links, check times, and recorded stock — all in one place.</p></div>
      <a href="#availability" className={styles.availabilityArrow} aria-label="View retailer availability"><ArrowDown size={25}/></a>
    </div>
  </section>;
}
