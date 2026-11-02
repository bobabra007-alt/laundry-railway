import type { Prisma } from "../../generated/prisma/client";
import type { DealEditor } from "./deal-edit";
import { hasPermission as can } from "./permissions";
import { businessToday, parseCalendarDate } from "./dates";
import { calcDeal, inputNumber } from "./money";
import { lockDeal, ensureAllocations, reconcileDeal } from "./deal-ledger";
import type { Status } from "./deal-status";

export function dealDates(fd: FormData) {
  const dealDate = parseCalendarDate(
    String(fd.get("dealDate") || businessToday()),
  );
  const optional = (key: string) =>
    fd.get(key) ? parseCalendarDate(String(fd.get(key))) : null;
  const dueOn = optional("dueOn"),
    expectedPaymentOn = optional("expectedPaymentOn"),
    waitingReason = String(fd.get("waitingReason") ?? "").trim();
  if (waitingReason.length > 1000)
    throw new Error("Причина ожидания: до 1000 символов");
  if (dueOn && dueOn < dealDate)
    throw new Error("Срок исполнения не может быть раньше даты сделки");
  if (expectedPaymentOn && expectedPaymentOn < dealDate)
    throw new Error("Ожидаемая оплата не может быть раньше даты сделки");
  return {
    dealDate,
    dueOn,
    expectedPaymentOn,
    waitingReason: waitingReason || null,
  };
}

export async function insertDeal(
  tx: Prisma.TransactionClient,
  u: DealEditor,
  fd: FormData,
) {
  const title = String(fd.get("title") ?? "").trim(),
    amount = inputNumber(fd.get("amount")),
    partnerRate = inputNumber(fd.get("partnerRate")),
    clientRate = inputNumber(fd.get("clientRate"));
  if (!title || title.length > 200)
    throw new Error("Название: от 1 до 200 символов");
  if (
    [amount, partnerRate, clientRate].some(
      (n) => Math.abs(n * 100 - Math.round(n * 100)) > 0.0001,
    )
  )
    throw new Error("Используйте не более двух знаков после запятой");
  if (
    amount <= 0 ||
    amount > 1e12 ||
    partnerRate < 0 ||
    partnerRate > 100 ||
    clientRate < 0 ||
    clientRate > 100
  )
    throw new Error("Сумма должна быть положительной, проценты — от 0 до 100");
  const dates = dealDates(fd);
  let clientId = String(fd.get("clientId") ?? ""),
    partnerId = String(fd.get("partnerId") ?? "") || null;
  if (!clientId) {
    const name = String(fd.get("clientName") ?? "").trim();
    if (!name || name.length > 200)
      throw new Error("Выберите клиента или введите его имя");
    if (!can(u, "clients.create"))
      throw new Error("Для нового клиента требуется право создавать клиентов");
    const existing = await tx.client.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
    if (existing) {
      if (existing.assignedTo !== u.id || existing.status === "ARCHIVED")
        throw new Error(
          "Этот клиент уже есть у другого ответственного или в архиве. Выберите своего клиента.",
        );
      clientId = existing.id;
    } else {
      const c = await tx.client.create({
        data: { name, assignedTo: u.id, createdBy: u.id },
      });
      clientId = c.id;
      await tx.clientAssignmentHistory.create({
        data: { clientId, toUserId: u.id, changedBy: u.id },
      });
      await tx.auditLog.create({
        data: {
          userId: u.id,
          action: "CREATE",
          entity: "client",
          entityId: clientId,
        },
      });
    }
  }
  const client = await tx.client.findFirst({
    where: { id: clientId, assignedTo: u.id, status: { not: "ARCHIVED" } },
  });
  if (!client)
    throw new Error("Сделку может создать только ответственный за клиента");
  const partnerName = String(fd.get("partnerName") ?? "").trim();
  if (!partnerId && partnerName) {
    if (partnerName.length > 200)
      throw new Error("Имя партнёра слишком длинное");
    const existing = await tx.partner.findFirst({
      where: { name: { equals: partnerName, mode: "insensitive" } },
    });
    if (existing) {
      if (existing.archived) throw new Error("Партнёр находится в архиве");
      partnerId = existing.id;
    } else {
      if (!can(u, "partners.manage"))
        throw new Error(
          "Для нового партнёра требуется право управления партнёрами",
        );
      const p = await tx.partner.create({ data: { name: partnerName } });
      partnerId = p.id;
      await tx.auditLog.create({
        data: {
          userId: u.id,
          action: "CREATE",
          entity: "partner",
          entityId: p.id,
        },
      });
    }
  }
  if (
    partnerId &&
    !(await tx.partner.findFirst({ where: { id: partnerId, archived: false } }))
  )
    throw new Error("Партнёр не найден");
  const d = await tx.deal.create({
    data: {
      ...dates,
      title,
      clientId,
      partnerId,
      assignedTo: u.id,
      createdBy: u.id,
      amount,
      partnerRate,
      clientRate,
      ...calcDeal(amount, partnerRate, clientRate),
      employeeCount: 4,
      allocationVersion: 1,
      status: "NEW",
    },
  });
  await tx.userPreference.upsert({
    where: { userId: u.id },
    update: { lastPartnerRate: partnerRate, lastClientRate: clientRate },
    create: {
      userId: u.id,
      lastPartnerRate: partnerRate,
      lastClientRate: clientRate,
    },
  });
  await tx.auditLog.create({
    data: {
      userId: u.id,
      action: "CREATE",
      entity: "deal",
      entityId: d.id,
      payload: { amount, partnerRate, clientRate },
    },
  });
  return d.id;
}

export async function setDealStatus(
  tx: Prisma.TransactionClient,
  u: DealEditor,
  id: string,
  status: Status,
) {
  const d = await lockDeal(tx, id);
  if (d.deletedAt) throw new Error("Сначала восстановите сделку из архива");
  if (
    !can(u, "deals.edit_any") &&
    !(d.assignedTo === u.id && can(u, "deals.edit_own"))
  )
    throw new Error("Нет права изменять эту сделку");
  if (status === d.status) return;
  if (status === "COMPLETED" && !can(u, "deals.complete"))
    throw new Error("Нет права завершать сделки");
  if (d.status === "COMPLETED" && u.role !== "SUPER_ADMIN")
    throw new Error(
      "Повторно открыть завершённую сделку может только администратор",
    );
  if (status === "COMPLETED") await ensureAllocations(tx, id);
  if (status === "COMPLETED" || d.posted)
    await reconcileDeal(
      tx,
      id,
      status === "COMPLETED",
      u.id,
      status === "COMPLETED"
        ? "Начисление после завершения сделки"
        : "Отмена начислений после изменения статуса",
    );
  await tx.deal.update({
    where: { id },
    data: { status, closedAt: status === "COMPLETED" ? new Date() : null },
  });
  await tx.auditLog.create({
    data: {
      userId: u.id,
      action: "CHANGE_STATUS",
      entity: "deal",
      entityId: id,
      payload: { from: d.status, to: status },
    },
  });
}
