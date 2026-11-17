import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard-view";
export const metadata: Metadata = { title: "My watch" };
export default function DashboardPage() { return <DashboardView />; }
