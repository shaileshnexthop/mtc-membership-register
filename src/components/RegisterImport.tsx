"use client";

import Link from "next/link";
import { useState } from "react";
import ui from "./ui.module.css";
import s from "./staff.module.css";

type Preview = {
  rows: { line: number; memberNumber: string; name: string; email: string; typeName: string; status: string; memberSince: string; nextDueOn: string | null }[];
  errors: { line: number; message: string }[];
  warnings: { line: number; message: string }[];
  totalLines: number;
};

/** Register import: check the file, see every problem by line, then import in one go. */
export function RegisterImport() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<number | null>(null);

  async function send(mode: "check" | "import") {
    if (!file) return;
    setBusy(true);
    setError("");
    const fd = new FormData();
    fd.set("file", file);
    fd.set("mode", mode);
    try {
      const res = await fetch("/api/import/members", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok && json.error) {
        setError(json.error);
        if (json.errors) setPreview(json as Preview);
      } else if (mode === "import") {
        setDone(json.imported as number);
        setPreview(null);
      } else setPreview(json as Preview);
    } catch {
      setError("The file could not be sent. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done !== null)
    return (
      <div className={ui.form} style={{ gap: 12 }}>
        <p role="status" className={ui.alertOk} style={{ margin: 0 }}>
          {done} member{done === 1 ? "" : "s"} imported. They appear under Members, marked “from register”.
        </p>
        <div className={s.rowActions}>
          <Link className={s.btnPrimary} href="/staff/members?status=all">
            Open Members
          </Link>
          <button
            type="button"
            className={s.btn}
            onClick={() => {
              setDone(null);
              setFile(null);
            }}
          >
            Import another file
          </button>
        </div>
      </div>
    );

  return (
    <div className={ui.form} style={{ gap: 14 }}>
      {error ? (
        <p role="alert" className={ui.alertError} style={{ margin: 0 }}>
          {error}
        </p>
      ) : null}
      <div className={ui.field}>
        <label htmlFor="import-file" className={ui.label}>
          Register file <span className={ui.hint}>(.csv or .xlsx, first row = column names)</span>
        </label>
        <input
          id="import-file"
          type="file"
          accept=".csv,.xlsx"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPreview(null);
            setError("");
          }}
        />
      </div>
      <div className={s.rowActions}>
        <button type="button" className={s.btn} disabled={!file || busy} onClick={() => send("check")}>
          {busy ? "Checking…" : "Check file"}
        </button>
        {preview && !preview.errors.length && preview.rows.length ? (
          <button type="button" className={s.btnPrimary} disabled={busy} onClick={() => send("import")}>
            {busy ? "Importing…" : `Import ${preview.rows.length} member${preview.rows.length === 1 ? "" : "s"}`}
          </button>
        ) : null}
      </div>

      {preview ? (
        <>
          <p role="status" className={preview.errors.length ? ui.alertError : ui.alertOk} style={{ margin: 0 }}>
            {preview.totalLines} row{preview.totalLines === 1 ? "" : "s"} read: {preview.rows.length} ready to import
            {preview.errors.length ? `, ${preview.errors.length} with errors. Nothing will be imported until every row is correct.` : "."}
            {preview.warnings.length ? ` ${preview.warnings.length} warning${preview.warnings.length === 1 ? "" : "s"}.` : ""}
          </p>
          {preview.errors.length ? (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.errors.slice(0, 200).map((e, i) => (
                    <tr key={i}>
                      <td>{e.line}</td>
                      <td>{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {preview.warnings.length ? (
            <details>
              <summary className={s.note}>Show warnings</summary>
              <ul className={s.note}>
                {preview.warnings.slice(0, 200).map((w, i) => (
                  <li key={i}>
                    Row {w.line}: {w.message}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {preview.rows.length ? (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Member no.</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Member since</th>
                    <th>Next due</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 50).map((r) => (
                    <tr key={r.line}>
                      <td>{r.line}</td>
                      <td>{r.memberNumber}</td>
                      <td>{r.name}</td>
                      <td>{r.email || "—"}</td>
                      <td>{r.typeName}</td>
                      <td>{r.status}</td>
                      <td>{r.memberSince}</td>
                      <td>{r.nextDueOn ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.rows.length > 50 ? <p className={s.note}>First 50 of {preview.rows.length} shown.</p> : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
