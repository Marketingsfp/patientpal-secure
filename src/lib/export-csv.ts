// Exporta dados como CSV compatível com Excel (UTF-8 BOM + separador ;)
export function exportToExcel<T extends Record<string, unknown>>(
  rows: T[],
  filename: string,
  headers?: { key: keyof T; label: string }[],
) {
  if (rows.length === 0) {
    return;
  }
  const cols =
    headers ??
    (Object.keys(rows[0]) as (keyof T)[]).map((k) => ({ key: k, label: String(k) }));

  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v).replace(/"/g, '""');
    return /[";\n]/.test(s) ? `"${s}"` : s;
  };

  const head = cols.map((c) => escape(c.label)).join(";");
  const body = rows
    .map((r) => cols.map((c) => escape(r[c.key])).join(";"))
    .join("\n");

  const csv = "\uFEFF" + head + "\n" + body;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}