import type { Cell } from "exceljs";
import {
  calendar,
  meaningful,
  type Column,
  type SheetRow,
  type Values,
} from "./workspace";
import { calcDeal } from "./money";

const meta = ["ID строки", "ID сделки", "Версия строки", "Версия сделки"];
const norm = (s: string) =>
  s
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .replace(/[^а-яa-z0-9]/g, "");
const aliases: Record<string, string> = {
  датапринятиезаказа: "dealDate",
  материал: "material",
  дататранзы: "transactionDate",
  процентпартнера: "partnerRate",
  процентклиента: "clientRate",
  суммаснятых: "amount",
  суммаcнятых: "amount",
  название: "title",
};
export type Source = {
  headers: string[];
  records: { line: number; cells: string[] }[];
  fingerprint: string;
};
function readCell(cell: Cell): string {
  const v = cell.value;
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && cell.numFmt?.includes("%"))
    return String(+(v * 100).toFixed(8));
  if (typeof v === "number" && /^0{2,}$/.test(cell.numFmt || ""))
    return String(v).padStart(cell.numFmt.length, "0");
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return String(v.text);
    if ("result" in v) return String(v.result ?? "");
    return "";
  }
  return String(v).trim();
}
export async function readWorkbook(buffer: ArrayBuffer): Promise<Source> {
  if (buffer.byteLength > 5 * 1024 * 1024)
    throw new Error("Максимальный размер XLSX — 5 МБ.");
  const { default: Excel } = await import("exceljs");
  const book = new Excel.Workbook();
  await book.xlsx.load(buffer);
  const sheet = book.worksheets[0];
  if (!sheet) throw new Error("Пустая книга");
  if (sheet.rowCount > 15000 || sheet.columnCount > 120)
    throw new Error("До 15 000 строк и 120 колонок на лист.");
  const headers: string[] = [];
  sheet.getRow(1).eachCell((cell, i) => {
    headers[i - 1] = readCell(cell);
  });
  const records: Source["records"] = [];
  sheet.eachRow((row, line) => {
    if (line === 1) return;
    const cells = headers.map((_, i) => readCell(row.getCell(i + 1)));
    if (cells.some(Boolean)) records.push({ line, cells });
  });
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return {
    headers,
    records,
    fingerprint: Array.from(new Uint8Array(hash), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join(""),
  };
}
export function defaultMap(headers: string[], columns: Column[]) {
  return headers.map((h) =>
    meta.includes(h)
      ? h
      : columns.find((c) => norm(c.name) === norm(h))?.key ||
        aliases[norm(h)] ||
        "",
  );
}
export function convert(
  source: Source,
  mapping: string[],
  columns: Column[],
  year: string,
) {
  const rows: SheetRow[] = [];
  let skipped = 0;
  if (new Set(mapping.filter(Boolean)).size !== mapping.filter(Boolean).length)
    throw new Error("Два столбца назначены одному полю");
  for (const record of source.records) {
    const values: Values = {};
    const info: Values = {};
    mapping.forEach((k, i) => {
      if (!k) return;
      const v = record.cells[i] || "";
      if (meta.includes(k)) {
        info[k] = v;
        return;
      }
      values[k] =
        columns.find((c) => c.key === k)?.kind === "date"
          ? calendar(v, year)
          : v;
    });
    if (!meaningful(values)) {
      skipped++;
      continue;
    }
    rows.push({
      key: info[meta[0]] || "xlsx-" + source.fingerprint + "-" + record.line,
      dealId: info[meta[1]] || "",
      version: Number(info[meta[2]] || 0),
      dealVersion: info[meta[3]] || "",
      values,
    });
  }
  return { rows, skipped };
}
export async function exportRows(rows: SheetRow[], columns: Column[]) {
  const { default: Excel } = await import("exceljs");
  const book = new Excel.Workbook(),
    s = book.addWorksheet("Моя таблица");
  s.addRow([...columns.map((c) => c.name), "Расчётная прибыль", ...meta]);
  for (const r of rows) {
    const v = r.values;
    const money = ["amount", "partnerRate", "clientRate"].map((k) =>
      v[k]?.trim() ? Number(v[k].replace(",", ".")) : NaN,
    );
    const row = s.addRow([
      ...columns.map((c) => {
        const text = v[c.key] ?? "";
        if (
          c.kind === "number" &&
          text.trim() &&
          Number.isFinite(Number(text.replace(",", ".")))
        ) {
          const n = Number(text.replace(",", "."));
          return c.key.endsWith("Rate") ? n / 100 : n;
        }
        return text;
      }),
      money.every(Number.isFinite)
        ? calcDeal(money[0], money[1], money[2]).fee
        : "",
      r.key,
      r.dealId,
      r.version,
      r.dealVersion,
    ]);
    columns.forEach((c, i) => {
      if (c.key.endsWith("Rate")) row.getCell(i + 1).numFmt = "0.00%";
    });
  }
  s.views = [{ state: "frozen", ySplit: 1 }];
  s.columns.forEach((c) => {
    c.width = 23;
  });
  s.getRow(1).font = { bold: true };
  const bytes = await book.xlsx.writeBuffer();
  return new Blob([new Uint8Array(bytes)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
