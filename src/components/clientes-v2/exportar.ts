import { exportToExcel } from "@/lib/export-csv";
import { fmtCPF, fmtNasc, fmtTel, pagadorLabel, type PacienteV2 } from "./status-utils";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

const fmtCadastro = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
};

export type LinhaExport = {
  nome: string;
  prontuario: string;
  pasta: string;
  cpf: string;
  telefone: string;
  nascimento: string;
  pagador: string;
  convenio: string;
  cidade_uf: string;
  status: string;
  cadastro: string;
};

const COLUNAS: { key: keyof LinhaExport; label: string }[] = [
  { key: "nome", label: "Nome" },
  { key: "prontuario", label: "Prontuário" },
  { key: "pasta", label: "Pasta" },
  { key: "cpf", label: "CPF" },
  { key: "telefone", label: "Telefone" },
  { key: "nascimento", label: "Nascimento" },
  { key: "pagador", label: "Tipo" },
  { key: "convenio", label: "Convênio" },
  { key: "cidade_uf", label: "Cidade/UF" },
  { key: "status", label: "Situação" },
  { key: "cadastro", label: "Cadastro" },
];

export function montarLinhas(pacientes: PacienteV2[]): LinhaExport[] {
  return pacientes.map((p) => ({
    nome: p.nome,
    prontuario: p.codigo_prontuario ?? "",
    pasta: p.numero_pasta ?? "",
    cpf: fmtCPF(p.cpf) ?? "",
    telefone: fmtTel(p.telefone) ?? "",
    nascimento: fmtNasc(p.data_nascimento) ?? "",
    pagador: pagadorLabel(p).label,
    convenio: p.associado_convenio ?? "",
    cidade_uf: [p.cidade, p.estado].filter(Boolean).join("/"),
    status: p.ativo ? "Ativo" : "Inativo",
    cadastro: fmtCadastro(p.created_at),
  }));
}

const carimbo = () => new Date().toISOString().slice(0, 10);

export function exportarPacientesCSV(pacientes: PacienteV2[]) {
  exportToExcel(montarLinhas(pacientes), `pacientes-${carimbo()}.csv`, COLUNAS);
}

export function exportarPacientesPDF(pacientes: PacienteV2[], subtitulo?: string) {
  const linhas = montarLinhas(pacientes);
  if (linhas.length === 0) return;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Pacientes</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: Inter, Arial, sans-serif; color: #0f172a; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  .sub { font-size: 11px; color: #64748b; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th, td { border-bottom: 1px solid #e2e8f0; padding: 4px 6px; text-align: left; }
  th { background: #f1f5f9; font-weight: 600; }
  tr { break-inside: avoid; }
</style></head><body>
<h1>Pacientes</h1>
<div class="sub">${esc(subtitulo ?? "")}${subtitulo ? " · " : ""}${linhas.length} registro(s) · emitido em ${new Date().toLocaleString("pt-BR")}</div>
<table><thead><tr>${COLUNAS.map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr></thead>
<tbody>${linhas
  .map((l) => `<tr>${COLUNAS.map((c) => `<td>${esc(l[c.key])}</td>`).join("")}</tr>`)
  .join("")}</tbody></table>
<script>window.onload=function(){window.print()}</script>
</body></html>`;
  const w = window.open("", "_blank", "width=1100,height=800");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
