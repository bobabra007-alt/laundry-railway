import test from "node:test";
import assert from "node:assert/strict";
import { baseColumns, issues, resolveColumns } from "../src/lib/workspace";
import {
  readWorkbook,
  exportRows,
  convert,
  defaultMap,
} from "../src/lib/workspace-excel";

test("employee layout preserves material and zero rates and skips date-only rows", () => {
  const source = {
    headers: [
      "Материал",
      "Дата принятие заказа",
      "Этап",
      "Сумма (cнятых)\n$",
      "дата транзы",
      "процент партнера",
    ],
    fingerprint: "fixture",
    records: [
      { line: 2, cells: ["00000", "13.07", "ОПЛАЧЕН", "4430", "", "0"] },
      { line: 3, cells: ["", "", "", "", "17/09", ""] },
    ],
  };
  const result = convert(
    source,
    defaultMap(source.headers, baseColumns),
    baseColumns,
    "2026",
  );
  assert.equal(result.skipped, 1);
  const r = result.rows[0];
  assert.equal(r.values.material, "00000");
  assert.equal(r.values.dealDate, "2026-07-13");
  assert.equal(r.values.amount, "4430");
  assert.ok(issues(r.values, baseColumns).includes("Выберите этап Laundra"));
  assert.ok(!issues(r.values, baseColumns).includes("Процент партнёра"));
});
test("xlsx round trip preserves field values, strings with leading zeros and version identifiers", async () => {
  const columns = resolveColumns([
    {
      id: "note",
      name: "Моя заметка",
      kind: "text",
      required: false,
      shared: false,
    },
  ]);
  const r = {
    key: "test",
    version: 3,
    dealId: "deal1",
    dealVersion: "2026-10-01T00:00:00.000Z",
    values: { material: "00000", amount: "4430", note: "=1+1" },
  };
  const blob = await exportRows([r], columns);
  const source = await readWorkbook(await blob.arrayBuffer());
  const result = convert(
    source,
    defaultMap(source.headers, columns),
    columns,
    "2026",
  ).rows[0];
  assert.equal(result.key, r.key);
  assert.equal(result.dealId, r.dealId);
  assert.equal(result.version, 3);
  assert.equal(result.values.material, r.values.material);
  assert.equal(result.values.note, r.values.note);
  assert.equal(result.dealVersion, r.dealVersion);
});
