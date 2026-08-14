// Template A4 padrão para documentos médicos: Receita, Solicitação de exames
// e Atestado. Um único layout, tipografia limpa e bloco de assinatura/carimbo.

export type DocA4Tipo = "receita" | "exames" | "atestado" | "declaracao" | "conduta";

export type DadosClinicaA4 = {
  nome: string;
  cnpj?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
  telefone?: string | null;
  email?: string | null;
  logoUrl?: string | null;
};

export type DadosMedicoA4 = {
  nome: string;
  crm?: string | null;
  crmUf?: string | null;
  especialidade?: string | null;
};

export type DadosPacienteA4 = {
  nome: string;
  cpf?: string | null;
  dataNascimento?: string | null;
  endereco?: string | null;
};

export type DocumentoA4 = {
  tipo: DocA4Tipo;
  clinica: DadosClinicaA4;
  medico: DadosMedicoA4;
  paciente: DadosPacienteA4;
  /** Corpo em texto livre (uma linha por item). */
  conteudo: string;
  /** Texto adicional abaixo do corpo (orientações). */
  rodapeTexto?: string | null;
  /** Código para validação (mostrado sob o QR placeholder). */
  codigoValidacao?: string | null;
};

const TITULOS: Record<DocA4Tipo, string> = {
  receita: "Receituário Simples",
  exames: "Solicitação de Exames",
  atestado: "Atestado Médico",
  declaracao: "Declaração de Comparecimento",
  conduta: "Relatório de Conduta",
};

const esc = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

function idade(dataNascimento?: string | null): string {
  if (!dataNascimento) return "";
  const d = new Date(dataNascimento);
  if (Number.isNaN(d.getTime())) return "";
  const hoje = new Date();
  let anos = hoje.getFullYear() - d.getFullYear();
  const m = hoje.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < d.getDate())) anos--;
  return anos >= 0 ? `${anos} anos` : "";
}

function enderecoClinica(c: DadosClinicaA4): string {
  const linha = [c.endereco, [c.cidade, c.estado].filter(Boolean).join("/"), c.cep]
    .filter(Boolean)
    .join(" · ");
  const contato = [
    c.telefone ? `Tel: ${c.telefone}` : null,
    c.email,
    c.cnpj ? `CNPJ ${c.cnpj}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return [linha, contato].filter(Boolean).join("<br/>");
}

export function montarHtmlA4(doc: DocumentoA4): string {
  const agora = new Date();
  const dataStr = agora.toLocaleDateString("pt-BR");
  const horaStr = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const cidadeData = `${doc.clinica.cidade ? `${doc.clinica.cidade}, ` : ""}${agora.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}`;
  const crm = doc.medico.crm
    ? `CRM ${doc.medico.crm}${doc.medico.crmUf ? `/${doc.medico.crmUf}` : ""}`
    : "";
  const idadeStr = idade(doc.paciente.dataNascimento);
  const codigo = doc.codigoValidacao ?? `${agora.getTime().toString(36).toUpperCase()}`;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(TITULOS[doc.tipo])} — ${esc(doc.paciente.nome)}</title>
<style>
  @page { size: A4; margin: 14mm 16mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: #111; font-size: 11.5pt; line-height: 1.55; }
  .folha { max-width: 178mm; margin: 0 auto; display: flex; flex-direction: column; min-height: 262mm; }
  header { display: flex; align-items: center; gap: 14px; border-bottom: 2px solid #111; padding-bottom: 10px; }
  header img { height: 52px; width: auto; object-fit: contain; }
  header .marca { flex: 1; }
  header .marca h1 { margin: 0; font-size: 15pt; letter-spacing: .3px; text-transform: uppercase; }
  header .marca .info { font-size: 8.5pt; color: #444; line-height: 1.35; margin-top: 2px; }
  .titulo { text-align: center; text-transform: uppercase; letter-spacing: 2px; font-weight: 700; font-size: 12.5pt; margin: 16px 0 12px; }
  .blocos { display: flex; gap: 10px; margin-bottom: 12px; }
  .bloco { flex: 1; border: 1px solid #ccc; border-radius: 6px; padding: 8px 10px; }
  .bloco .rot { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .8px; color: #666; }
  .bloco .val { font-size: 10.5pt; font-weight: 600; }
  .bloco .sec { font-size: 9pt; color: #333; }
  .corpo { flex: 1; white-space: pre-wrap; font-size: 12pt; line-height: 1.9; padding: 14px 2px; border-top: 1px dashed #999; border-bottom: 1px dashed #999; min-height: 90mm; }
  .obs { font-size: 9.5pt; color: #333; margin-top: 10px; white-space: pre-wrap; }
  .cidade { margin-top: 22px; text-align: right; font-size: 10.5pt; }
  footer { margin-top: 18px; display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; }
  .assinatura { flex: 1; text-align: center; }
  .assinatura .linha { border-top: 1px solid #111; width: 78%; margin: 46px auto 5px; }
  .assinatura .nome { font-weight: 700; text-transform: uppercase; font-size: 10.5pt; }
  .assinatura .crm { font-size: 9.5pt; color: #333; }
  .assinatura .carimbo { margin-top: 4px; font-size: 8pt; color: #888; }
  .qr { width: 78px; text-align: center; }
  .qr .box { width: 74px; height: 74px; border: 1px solid #111; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 7pt; color: #666; text-align: center; padding: 4px; }
  .qr .cod { font-size: 7pt; color: #666; margin-top: 3px; font-family: monospace; }
  .emissao { text-align: center; font-size: 7.5pt; color: #888; margin-top: 12px; border-top: 1px solid #eee; padding-top: 6px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
<div class="folha">
  <header>
    ${doc.clinica.logoUrl ? `<img src="${esc(doc.clinica.logoUrl)}" alt="Logotipo" />` : ""}
    <div class="marca">
      <h1>${esc(doc.clinica.nome)}</h1>
      <div class="info">${enderecoClinica(doc.clinica)}</div>
    </div>
  </header>

  <div class="titulo">${esc(TITULOS[doc.tipo])}</div>

  <div class="blocos">
    <div class="bloco">
      <div class="rot">Profissional</div>
      <div class="val">${esc(doc.medico.nome)}</div>
      <div class="sec">${esc([crm, doc.medico.especialidade].filter(Boolean).join(" · "))}</div>
    </div>
    <div class="bloco">
      <div class="rot">Paciente</div>
      <div class="val">${esc(doc.paciente.nome)}</div>
      <div class="sec">${esc([doc.paciente.cpf ? `CPF ${doc.paciente.cpf}` : "", idadeStr, `Data: ${dataStr}`].filter(Boolean).join(" · "))}</div>
    </div>
  </div>

  <div class="corpo">${esc(doc.conteudo)}</div>
  ${doc.rodapeTexto ? `<div class="obs">${esc(doc.rodapeTexto)}</div>` : ""}

  <div class="cidade">${esc(cidadeData)}</div>

  <footer>
    <div class="assinatura">
      <div class="linha"></div>
      <div class="nome">${esc(doc.medico.nome)}</div>
      <div class="crm">${esc([crm, doc.medico.especialidade].filter(Boolean).join(" · "))}</div>
      <div class="carimbo">Assinatura e carimbo</div>
    </div>
    <div class="qr">
      <div class="box">QR de validação</div>
      <div class="cod">${esc(codigo)}</div>
    </div>
  </footer>

  <div class="emissao">Emitido em ${dataStr} às ${horaStr} — ${esc(doc.clinica.nome)}</div>
</div>
</body></html>`;
}

/** Abre a janela de impressão (A4) com o documento montado. */
export function imprimirDocumentoA4(doc: DocumentoA4): boolean {
  const html = montarHtmlA4(doc);
  const w = window.open("", "_blank", "width=980,height=780");
  if (!w) return false;
  w.document.open();
  // A barra em `<\/script>` é obrigatória: sem ela a sequência literal
  // `</script>` fecharia o <script> do documento gerado antes da hora,
  // quebrando a impressão.
  w.document.write(
    // eslint-disable-next-line no-useless-escape
    `${html.replace("</body>", "<script>window.onload=()=>{window.focus();window.print();};<\/script></body>")}`,
  );
  w.document.close();
  return true;
}
