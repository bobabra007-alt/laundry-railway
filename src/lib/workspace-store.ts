import type { Prisma } from "../../generated/prisma/client";
import { editDeal, type DealEditor } from "./deal-edit";
import { insertDeal, setDealStatus } from "./deal-write";
import { hasPermission as can } from "./permissions";
import {
  baseColumns,
  issues,
  noPartner,
  statusCode,
  meaningful,
  fromDeal,
  resolveColumns,
  type SheetRow,
} from "./workspace";
import { parseCalendarDate } from "./dates";

export async function storeSheetRow(
  tx: Prisma.TransactionClient,
  u: DealEditor,
  r: SheetRow,
) {
  const fields = await tx.workspaceField.findMany({ where: { ownerId: u.id } });
  const columns = resolveColumns(fields);
  const values = Object.fromEntries(
    columns.map((c) => [c.key, r.values[c.key]?.trim() || ""]),
  );
  if (!meaningful(values)) throw new Error("Пустая строка");
  const where = { ownerId_key: { ownerId: u.id, key: r.key } };
  const saved = await tx.workspaceRow.findUnique({ where });
  if ((saved?.version || 0) !== r.version)
    throw new Error("Строка уже сохранена или изменена. Обновите таблицу.");
  if (saved && (saved.dealId || "") !== r.dealId)
    throw new Error("Связь со сделкой изменилась");
  if (!saved && r.dealId && r.key !== "deal-" + r.dealId)
    throw new Error("Некорректная ссылка на сделку");
  if (!saved && r.key.startsWith("deal-") && !r.dealId)
    throw new Error("Некорректный ключ");
  const existing = r.dealId
    ? await tx.deal.findFirst({
        where: { id: r.dealId, assignedTo: u.id, deletedAt: null },
        include: { client: true, partner: true },
      })
    : null;
  if (
    r.dealId &&
    (!existing || existing.updatedAt.toISOString() !== r.dealVersion)
  )
    throw new Error("Сделка недоступна или изменена. Обновите таблицу.");
  if (
    existing
      ? !(can(u, "deals.edit_own") || can(u, "deals.edit_any"))
      : !can(u, "deals.create")
  )
    throw new Error("Недостаточно прав");
  const missing = issues(values, columns);
  if (existing && missing.length)
    throw new Error("Для изменения сделки заполните: " + missing.join(", "));
  let dealId = r.dealId || null;
  if (!missing.length) {
    const fd = new FormData();
    for (const k of [
      "title",
      "dealDate",
      "amount",
      "partnerRate",
      "clientRate",
    ])
      fd.set(k, values[k]);
    // Find by exact name after the user selects/types it; ambiguous names require an explicit ID.
    for (const role of ["client", "partner"] as const) {
      const name = values[role];
      if (role === "partner" && name === noPartner) continue;
      const chosen = r.values[role + "Id"];
      if (chosen) {
        const record =
          role === "client"
            ? await tx.client.findUnique({ where: { id: chosen } })
            : await tx.partner.findUnique({ where: { id: chosen } });
        if (record?.name !== name)
          throw new Error("Контакт изменился. Выберите его заново.");
        fd.set(role + "Id", chosen);
      } else {
        const matches =
          role === "client"
            ? await tx.client.findMany({
                where: {
                  name: { equals: name, mode: "insensitive" },
                  assignedTo: u.id,
                  status: { not: "ARCHIVED" },
                },
                take: 2,
              })
            : await tx.partner.findMany({
                where: {
                  name: { equals: name, mode: "insensitive" },
                  archived: false,
                },
                take: 2,
              });
        if (matches.length > 1)
          throw new Error(
            "Несколько контактов с именем " +
              name +
              ". Выберите конкретную запись.",
          );
        if (matches.length) fd.set(role + "Id", matches[0].id);
        else fd.set(role + "Name", name);
      }
    }
    if (!existing) dealId = await insertDeal(tx, u, fd);
    else {
      if (fd.has("clientName") || fd.has("partnerName"))
        throw new Error(
          "Для изменения опубликованной сделки выберите существующий контакт.",
        );
      const before = fromDeal(existing);
      if (
        existing.clientId !== fd.get("clientId") ||
        existing.partnerId !== (fd.get("partnerId") || null) ||
        Object.keys(before).some(
          (k) => k !== "status" && values[k] !== before[k],
        )
      ) {
        await editDeal(tx, u, existing.id, {
          version: r.dealVersion,
          title: values.title,
          clientId: String(fd.get("clientId")),
          partnerId: String(fd.get("partnerId") || "") || null,
          assignedTo: u.id,
          amount: Number(values.amount.replace(",", ".")),
          partnerRate: Number(values.partnerRate.replace(",", ".")),
          clientRate: Number(values.clientRate.replace(",", ".")),
          dealDate: parseCalendarDate(values.dealDate),
          dueOn: existing.dueOn,
          expectedPaymentOn: existing.expectedPaymentOn,
          waitingReason: existing.waitingReason,
        });
      }
    }
    const status = statusCode(values.status)!;
    if (status !== (existing?.status || "NEW"))
      await setDealStatus(tx, u, dealId!, status);
  }
  const data = dealId
    ? Object.fromEntries(
        Object.entries(values).filter(
          ([key]) => !baseColumns.some((c) => c.key === key && c.shared),
        ),
      )
    : values;
  for (const role of ["client", "partner"])
    if (!dealId && r.values[role + "Id"])
      data[role + "Id"] = r.values[role + "Id"];
  const record = await tx.workspaceRow.upsert({
    where,
    create: { ownerId: u.id, key: r.key, values: data, dealId },
    update: { values: data, dealId, version: { increment: 1 } },
  });
  const d = dealId
    ? await tx.deal.findUniqueOrThrow({
        where: { id: dealId },
        select: { updatedAt: true },
      })
    : null;
  return {
    dealId: dealId || "",
    dealVersion: d?.updatedAt.toISOString() || "",
    version: record.version,
    missing,
  };
}
