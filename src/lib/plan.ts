const configured = Number(process.env.NEXT_PUBLIC_PLAN_PRICE_CENTS || 799);
export const PLAN_PRICE_CENTS = Number.isInteger(configured) && configured > 0 && configured <= 100000 ? configured : 799;
export const PLAN_PRICE = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(PLAN_PRICE_CENTS / 100);
