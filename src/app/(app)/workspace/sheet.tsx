"use client";
import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { addField, changeField, saveRow } from "./actions";
import { DEAL_STATUSES } from "@/lib/deal-status";
import {
  baseColumns,
  issues,
  noPartner,
  statusCode,
  type Column,
  type SheetRow,
} from "@/lib/workspace";
import {
  convert,
  defaultMap,
  exportRows,
  readWorkbook,
  type Source,
} from "@/lib/workspace-excel";
import { calcDeal, fmt } from "@/lib/money";

type Contact = { id: string; name: string };
type Props = {
  initial: SheetRow[];
  columns: Column[];
  clients: Contact[];
  partners: Contact[];
  create: boolean;
  edit: boolean;
  today: string;
  owner: string;
};
const systemKeys = new Set(baseColumns.map((c) => c.key));
export default function Workspace(p: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(p.initial),
    [editor, setEditor] = useState<SheetRow | null>(null);
  const [tab, setTab] = useState("all"),
    [busy, loading] = useState(false),
    [note, notify] = useState("");
  const [source, setSource] = useState<Source | null>(null),
    [mapping, setMapping] = useState<string[]>([]),
    [stages, setStages] = useState<Record<string, string>>({});
  const [order, setOrder] = useState<string[]>([]),
    [hidden, setHidden] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [cell, setCell] = useState<{
    row: SheetRow;
    key: string;
    text: string;
  } | null>(null);
  function mapKey(headers: string[]) {
    return "laundra-xlsx-map-" + p.owner + "-" + JSON.stringify(headers);
  }
  function restoreMap(s: Source) {
    const standard = defaultMap(s.headers, p.columns);
    try {
      const saved = JSON.parse(
        localStorage.getItem(mapKey(s.headers)) || "null",
      );
      if (Array.isArray(saved) && saved.length === s.headers.length)
        return saved.map((v, i) =>
          p.columns.some((c) => c.key === v) || standard.includes(v) || v === ""
            ? v
            : standard[i],
        );
    } catch {}
    return standard;
  }
  async function commitCell() {
    if (!cell) return;
    const changed = {
      ...cell.row,
      values: { ...cell.row.values, [cell.key]: cell.text },
    };
    if (cell.key === "client" || cell.key === "partner")
      changed.values[cell.key + "Id"] = "";
    const result = await persist(changed);
    setCell(null);
    notify(
      result.dealId ? "Изменение сохранено в сделке" : "Черновик сохранён",
    );
    router.refresh();
  }
  useEffect(() => setRows(p.initial), [p.initial]);
  const prefKey = "laundra-table-columns-" + p.owner;
  useEffect(() => {
    try {
      const pref = JSON.parse(localStorage.getItem(prefKey) || "{}");
      setOrder(pref.order || []);
      setHidden(pref.hidden || []);
    } catch {}
  }, [prefKey]);
  const columns = [
    ...new Set([...order, ...p.columns.map((c) => c.key)]),
  ].flatMap((k) => p.columns.filter((c) => c.key === k));
  const visible = columns.filter((c) => !hidden.includes(c.key));
  function preferences(o: string[], h: string[]) {
    setOrder(o);
    setHidden(h);
    localStorage.setItem(prefKey, JSON.stringify({ order: o, hidden: h }));
  }
  const filtered = rows.filter(
    (r) =>
      (tab === "all" || (tab === "draft") === !r.dealId) &&
      Object.values(r.values)
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const preview = useMemo(() => {
    if (!source) return null;
    try {
      const plan = convert(source, mapping, p.columns, p.today.slice(0, 4));
      const unknown = [
        ...new Set(
          plan.rows
            .map((r) => r.values.status)
            .filter((v) => v && !statusCode(v)),
        ),
      ];
      for (const r of plan.rows)
        if (stages[r.values.status]) r.values.status = stages[r.values.status];
      return { ...plan, unknown, error: "" };
    } catch (e) {
      return { rows: [], skipped: 0, unknown: [], error: String(e) };
    }
  }, [source, mapping, p.columns, p.today, stages]);
  async function run(work: () => Promise<void>) {
    if (busy) return;
    loading(true);
    notify("");
    try {
      await work();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Ошибка");
    } finally {
      loading(false);
    }
  }
  async function persist(row: SheetRow) {
    const result = await saveRow(row);
    if (!result.ok) throw new Error(result.error);
    const updated = {
      ...row,
      version: result.version,
      dealId: result.dealId,
      dealVersion: result.dealVersion,
    };
    setRows((old) => [updated, ...old.filter((r) => r.key !== row.key)]);
    return updated;
  }
  async function importRows() {
    if (!preview || preview.error) return;
    if (source)
      localStorage.setItem(mapKey(source.headers), JSON.stringify(mapping));
    let done = 0,
      drafts = 0,
      duplicates = 0;
    const errors: string[] = [];
    const seen = new Set<string>();
    for (const [i, r] of preview.rows.entries()) {
      const identity = r.dealId || r.key;
      if (seen.has(identity)) {
        duplicates++;
        continue;
      }
      seen.add(identity);
      const prev = rows.find((x) => x.key === r.key);
      if (prev && r.key.startsWith("xlsx-") && !r.version) {
        duplicates++;
        continue;
      }
      if (
        prev &&
        prev.version === r.version &&
        prev.dealVersion === r.dealVersion &&
        p.columns.every(
          (c) => (prev.values[c.key] || "") === (r.values[c.key] || ""),
        )
      ) {
        duplicates++;
        continue;
      }
      try {
        const updated = await persist(r);
        if (updated.dealId) done++;
        else drafts++;
      } catch (e) {
        errors.push(
          "Запись " +
            (i + 1) +
            ": " +
            (e instanceof Error ? e.message : "Ошибка"),
        );
      }
    }
    notify(
      "Сделки: " +
        done +
        ". Черновики: " +
        drafts +
        ". Без изменений / повторы: " +
        duplicates +
        ". Ошибки: " +
        errors.length +
        ". " +
        errors.slice(0, 6).join(" · "),
    );
    setSource(null);
    router.refresh();
  }
  function update(k: string, v: string) {
    setEditor((r) =>
      r
        ? {
            ...r,
            values: {
              ...r.values,
              [k]: v,
              ...(["client", "partner"].includes(k) ? { [k + "Id"]: "" } : {}),
            },
          }
        : null,
    );
  }
  const myDeals = rows.filter((r) => r.dealId);
  const revenue = myDeals
    .filter((r) => statusCode(r.values.status) === "COMPLETED")
    .reduce(
      (sum, r) =>
        sum +
        calcDeal(
          Number(r.values.amount),
          Number(r.values.partnerRate),
          Number(r.values.clientRate),
        ).fee,
      0,
    );
  return (
    <div className="stack work-table">
      <header>
        <h1 className="title">Моя таблица</h1>
        <p className="sub">Мои сделки и личные черновики · USDT</p>
      </header>
      <div className="grid cards">
        {[
          ["Мои сделки", myDeals.length],
          ["Мои черновики", rows.length - myDeals.length],
          ["Прибыль завершённых за всё время", fmt(revenue)],
        ].map(([k, v]) => (
          <div className="card" key={k}>
            <span className="sub">{k}</span>
            <div className="kpi">{v}</div>
          </div>
        ))}
      </div>
      <div className="quick-links">
        {p.create && (
          <button
            disabled={busy}
            className="btn primary"
            onClick={() =>
              setEditor({
                key: crypto.randomUUID(),
                version: 0,
                dealId: "",
                dealVersion: "",
                values: { dealDate: p.today, status: "Новая" },
              })
            }
          >
            + Строка
          </button>
        )}
        {p.create && (
          <label className="btn">
            Импорт Excel
            <input
              type="file"
              accept=".xlsx"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file)
                  void run(async () => {
                    if (file.size > 5242880) throw Error("До 5 МБ");
                    const s = await readWorkbook(await file.arrayBuffer());
                    setSource(s);
                    setMapping(restoreMap(s));
                    setStages({});
                  });
              }}
            />
          </label>
        )}
        <button
          className="btn"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const blob = await exportRows(filtered, columns);
              const a = document.createElement("a"),
                url = URL.createObjectURL(blob);
              a.href = url;
              a.download = "Моя таблица " + p.today + ".xlsx";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 20000);
            })
          }
        >
          Экспорт выборки .xlsx
        </button>
        <a className="btn" href="/deals/new">
          Обычная форма сделки
        </a>
      </div>
      {note && (
        <div role="status" className="notice">
          {note}
        </div>
      )}
      <details className="card">
        <summary>Настроить колонки</summary>
        {columns.map((c, i) => (
          <div key={c.key} className="row">
            <label>
              <input
                type="checkbox"
                checked={!hidden.includes(c.key)}
                onChange={() =>
                  preferences(
                    columns.map((v) => v.key),
                    hidden.includes(c.key)
                      ? hidden.filter((k) => k !== c.key)
                      : [...hidden, c.key],
                  )
                }
              />{" "}
              {c.name}
            </label>
            <span>
              {c.required ? "Обязательно" : "По желанию"} ·{" "}
              {c.shared ? "Команде" : "Только мне"}
            </span>
            <button
              disabled={!i}
              onClick={() => {
                const o = columns.map((v) => v.key);
                [o[i - 1], o[i]] = [o[i], o[i - 1]];
                preferences(o, hidden);
              }}
              aria-label={"Поднять " + c.name}
            >
              ↑
            </button>
            {(!systemKeys.has(c.key) ||
              ["material", "transactionDate"].includes(c.key)) &&
              p.create && (
                <span>
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await changeField(c.key, {
                          required: !c.required,
                          shared: c.shared,
                        });
                        router.refresh();
                      })
                    }
                  >
                    Изменить обязательность
                  </button>{" "}
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        if (
                          !c.shared &&
                          !window.confirm(
                            "Открыть значения этого поля команде в опубликованных сделках?",
                          )
                        )
                          return;
                        await changeField(c.key, {
                          required: c.required,
                          shared: !c.shared,
                        });
                        router.refresh();
                      })
                    }
                  >
                    Изменить видимость
                  </button>
                </span>
              )}
          </div>
        ))}
        {p.create && (
          <form
            className="quick-links"
            onSubmit={(e) => {
              e.preventDefault();
              const f = e.currentTarget,
                fd = new FormData(f);
              void run(async () => {
                await addField({
                  name: fd.get("name"),
                  kind: fd.get("kind"),
                  required: fd.has("required"),
                  shared: fd.has("shared"),
                });
                f.reset();
                router.refresh();
              });
            }}
          >
            <input
              aria-label="Название поля"
              name="name"
              placeholder="Название поля"
              maxLength={60}
              required
            />
            <select aria-label="Тип поля" name="kind">
              <option value="text">Текст</option>
              <option value="date">Дата</option>
              <option value="number">Число</option>
              <option value="check">Да / Нет</option>
            </select>
            <label>
              <input type="checkbox" name="required" defaultChecked />{" "}
              Обязательно
            </label>
            <label>
              <input type="checkbox" name="shared" /> Видит команда
            </label>
            <button disabled={busy} className="btn">
              Добавить поле
            </button>
          </form>
        )}
      </details>
      {preview && source && (
        <section className="card stack">
          <h2>Предпросмотр импорта</h2>
          <p>
            Первый лист. Выберите соответствия столбцов. Пустые и служебные
            строки пропускаются.
          </p>
          <div className="formgrid">
            {source.headers.map((h, i) => (
              <label className="field" key={i}>
                {h}
                <select
                  disabled={busy}
                  value={mapping[i] || ""}
                  onChange={(e) =>
                    setMapping((old) =>
                      old.map((k, j) => (j === i ? e.target.value : k)),
                    )
                  }
                >
                  <option value="">Пропустить</option>
                  {[
                    ...p.columns.map((c) => [c.key, c.name]),
                    ...[
                      "ID строки",
                      "ID сделки",
                      "Версия строки",
                      "Версия сделки",
                    ].map((k) => [k, k]),
                  ].map(([k, n]) => (
                    <option key={k} value={k}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {preview.unknown.map((s) => (
            <label key={s}>
              Этап «{s}»{" "}
              <select
                disabled={busy}
                value={stages[s] || ""}
                onChange={(e) => setStages({ ...stages, [s]: e.target.value })}
              >
                <option value="">Оставить на уточнение</option>
                {Object.values(DEAL_STATUSES).map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          ))}
          <b>
            {preview.error ||
              "Записей: " +
                preview.rows.length +
                " · Пропущено: " +
                preview.skipped +
                " · С незаполненными или неверными полями: " +
                preview.rows.filter((r) => issues(r.values, p.columns).length)
                  .length}
          </b>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Результат проверки</th>
                  {columns.map((c) => (
                    <th key={c.key}>{c.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 100).map((r, i) => (
                  <tr key={i}>
                    <td>
                      {issues(r.values, p.columns).join(", ") ||
                        (statusCode(r.values.status) === "COMPLETED"
                          ? "Завершение и начисление прибыли"
                          : "Готово")}
                    </td>
                    {columns.map((c) => (
                      <td key={c.key}>{r.values[c.key] || "—"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <small>
            Предпросмотр до 100 строк. При подтверждении обрабатываются все
            записи. Неполные изменения существующей сделки будут отклонены.
          </small>
          <div>
            <button
              className="btn primary"
              disabled={busy || !!preview.error || !preview.rows.length}
              onClick={() => run(importRows)}
            >
              {busy ? "Сохранение…" : "Подтвердить импорт"}
            </button>{" "}
            <button
              className="btn"
              disabled={busy}
              onClick={() => setSource(null)}
            >
              Отмена
            </button>
          </div>
        </section>
      )}
      {editor && (
        <section className="card stack">
          <h2>{editor.dealId ? "Изменить сделку" : "Заполнить строку"}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const r = await persist(editor);
                setEditor(null);
                notify(r.dealId ? "Сделка сохранена" : "Сохранено в черновики");
                router.refresh();
              });
            }}
          >
            <div className="formgrid">
              {columns.map((c) => (
                <label className="field" key={c.key}>
                  {c.name}
                  {c.required ? " *" : ""}
                  {!c.shared ? " · только мне" : ""}
                  {c.kind === "status" || c.kind === "check" ? (
                    <select
                      value={editor.values[c.key] || ""}
                      onChange={(e) => update(c.key, e.target.value)}
                    >
                      <option value="">Выбрать</option>
                      {(c.kind === "status"
                        ? Object.values(DEAL_STATUSES)
                        : ["Да", "Нет"]
                      ).map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={c.kind === "date" ? "date" : "text"}
                      inputMode={c.kind === "number" ? "decimal" : undefined}
                      list={
                        ["client", "partner"].includes(c.key)
                          ? "list-" + c.key
                          : undefined
                      }
                      value={editor.values[c.key] || ""}
                      onChange={(e) => update(c.key, e.target.value)}
                      placeholder={
                        ["client", "partner"].includes(c.key)
                          ? "Найти или ввести новое имя"
                          : undefined
                      }
                    />
                  )}
                  {["client", "partner"].includes(c.key) && (
                    <>
                      <datalist id={"list-" + c.key}>
                        {(c.key === "client"
                          ? p.clients
                          : [{ id: "", name: noPartner }, ...p.partners]
                        ).map((o) => (
                          <option key={o.id} value={o.name} />
                        ))}
                      </datalist>
                      {(c.key === "client" ? p.clients : p.partners).filter(
                        (o) => o.name === editor.values[c.key],
                      ).length > 1 && (
                        <select
                          aria-label="Уточнить контакт"
                          value={editor.values[c.key + "Id"] || ""}
                          onChange={(e) => update(c.key + "Id", e.target.value)}
                        >
                          <option value="">Выберите запись</option>
                          {(c.key === "client" ? p.clients : p.partners)
                            .filter((o) => o.name === editor.values[c.key])
                            .map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name} · {o.id}
                              </option>
                            ))}
                        </select>
                      )}
                    </>
                  )}
                </label>
              ))}
            </div>
            <p className="sub">
              {issues(editor.values, p.columns).length
                ? "Заполнить или проверить: " +
                  issues(editor.values, p.columns).join(", ")
                : statusCode(editor.values.status) === "COMPLETED"
                  ? "После сохранения применяется правило начислений для завершённой сделки."
                  : "Строка готова к сохранению в общих сделках."}
            </p>
            <button className="btn primary" disabled={busy}>
              Сохранить строку
            </button>{" "}
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => setEditor(null)}
            >
              Закрыть
            </button>
          </form>
        </section>
      )}
      <div className="quick-links">
        {[
          ["all", "Все"],
          ["deals", "Мои сделки"],
          ["draft", "Черновики"],
        ].map(([k, n]) => (
          <button
            className={"chip " + (k === tab ? "active" : "")}
            key={k}
            onClick={() => setTab(k)}
          >
            {n}
          </button>
        ))}
        <input
          aria-label="Поиск по таблице"
          placeholder="Поиск по строкам"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Запись</th>
              {visible.map((c) => (
                <th key={c.key}>{c.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.key}>
                <td>
                  {r.dealId ? (
                    <a href={"/deals/" + r.dealId}>Открыть сделку ↗</a>
                  ) : (
                    <b>Черновик</b>
                  )}
                  {(r.dealId ? p.edit : p.create) && (
                    <button
                      className="chip"
                      disabled={busy}
                      onClick={() => {
                        setEditor({ ...r, values: { ...r.values } });
                        window.scrollTo(0, 0);
                      }}
                    >
                      Изменить
                    </button>
                  )}
                </td>
                {visible.map((c) => (
                  <td key={c.key}>
                    {cell?.row.key === r.key && cell.key === c.key ? (
                      <form
                        className="cell-edit"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void run(commitCell);
                        }}
                      >
                        {["status", "check"].includes(c.kind) ? (
                          <select
                            autoFocus
                            aria-label={c.name}
                            value={cell.text}
                            onChange={(e) =>
                              setCell({ ...cell, text: e.target.value })
                            }
                          >
                            <option value="">Выбрать</option>
                            {(c.kind === "status"
                              ? Object.values(DEAL_STATUSES)
                              : ["Да", "Нет"]
                            ).map((x) => (
                              <option key={x}>{x}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            autoFocus
                            aria-label={c.name}
                            type={c.kind === "date" ? "date" : "text"}
                            value={cell.text}
                            onChange={(e) =>
                              setCell({ ...cell, text: e.target.value })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Escape") setCell(null);
                            }}
                          />
                        )}
                        <button disabled={busy}>Сохранить</button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setCell(null)}
                        >
                          Отмена
                        </button>
                      </form>
                    ) : (r.dealId ? p.edit : p.create) ? (
                      <button
                        className="cell-value"
                        disabled={busy}
                        aria-label={"Изменить " + c.name}
                        onClick={() => {
                          setEditor(null);
                          setCell({
                            row: r,
                            key: c.key,
                            text: r.values[c.key] || "",
                          });
                        }}
                      >
                        {r.values[c.key] || "—"}
                      </button>
                    ) : (
                      r.values[c.key] || "—"
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <p className="empty-state">Пока нет строк в этой выборке.</p>
        )}
      </div>
    </div>
  );
}
