import type { Metadata } from "next";
import { StockView } from "@/components/stock-view";
export const metadata: Metadata = { title: "Retailer status" };
export default function StockPage() { return <StockView />; }
