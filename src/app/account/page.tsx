import type { Metadata } from "next";
import { AccountView } from "@/components/dashboard-view";
export const metadata: Metadata = { title: "Account & billing" };
export default function AccountPage() { return <AccountView />; }
