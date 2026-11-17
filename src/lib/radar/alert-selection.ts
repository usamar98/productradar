export type SelectableAlertItem = {
  id: string;
  slug: string;
  variants: { id: string; slug: string }[];
  sources: { id: string; variantId: string }[];
};

/** Resolve shareable alert links only against the selected item's own catalog. */
export function resolveAlertSelection<T extends SelectableAlertItem>(
  items: T[],
  query: { item?: string; variant?: string; source?: string },
) {
  const item = items.find(value => value.slug === query.item || value.id === query.item) || items[0];
  if (!item) return null;
  const source = item.sources.find(value => value.id === query.source);
  const explicitVariant = item.variants.find(value => value.id === query.variant || value.slug === query.variant);
  const variant = explicitVariant || item.variants.find(value => value.id === source?.variantId) || item.variants[0];
  return {
    item,
    variantId: variant?.id || "",
    sourceIds: source && source.variantId === variant?.id ? [source.id] : [],
  };
}
