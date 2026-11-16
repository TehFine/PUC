import { notFound } from "next/navigation";
import AdminApp from "@/components/admin/AdminApp";
import { resolveValidAdminRoute, type SectionId } from "@/lib/route-validation";

export type { SectionId };

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const resolved = resolveValidAdminRoute(params);
  if (!resolved) {
    notFound();
  }
  return <AdminApp initialSection={resolved.section} />;
}
