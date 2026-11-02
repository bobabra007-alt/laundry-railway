"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { currentUser, can, requireWritable } from "@/lib/access";
import { dealTransaction } from "@/lib/deal-ledger";
import { storeSheetRow } from "@/lib/workspace-store";
import { baseColumns } from "@/lib/workspace";

const input = z.object({
  key: z.string().regex(/^[a-zA-Z0-9_-]{1,150}$/),
  version: z.number().int().nonnegative(),
  dealId: z.string().max(100),
  dealVersion: z.string().max(40),
  values: z.record(z.string().max(100), z.string().max(1500)),
});
const fieldInput = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(["text", "date", "number", "check"]),
  shared: z.boolean(),
  required: z.boolean(),
});
export async function addField(raw: unknown) {
  const u = await currentUser();
  requireWritable(u);
  const data = fieldInput.parse(raw);
  if (!can(u, "deals.create")) throw new Error("Нет права создавать сделки");
  if (
    [
      ...baseColumns.map((c) => c.name),
      "ID сделки",
      "Расчётная прибыль",
      "Прибыль",
      "ID строки",
      "Версия строки",
      "Версия сделки",
    ].some((n) => n.toLowerCase() === data.name.toLowerCase())
  )
    throw new Error("Название уже занято");
  await prisma.workspaceField.create({ data: { ownerId: u.id, ...data } });
  revalidatePath("/workspace");
}
export async function saveRow(raw: unknown) {
  const u = await currentUser();
  requireWritable(u);
  const r = input.parse(raw);
  if (Object.keys(r.values).length > 120)
    throw new Error("Слишком много колонок");
  try {
    const result = await dealTransaction((tx) => storeSheetRow(tx, u, r));
    for (const path of [
      "/workspace",
      "/deals",
      "/",
      "/analytics",
      "/clients",
      "/payouts",
      ...(result.dealId ? ["/deals/" + result.dealId] : []),
    ])
      revalidatePath(path);
    return { ok: true as const, ...result };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Ошибка сохранения",
    };
  }
}

export async function changeField(id: string, raw: unknown) {
  const u = await currentUser();
  requireWritable(u);
  if (!can(u, "deals.create")) throw new Error("Нет права настройки");
  const flags = z
    .object({ required: z.boolean(), shared: z.boolean() })
    .parse(raw);
  const builtin = baseColumns.find((c) => c.key === id && !c.shared);
  if (builtin) {
    await prisma.workspaceField.upsert({
      where: { ownerId_name: { ownerId: u.id, name: builtin.name } },
      create: {
        ownerId: u.id,
        name: builtin.name,
        kind: builtin.kind,
        ...flags,
      },
      update: flags,
    });
    revalidatePath("/workspace");
    return;
  }
  const result = await prisma.workspaceField.updateMany({
    where: { id, ownerId: u.id },
    data: flags,
  });
  if (!result.count) throw new Error("Поле недоступно");
  revalidatePath("/workspace");
}
