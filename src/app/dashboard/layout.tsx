import { requirePageUser } from "@/server/auth/session";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requirePageUser();
  return children;
}
