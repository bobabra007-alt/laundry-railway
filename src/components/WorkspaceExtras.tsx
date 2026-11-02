import { prisma } from "@/lib/db";
import { resolveColumns, baseColumns, type Values } from "@/lib/workspace";
export default async function WorkspaceExtras({
  dealId,
  viewer,
}: {
  dealId: string;
  viewer: string;
}) {
  const rows = await prisma.workspaceRow.findMany({
    where: { dealId },
    select: { ownerId: true, values: true },
  });
  const fields = await prisma.workspaceField.findMany({
    where: {
      ownerId: { in: rows.map((r) => r.ownerId) },
      OR: [{ shared: true }, { ownerId: viewer }],
    },
  });
  const entries = rows.flatMap((r) => {
    const values = r.values as Values;
    const visible = resolveColumns(
      fields.filter((f) => f.ownerId === r.ownerId),
    )
      .filter(
        (c) =>
          (c.shared || viewer === r.ownerId) &&
          !baseColumns.some((b) => b.shared && b.key === c.key),
      )
      .map((c) => [c.name, values[c.key]]);
    return visible.filter(([, v]) => v);
  });
  return entries.length ? (
    <section className="card stack">
      <h2 className="section">Поля рабочей таблицы</h2>
      {entries.map(([k, v], i) => (
        <div className="row" key={i}>
          <span>{k}</span>
          <b>{v}</b>
        </div>
      ))}
    </section>
  ) : null;
}
