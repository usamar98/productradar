export type Configuration = { slug: string; label: string; attributes: Record<string, string> };

/** Pick a real configuration, preserving as many of the other choices as possible. */
export function chooseConfiguration<T extends Configuration>(variants: T[], current: T | undefined, key: string, value: string): T | undefined {
  return variants.filter(variant => variant.attributes[key] === value)
    .map((variant, index) => ({ variant, index, matches: Object.entries(current?.attributes ?? {}).filter(([field, selected]) => field !== key && variant.attributes[field] === selected).length }))
    .sort((a, b) => b.matches - a.matches || a.index - b.index)[0]?.variant;
}

export function configurationValues(variants: Configuration[], key: string): string[] {
  return [...new Set(variants.map(variant => variant.attributes[key]).filter(Boolean))];
}
