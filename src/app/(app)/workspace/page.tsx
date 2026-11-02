import { currentUser, can } from "@/lib/access";
import { prisma } from "@/lib/db";
import { businessToday } from "@/lib/dates";
import {
  resolveColumns,
  fromDeal,
  type SheetRow,
  type Values,
} from "@/lib/workspace";
import Workspace from "./sheet";

export default async function WorkspacePage() {
  const u = await currentUser();
  const [deals, records, fields, clients, partners] = await Promise.all([
    prisma.deal.findMany({
      where: { assignedTo: u.id, deletedAt: null },
      include: { client: true, partner: true },
      orderBy: { dealDate: "desc" },
    }),
    prisma.workspaceRow.findMany({ where: { ownerId: u.id } }),
    prisma.workspaceField.findMany({
      where: { ownerId: u.id },
      orderBy: { id: "asc" },
    }),
    prisma.client.findMany({
      where: { assignedTo: u.id, status: { not: "ARCHIVED" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.partner.findMany({
      where: { archived: false },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const byDeal = new Map(records.map((r) => [r.dealId, r]));
  const rows: SheetRow[] = records
    .filter((r) => !r.dealId)
    .map((r) => ({
      key: r.key,
      version: r.version,
      dealId: "",
      dealVersion: "",
      values: r.values as Values,
    }));
  for (const d of deals) {
    const r = byDeal.get(d.id);
    rows.push({
      key: r?.key || "deal-" + d.id,
      version: r?.version || 0,
      dealId: d.id,
      dealVersion: d.updatedAt.toISOString(),
      values: {
        ...(r?.values as Values),
        ...fromDeal(d),
        clientId: d.clientId,
        partnerId: d.partnerId || "",
      },
    });
  }
  return (
    <Workspace
      initial={rows}
      today={businessToday()}
      columns={resolveColumns(fields)}
      clients={clients}
      partners={partners}
      create={can(u, "deals.create")}
      edit={can(u, "deals.edit_own") || can(u, "deals.edit_any")}
      owner={u.id}
    />
  );
}
