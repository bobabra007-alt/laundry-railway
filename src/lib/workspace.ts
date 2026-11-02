import { DEAL_STATUSES, type Status } from "./deal-status";
import { parseCalendarDate } from "./dates";

export type Values = Record<string, string>;
export type Column = {
  key: string;
  name: string;
  kind: string;
  required: boolean;
  shared: boolean;
};
export type SheetRow = {
  key: string;
  version: number;
  dealId: string;
  dealVersion: string;
  values: Values;
};
export const baseColumns: Column[] = [
  ["dealDate", "Дата принятия заказа", "date"],
  ["title", "Название сделки", "text"],
  ["material", "Материал", "text"],
  ["client", "Клиент", "text"],
  ["partner", "Партнёр", "text"],
  ["status", "Этап", "status"],
  ["amount", "Сумма, USDT", "number"],
  ["transactionDate", "Дата транзакции", "date"],
  ["partnerRate", "Процент партнёра", "number"],
  ["clientRate", "Процент клиента", "number"],
].map(([key, name, kind]) => ({
  key,
  name,
  kind,
  required: true,
  shared: !["material", "transactionDate"].includes(key),
}));

export const noPartner = "Без партнёра";
export function calendar(value: string, year: string) {
  const match = /^(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?$/.exec(value.trim());
  return match
    ? [
        match[3] || year,
        match[2].padStart(2, "0"),
        match[1].padStart(2, "0"),
      ].join("-")
    : value.trim();
}
export function statusCode(value: string): Status | undefined {
  return (Object.keys(DEAL_STATUSES) as Status[]).find(
    (k) =>
      k === value ||
      DEAL_STATUSES[k].toLowerCase() === value.trim().toLowerCase(),
  );
}
export function issues(values: Values, columns: Column[]) {
  const errors: string[] = [];
  for (const c of columns) {
    const v = values[c.key]?.trim() || "";
    if (!v) {
      if (c.required) errors.push(c.name);
      continue;
    }
    if (c.kind === "date") {
      try {
        parseCalendarDate(v);
      } catch {
        errors.push(c.name + " (дата)");
      }
    }
    if (c.kind === "status" && !statusCode(v))
      errors.push("Выберите этап Laundra");
    if (c.kind === "number") {
      const n = Number(v.replace(",", "."));
      if (
        !/^-?\d+(?:[.,]\d{1,2})?$/.test(v) ||
        !Number.isFinite(n) ||
        (c.key === "amount" && (n <= 0 || n > 1e12)) ||
        (["partnerRate", "clientRate"].includes(c.key) && (n < 0 || n > 100))
      )
        errors.push(c.name + " (значение)");
    }
    if (c.kind === "check" && !["Да", "Нет"].includes(v))
      errors.push(c.name + " (Да/Нет)");
  }
  return errors;
}
export function meaningful(values: Values) {
  return Object.entries(values).some(
    ([key, v]) => !["dealDate", "transactionDate"].includes(key) && v.trim(),
  );
}
export function fromDeal(d: {
  title: string;
  client: { name: string };
  partner: { name: string } | null;
  amount: unknown;
  clientRate: unknown;
  partnerRate: unknown;
  dealDate: Date;
  status: Status;
}): Values {
  return {
    title: d.title,
    client: d.client.name,
    partner: d.partner?.name || noPartner,
    dealDate: d.dealDate.toISOString().slice(0, 10),
    status: DEAL_STATUSES[d.status],
    amount: String(d.amount),
    clientRate: String(d.clientRate),
    partnerRate: String(d.partnerRate),
  };
}

export function resolveColumns(
  fields: {
    id: string;
    name: string;
    kind: string;
    required: boolean;
    shared: boolean;
  }[],
): Column[] {
  const cols = baseColumns.map((c) => ({ ...c }));
  for (const f of fields) {
    const builtin = cols.find((c) => c.name === f.name);
    if (builtin) {
      builtin.shared = f.shared;
      builtin.required = f.required;
    } else
      cols.push({
        key: f.id,
        name: f.name,
        kind: f.kind,
        required: f.required,
        shared: f.shared,
      });
  }
  return cols;
}
