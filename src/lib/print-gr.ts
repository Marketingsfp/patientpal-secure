import { supabase } from "@/integrations/supabase/client";

/**
 * Formata a linha "SERVIÇO" da GR colocando a especialidade do procedimento
 * (o "(XXX)" que vem colado no nome do procedimento) na frente, e a
 * especialidade principal do médico entre parênteses no fim.
 *
 *   procNomeBase="CONSULTA (CARDIOLOGIA)", espMedico="GERIATRIA"
 *     → "CARDIOLOGIA - CONSULTA (GERIATRIA)"
 *
 * Fallbacks: sem "(XXX)" no procedimento, mantém a ordem antiga
 * (`${espMedico} - ${procNomeBase}`). Especialidades iguais colapsam.
 */
function formatServicoLinha(procNomeBase: string, espMedicoRaw: string | null | undefined): string {
  const base = (procNomeBase ?? "").toUpperCase().trim();
  const espMedico = (espMedicoRaw ?? "").toUpperCase().trim();
  const m = base.match(/^(.*)\s*\(([^()]+)\)\s*$/);
  if (m) {
    const procLimpo = m[1].trim();
    const espServico = m[2].trim();
    if (espServico && espMedico && espServico !== espMedico) {
      return `${espServico} - ${procLimpo} (${espMedico})`;
    }
    if (espServico) {
      return `${espServico} - ${procLimpo}`;
    }
  }
  if (espMedico && !base.includes(espMedico)) {
    return `${espMedico} - ${base}`;
  }
  return base;
}

/**
 * Imprime a GR (Guia de Recebimento / Guia de Atendimento) no formato
 * térmico 80mm — compatível com Bematech MP-4200 TH e similares.
 *
 * Abre uma janela de impressão com CSS @page de 80mm de largura
 * e dispara window.print() automaticamente.
 */

export interface PrintGRInput {
  agendamentoId: string;
  clinicaId: string;
  usuarioNome?: string;
  usuarioId?: string | null;
  /** Se true, NÃO grava nova via — apenas reimprime a última via existente. */
  reimpressao?: boolean;
  /**
   * Número da ficha (posição da linha na agenda) já calculado pelo chamador.
   * Quando informado, a guia usa EXATAMENTE este número — garante que a guia
   * bate com a lista da agenda mesmo havendo slots no mesmo horário. Sem ele,
   * a posição é recalculada aqui (fallback).
   */
  fichaNumero?: number | null;
  pagamento?: {
    valor: number;
    forma_pagamento: string | null;
    parcelas: number | null;
    bandeira_cartao: string | null;
    detalhe?: Array<{ forma: string; pago: number; troco: number; recebido: number }>;
  };
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const fmtData = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fmtDataSimples = (iso: string | null) => {
  if (!iso) return "";
  const s = iso.length === 10 ? `${iso}T00:00:00` : iso;
  const d = new Date(s);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));

const FORMA_LABEL: Record<string, string> = {
  dinheiro: "DINHEIRO",
  manual: "DINHEIRO",
  pix: "PIX",
  cartao_credito: "CARTÃO CRÉDITO",
  cartao_debito: "CARTÃO DÉBITO",
  boleto: "BOLETO",
  convenio: "CONVÊNIO",
  convenio_gratuidade: "CONVÊNIO GRATUIDADE",
  transferencia: "TRANSFERÊNCIA",
};

// Número de vias da GR conforme a forma de pagamento:
// - dinheiro / boleto / convênio / transferência → 1 via
// - cartão crédito / débito / pix → 2 vias (1ª médico, 2ª financeiro)
// - misto → 2 vias se houver qualquer parcela em cartão/pix; senão 1
function numViasGR(pag?: {
  forma_pagamento: string | null;
  detalhe?: Array<{ forma: string }>;
} | null): number {
  if (!pag) return 1;
  const eletronico = (f: string | null | undefined) =>
    f === "cartao_credito" || f === "cartao_debito" || f === "pix";
  if (eletronico(pag.forma_pagamento)) return 2;
  if (
    pag.forma_pagamento === "misto" &&
    (pag.detalhe ?? []).some((d) => eletronico(d.forma))
  ) {
    return 2;
  }
  return 1;
}

const VIA_LABELS = ["1ª VIA — MÉDICO", "2ª VIA — FINANCEIRO"];

/**
 * Resolve o rótulo do campo "CONV." da GR a partir do tipo_atendimento do
 * agendamento. Para "convenio", busca o nome do convênio do contrato ativo
 * do paciente (titular ou dependente). Para "particular", retorna "PARTICULAR".
 * Retorna null quando não deve renderizar a linha.
 */
async function resolveConvLabel(
  tipoAtendimento: string | null | undefined,
  pacienteId: string | null | undefined,
  clinicaId: string,
): Promise<string | null> {
  if (tipoAtendimento === "particular") return "PARTICULAR";
  if (tipoAtendimento !== "convenio") return null;
  if (!pacienteId) return "CONVÊNIO";
  try {
    const { data: titular } = await supabase
      .from("contratos_assinatura")
      .select("id, cb_convenios(nome)")
      .eq("clinica_id", clinicaId)
      .eq("status", "ativo")
      .eq("paciente_id", pacienteId)
      .limit(1);
    const t0 = ((titular ?? []) as any[])[0];
    if (t0?.cb_convenios?.nome) return String(t0.cb_convenios.nome).toUpperCase();
    const { data: deps } = await supabase
      .from("contrato_dependentes")
      .select("contratos_assinatura!inner(id,clinica_id,status,cb_convenios(nome))")
      .eq("paciente_id", pacienteId)
      .eq("ativo", true)
      .limit(5);
    const cand = ((deps ?? []) as any[])
      .map((d) => d.contratos_assinatura)
      .find((c: any) => c && c.clinica_id === clinicaId && c.status === "ativo");
    if (cand?.cb_convenios?.nome) return String(cand.cb_convenios.nome).toUpperCase();
  } catch { /* fallback */ }
  return "CONVÊNIO";
}

/**
 * Verifica se o paciente tem contrato ativo do cartão de benefícios/convênio
 * na clínica atual — como titular ou dependente — independente do
 * `tipo_atendimento` do agendamento. Usado para imprimir na GR o plano/
 * vínculo mesmo quando o pagamento foi feito no particular.
 */
async function resolveVinculoConvenio(
  pacienteId: string | null | undefined,
  clinicaId: string,
): Promise<{ convenioNome: string; vinculo: "titular" | "dependente"; titularNome?: string } | null> {
  if (!pacienteId) return null;
  try {
    const { data: titular } = await supabase
      .from("contratos_assinatura")
      .select("id, cb_convenios(nome)")
      .eq("clinica_id", clinicaId)
      .eq("status", "ativo")
      .eq("paciente_id", pacienteId)
      .limit(1);
    const t0 = ((titular ?? []) as any[])[0];
    const nomeT = t0?.cb_convenios?.nome;
    if (nomeT) return { convenioNome: String(nomeT).toUpperCase(), vinculo: "titular" };

    const { data: deps } = await supabase
      .from("contrato_dependentes")
      .select("contratos_assinatura!inner(id,clinica_id,status,paciente_nome,cb_convenios(nome))")
      .eq("paciente_id", pacienteId)
      .eq("ativo", true)
      .limit(5);
    const cand = ((deps ?? []) as any[])
      .map((d) => d.contratos_assinatura)
      .find((c: any) => c && c.clinica_id === clinicaId && c.status === "ativo");
    const nomeD = cand?.cb_convenios?.nome;
    if (nomeD) {
      return {
        convenioNome: String(nomeD).toUpperCase(),
        vinculo: "dependente",
        titularNome: cand?.paciente_nome ? String(cand.paciente_nome).toUpperCase() : undefined,
      };
    }
  } catch { /* ignora e retorna null */ }
  return null;
}

function renderLinhaVinculo(v: { convenioNome: string; vinculo: "titular" | "dependente"; titularNome?: string } | null): string {
  if (!v) return "";
  const suf = v.vinculo === "titular"
    ? "(TITULAR)"
    : v.titularNome ? `(DEPENDENTE DE ${esc(v.titularNome)})` : "(DEPENDENTE)";
  return `<div class="center sm">PLANO: <span class="v">${esc(v.convenioNome)}</span> ${suf}</div>`;
}

// Duplica o HTML de um ou mais tickets para emitir N vias com quebra de
// página entre elas e um rótulo identificando a via.
function multiplicarVias(ticketsHtml: string, nVias: number): string {
  if (nVias <= 1) return ticketsHtml;
  const parts: string[] = [];
  for (let i = 0; i < nVias; i++) {
    const label = VIA_LABELS[i] ?? `VIA ${i + 1}`;
    const banner = `<div class="via-label">${label}</div>`;
    // Injeta o banner logo após a abertura do primeiro ticket da via.
    const bloco = ticketsHtml.replace(
      '<div class="ticket">',
      `<div class="ticket">${banner}`,
    );
    const wrapper = `<div class="via-wrap"${i < nVias - 1 ? ' style="page-break-after: always"' : ""}>${bloco}</div>`;
    parts.push(wrapper);
  }
  return parts.join("");
}

// Estilos extras para vias (rótulo e quebra de página).
const VIA_CSS = `
  .via-label { text-align: center; font-weight: 700; border: 1px solid #000; padding: 2px 4px; margin: 0 2mm 4px; font-size: 9pt; letter-spacing: 1px; }
  .via-wrap { width: 100%; }
  @media print { .via-wrap { break-after: page; } .via-wrap:last-child { break-after: auto; } }
`;

// CSS base compartilhado pelos três layouts de GR (individual, agrupada e mensalidade).
// - Tudo em negrito (font-weight: 700) para legibilidade em impressoras térmicas.
// - word-break/overflow-wrap para nomes/procedimentos longos não estourarem a largura útil do papel 80mm.
// - .row usa grid em vez de flex para o valor à direita nunca ser cortado.
const BASE_CSS = `
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  /* Zera espaço extra que o Chrome/driver da térmica reserva no fim da
     página. Sem isso a bobina saía com ~8–10 cm em branco após a linha
     "DATA IMPRESSÃO", só desperdiçando papel antes do corte. */
  html, body { height: auto; }
  body {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.35;
    font-weight: 500;
    word-break: break-word;
    overflow-wrap: anywhere;
    -webkit-font-smoothing: antialiased;
  }
  .ticket { width: 76mm; max-width: 100%; padding: 4mm 3mm 3mm; }
  .ticket:last-child { padding-bottom: 1mm; }
  .center { text-align: center; }
  .right  { text-align: right; }
  .bold   { font-weight: 700; }
  .sm     { font-size: 8.5pt; font-weight: 500; letter-spacing: 0.02em; }
  .lg     {
    font-size: 13pt;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    padding: 2px 0;
  }
  .sep    { border-top: 1px solid #000; margin: 7px 0; }
  .sep.thin { border-top-width: 1px; opacity: 0.35; margin: 5px 0; }
  .row    { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px; align-items: baseline; }
  .row > * { min-width: 0; }
  .row .right { justify-self: end; }
  table   { width: 100%; border-collapse: collapse; table-layout: fixed; }
  td      { padding: 2px 0; vertical-align: top; word-break: break-word; overflow-wrap: anywhere; }
  .label  {
    color: #000;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 8.5pt;
  }
  .v      { font-weight: 700; }
  .qtd    { width: 10mm; }
  h1, h2, h3 { margin: 0; }
  /* Cabeçalho da clínica — nome grande, endereço/contatos discretos. */
  .clinica-nome {
    font-size: 13pt;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    text-align: center;
    padding: 2px 0 4px;
  }
  ${VIA_CSS}
`;

// Imprime o HTML diretamente via iframe oculto — sem abrir nova janela.
// O navegador ainda exibirá a caixa de diálogo de impressão padrão (não há
// como suprimi-la sem modo quiosque), mas não há mais a tela intermediária.
function imprimirViaIframe(html: string): void {
  if (typeof document === "undefined") return;
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  document.body.appendChild(iframe);
  const cw = iframe.contentWindow;
  if (!cw) {
    try { document.body.removeChild(iframe); } catch { /* noop */ }
    throw new Error("Não foi possível inicializar a impressão.");
  }
  const cleanup = () => { try { document.body.removeChild(iframe); } catch { /* noop */ } };
  let jaImprimiu = false;
  const dispararPrint = () => {
    if (jaImprimiu) return;
    jaImprimiu = true;
    try {
      cw.focus();
      cw.print();
    } catch { /* noop */ }
    // Remove o iframe depois que o diálogo deve ter sido tratado.
    setTimeout(cleanup, 4000);
  };
  // Registramos o onload ANTES de escrever o documento — alguns navegadores
  // disparam o load de forma síncrona no doc.close(); atribuir depois perdia o
  // evento e a impressão só saía pelo fallback (atraso perceptível). Ao carregar,
  // esperamos as imagens (ex.: logo da clínica) para não imprimir render incompleto.
  iframe.onload = () => {
    const imgs = Array.from(cw.document.images ?? []);
    const pendentes = imgs.filter((im) => !im.complete);
    if (pendentes.length === 0) { dispararPrint(); return; }
    let restantes = pendentes.length;
    const done = () => { restantes -= 1; if (restantes <= 0) dispararPrint(); };
    pendentes.forEach((im) => {
      im.addEventListener("load", done);
      im.addEventListener("error", done);
    });
    // Teto de segurança: imprime mesmo se alguma imagem travar (ex.: logo offline).
    setTimeout(dispararPrint, 2500);
  };
  const doc = cw.document;
  doc.open();
  doc.write(html);
  doc.close();
  // Fallback caso o onload não dispare (navegadores com document.write).
  setTimeout(() => { if (iframe.isConnected) dispararPrint(); }, 1200);
}

export async function printGuiaAtendimento(input: PrintGRInput) {
  return printGuiaAtendimentoCore(input);
}

async function printGuiaAtendimentoCore({ agendamentoId, clinicaId, usuarioNome, usuarioId, reimpressao, pagamento, fichaNumero }: PrintGRInput) {
  // Controle de vias: máximo 2 (1ª e 2ª via). Reimpressão repete a última sem incrementar.
  const { data: visExistentes, error: errVias } = await supabase
    .from("gr_impressoes" as never)
    .select("via_numero, impresso_por_nome")
    .eq("agendamento_id", agendamentoId)
    .order("via_numero", { ascending: false });
  if (errVias) throw new Error(errVias.message);
  const existentes = (visExistentes as Array<{ via_numero: number; impresso_por_nome: string | null }> | null) ?? [];
  const ultimaVia = existentes[0]?.via_numero ?? 0;
  let viaNumero: number;
  if (reimpressao) {
    viaNumero = ultimaVia > 0 ? ultimaVia : 1;
  } else {
    viaNumero = ultimaVia + 1;
  }
  const primeiraVia = existentes.length ? existentes[existentes.length - 1] : null;
  // "USUÁRIO:" da GR = quem FATUROU o atendimento (autor do lançamento
  // financeiro), tanto na 1ª via quanto em qualquer reimpressão. Nunca é o
  // operador logado que está imprimindo. Ordem de resolução:
  //   1) fin_lancamentos.criado_por → profiles.nome (fonte da verdade)
  //   2) impresso_por_nome gravado na 1ª via (histórico)
  //   3) usuarioNome do caller (fallback quando não há lançamento)
  let usuarioFinalNome: string | null | undefined = undefined;
  try {
    const { data: lancs } = await supabase
      .from("fin_lancamentos")
      .select("criado_por, created_at")
      .eq("agendamento_id", agendamentoId)
      .eq("tipo", "receita")
      .eq("status", "confirmado")
      .order("created_at", { ascending: true });
    const criadoPor = ((lancs ?? []) as Array<{ criado_por: string | null }>)
      .map((l) => l.criado_por)
      .find((v): v is string => !!v);
    if (criadoPor) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("nome")
        .eq("id", criadoPor)
        .maybeSingle();
      const nome = (prof as { nome: string | null } | null)?.nome;
      if (nome) usuarioFinalNome = nome;
    }
  } catch { /* segue para fallback */ }
  if (!usuarioFinalNome) usuarioFinalNome = primeiraVia?.impresso_por_nome ?? usuarioNome;

  // Busca dados em paralelo
  const [ag, cli] = await Promise.all([
    supabase
      .from("agendamentos")
      .select("id, paciente_nome, paciente_id, medico_id, agenda_id, inicio, procedimento, observacoes, ficha_numero, tipo_atendimento")
      .eq("id", agendamentoId)
      .maybeSingle(),
    supabase
      .from("clinicas")
      .select("nome, endereco, cidade, estado, telefone, cnpj")
      .eq("id", clinicaId)
      .maybeSingle(),
  ]);

  if (ag.error || !ag.data) {
    throw new Error(ag.error?.message ?? "Agendamento não encontrado");
  }
  const a = ag.data;
  const c = cli.data;

  // Se o agendamento não tem medico_id direto, tenta resolver pelo médico vinculado à agenda
  let medicoIdEfetivo: string | null = a.medico_id ?? null;
  if (!medicoIdEfetivo && a.agenda_id) {
    const { data: ag } = await supabase
      .from("medico_agendas")
      .select("medico_id")
      .eq("id", a.agenda_id)
      .maybeSingle();
    medicoIdEfetivo = (ag as { medico_id: string | null } | null)?.medico_id ?? null;
  }

  const [pac, med, proc] = await Promise.all([
    a.paciente_id
      ? supabase
          .from("pacientes")
          .select("nome, cpf, telefone, data_nascimento, codigo_prontuario, numero_pasta")
          .eq("id", a.paciente_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    medicoIdEfetivo
      ? supabase
          .from("medicos")
          .select("nome, especialidade:especialidades!medicos_especialidade_id_fkey(nome)")
          .eq("id", medicoIdEfetivo)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    a.procedimento
      ? supabase
          .from("procedimentos")
          .select("id, nome, valor_dinheiro_pix, valor_cartao, tipo")
          .eq("clinica_id", clinicaId)
          .ilike("nome", a.procedimento)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const paciente = pac.data as { nome: string; cpf: string | null; telefone: string | null; data_nascimento: string | null; codigo_prontuario: string | null; numero_pasta: string | null } | null;
  const medicoBasic = med.data as { nome: string; especialidade: { nome: string } | null } | null;
  const medicoNome = medicoBasic?.nome ?? "—";
  // Fallback: especialidade "principal" do médico (coluna medicos.especialidade_id).
  // Para médicos com mais de uma especialidade essa coluna é apenas a primeira da
  // lista e pode não corresponder ao serviço atendido — por isso é só o último recurso.
  let espNome = medicoBasic?.especialidade?.nome?.toUpperCase() ?? "";
  let medicoData: { tipo_repasse: string | null; percentual_repasse_padrao: number | null; valor_repasse_padrao: number | null } | null = null;
  if (a.medico_id) {
    try {
      const { data: sens } = await supabase.rpc("medico_dados_sensiveis", { _medico_id: a.medico_id });
      const s = (sens as any) ?? {};
      medicoData = { tipo_repasse: s.tipo_repasse ?? null, percentual_repasse_padrao: s.percentual_repasse_padrao ?? null, valor_repasse_padrao: s.valor_repasse_padrao ?? null };
    } catch { medicoData = null; }
  }
  // Dados do Cartão de Benefícios do médico (não vêm em medico_dados_sensiveis)
  let medicoCb: { aceita: boolean; tipo: string | null; valor: number | null; percentual: number | null } | null = null;
  if (a.medico_id) {
    try {
      const { data: mcb } = await supabase
        .from("medicos")
        .select("aceita_cartao_beneficios, cb_tipo_repasse, cb_valor_repasse, cb_percentual_repasse")
        .eq("id", a.medico_id)
        .maybeSingle();
      const m = (mcb as any) ?? null;
      if (m) medicoCb = { aceita: !!m.aceita_cartao_beneficios, tipo: m.cb_tipo_repasse ?? null, valor: m.cb_valor_repasse ?? null, percentual: m.cb_percentual_repasse ?? null };
    } catch { medicoCb = null; }
  }
  const procData = proc.data as { id: string; nome: string; valor_dinheiro_pix: number | null; valor_cartao: number | null; tipo: string | null } | null;

  // Especialidade correta = a que está vinculada a ESTE serviço para ESTE médico
  // (medico_procedimentos.especialidade_id), definida na aba Especialidades/Serviços
  // do cadastro do médico. Só assim a guia sai coerente com o atendimento quando o
  // médico tem várias especialidades. Se não houver vínculo, mantém o fallback acima.
  if (medicoIdEfetivo && procData?.id) {
    try {
      const { data: mps } = await supabase
        .from("medico_procedimentos")
        .select("especialidade_id")
        .eq("medico_id", medicoIdEfetivo)
        .eq("procedimento_id", procData.id)
        .not("especialidade_id", "is", null);
      const eids = Array.from(
        new Set(
          ((mps ?? []) as Array<{ especialidade_id: string | null }>)
            .map((r) => r.especialidade_id)
            .filter((v): v is string => !!v),
        ),
      );
      // Só usa a especialidade do serviço quando ela é INEQUÍVOCA (uma só). Se o
      // mesmo serviço estiver vinculado a várias especialidades para este médico
      // (cadastro bagunçado / import em massa), não dá para adivinhar qual vale —
      // mantém a especialidade principal do médico (fallback acima).
      if (eids.length === 1) {
        const { data: esp } = await supabase
          .from("especialidades")
          .select("nome")
          .eq("id", eids[0])
          .maybeSingle();
        const nomeVinculo = (esp as { nome: string | null } | null)?.nome;
        if (nomeVinculo) espNome = nomeVinculo.toUpperCase();
      }
    } catch { /* mantém o fallback da especialidade principal do médico */ }
  }

  // Se já temos pagamento informado, usa ele; senão busca valor REALMENTE pago
  // (fin_lancamentos confirmado) — garante que reimpressões usem o mesmo
  // valor base de cálculo da 1ª via, mantendo o repasse do médico correto.
  let valor: number;
  let isCartaoConsulta = false;
  // Quando `pagamento` não vem do caller (ex.: botão "Imprimir GR" reimprimindo
  // uma cobrança antiga), reconstruímos a forma/parcelas/bandeira/misto a partir
  // do lançamento financeiro. Sem isso a GR caía num fallback "DINHEIRO".
  let pagResolvido: PrintGRInput["pagamento"] | undefined = pagamento;
  const detectCartaoConsulta = (desc: string | null | undefined): boolean => {
    if (!desc) return false;
    const d = desc.toUpperCase();
    if (d.includes("ADESAO") || d.includes("ADESÃO")) return false;
    return (
      d.includes("CARTAO CONSULTA") ||
      d.includes("CARTÃO CONSULTA") ||
      d.includes("CONSULTA CARTAO") ||
      d.includes("CONSULTA CARTÃO")
    );
  };
  if (pagamento) {
    valor = Number(pagamento.valor);
  } else {
    let valorPago = 0;
    let formaResolvida: string | null = null;
    let parcelasResolvidas: number | null = null;
    let bandeiraResolvida: string | null = null;
    let obsResolvida: string | null = null;
    try {
      const { data: lancs } = await supabase
        .from("fin_lancamentos")
        .select("valor, descricao, forma_pagamento, parcelas, bandeira_cartao, observacoes")
        .eq("agendamento_id", agendamentoId)
        .eq("tipo", "receita")
        .eq("status", "confirmado");
      for (const l of ((lancs ?? []) as Array<{
        valor: number | string; descricao: string | null;
        forma_pagamento: string | null; parcelas: number | null;
        bandeira_cartao: string | null; observacoes: string | null;
      }>)) {
        valorPago += Number(l.valor);
        if (detectCartaoConsulta(l.descricao)) isCartaoConsulta = true;
        // Preserva a primeira forma "real" (ignora linhas-sombra de valor 0
        // e sem forma) — a cobrança principal é a que dita a forma na GR.
        if (!formaResolvida && l.forma_pagamento) {
          formaResolvida = l.forma_pagamento;
          parcelasResolvidas = l.parcelas;
          bandeiraResolvida = l.bandeira_cartao;
          obsResolvida = l.observacoes;
        }
      }
    } catch { /* segue para fallback */ }
    valor = valorPago > 0 ? valorPago : Number(procData?.valor_dinheiro_pix ?? 0);
    if (formaResolvida) {
      // Reconstrói detalhe do misto a partir de "Pagamento misto: X R$ 1,00; Y R$ 2,00 | ..."
      let detalhe: Array<{ forma: string; pago: number; troco: number; recebido: number }> | undefined;
      if (formaResolvida === "misto" && obsResolvida) {
        const idx = obsResolvida.indexOf("Pagamento misto:");
        if (idx >= 0) {
          const trecho = obsResolvida.slice(idx + "Pagamento misto:".length).split(" | ")[0];
          const LABEL_TO_KEY: Array<[RegExp, string]> = [
            [/^cart[ãa]o\s*cr[ée]dito/i, "cartao_credito"],
            [/^cart[ãa]o\s*d[ée]bito/i, "cartao_debito"],
            [/^cr[ée]dito/i, "cartao_credito"],
            [/^d[ée]bito/i, "cartao_debito"],
            [/^dinheiro/i, "dinheiro"],
            [/^pix/i, "pix"],
            [/^boleto/i, "boleto"],
            [/^conv[êe]nio/i, "convenio"],
            [/^transfer[êe]ncia/i, "transferencia"],
          ];
          const parseBRL = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;
          const partes = trecho.split(";").map((s) => s.trim()).filter(Boolean);
          const acc: Array<{ forma: string; pago: number; troco: number; recebido: number }> = [];
          for (const p of partes) {
            const match = LABEL_TO_KEY.find(([re]) => re.test(p));
            if (!match) continue;
            const valMatch = p.match(/R\$\s*([\d.]+,\d{2})/);
            if (!valMatch) continue;
            acc.push({ forma: match[1], pago: parseBRL(valMatch[1]), troco: 0, recebido: 0 });
          }
          if (acc.length > 0) detalhe = acc;
        }
      }
      pagResolvido = {
        valor,
        forma_pagamento: formaResolvida,
        parcelas: parcelasResolvidas,
        bandeira_cartao: bandeiraResolvida,
        detalhe,
      };
    }
  }
  // Quando o pagamento já vem informado pelo caller, ainda consultamos os
  // lançamentos para descobrir se é Cartão Consulta (não há flag no payload).
  if (pagamento && !isCartaoConsulta) {
    try {
      const { data: lancs } = await supabase
        .from("fin_lancamentos")
        .select("descricao")
        .eq("agendamento_id", agendamentoId)
        .eq("tipo", "receita");
      for (const l of ((lancs ?? []) as Array<{ descricao: string | null }>)) {
        if (detectCartaoConsulta(l.descricao)) { isCartaoConsulta = true; break; }
      }
    } catch { /* noop */ }
  }
  const procNomeBase = (a.procedimento || procData?.nome || "CONSULTA").toUpperCase();
  const procNome = formatServicoLinha(procNomeBase, espNome);

  // Ficha = POSIÇÃO da linha na fila do PROFISSIONAL no dia (mesma regra da
  // lista da agenda — app.agenda.tsx > fichaPorId): cada médico/agenda tem sua
  // própria sequência 001, 002, 003… dentro do dia. O chamador (a agenda) passa
  // o número já calculado em `fichaNumero` — assim a guia bate EXATAMENTE com a
  // lista. Sem ele, recalcula aqui como fallback particionando por (dia,
  // profissional, agenda).
  const inicioDt = new Date(a.inicio);
  const diaIni = new Date(inicioDt); diaIni.setHours(0, 0, 0, 0);
  const diaFim = new Date(inicioDt); diaFim.setHours(23, 59, 59, 999);
  let fichaNum = typeof fichaNumero === "number" && fichaNumero > 0 ? fichaNumero : 0;
  if (fichaNum === 0) {
    try {
      const q = supabase
        .from("agendamentos")
        .select("id, inicio, paciente_nome, medico_id, agenda_id")
        .eq("clinica_id", clinicaId)
        .gte("inicio", diaIni.toISOString())
        .lte("inicio", diaFim.toISOString());
      if (a.medico_id) q.eq("medico_id", a.medico_id); else q.is("medico_id", null);
      if (a.agenda_id) q.eq("agenda_id", a.agenda_id); else q.is("agenda_id", null);
      const { data: lista } = await q;
      const ordenados = [...(lista ?? [])].sort((x: any, y: any) => {
        const t = String(x.inicio).localeCompare(String(y.inicio));
        if (t !== 0) return t;
        return String(x.paciente_nome ?? "").localeCompare(String(y.paciente_nome ?? ""), "pt-BR", { sensitivity: "base" });
      });
      const idx = ordenados.findIndex((r: any) => r.id === a.id);
      fichaNum = idx >= 0 ? idx + 1 : 0;
    } catch { fichaNum = 0; }
  }
  const ficha = fichaNum > 0
    ? String(fichaNum).padStart(3, "0")
    : String(inicioDt.getHours() * 60 + inicioDt.getMinutes()).padStart(3, "0");
  const prontuario = paciente?.codigo_prontuario || paciente?.numero_pasta || "";

  // Repasse conforme cadastro: tenta primeiro medico_convenios pelo nome do procedimento,
  // senão usa o padrão do médico (tipo_repasse / percentual / valor).
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  // Variantes para casar o nome do procedimento com cadastro de convênio
  // (a agenda costuma anexar a especialidade entre parênteses).
  const variantsOf = (nome: string): string[] => {
    const base = norm(nome);
    const out = new Set<string>([base]);
    let cur = base;
    for (let i = 0; i < 3; i++) {
      const m = cur.match(/^(.*)\s*\([^()]*\)\s*$/);
      if (!m) break;
      cur = m[1].trim();
      if (cur) out.add(cur);
    }
    const semParens = base.replace(/\s*\([^()]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
    if (semParens) out.add(semParens);
    return Array.from(out).filter(Boolean);
  };

  let prestador = 0;
  let repasseFixoConvenio = false;
  // Cartão Consulta tem prioridade: usa o cb_*_repasse do médico.
  if (a.medico_id && isCartaoConsulta && medicoCb?.aceita) {
    if (medicoCb.tipo === "valor" && medicoCb.valor != null) {
      prestador = Number(medicoCb.valor);
      // Cartão Consulta: repasse SEMPRE fixo. O paciente paga uma taxa
      // simbólica no caixa (ex.: R$ 9,99) e o médico recebe o valor cheio
      // cadastrado em "Repasse cartões benefícios" (ex.: R$ 35,00). Nunca
      // limitar pelo valor pago.
      repasseFixoConvenio = true;
    } else if (medicoCb.tipo === "percentual" && medicoCb.percentual != null) {
      prestador = +(valor * Number(medicoCb.percentual) / 100).toFixed(2);
    }
  } else if (a.medico_id) {
    const { data: convs } = await supabase
      .from("medico_convenios")
      .select("nome, tipo_repasse, percentual, valor, ativo")
      .eq("medico_id", a.medico_id)
      .eq("ativo", true);
    const variants = variantsOf(procNomeBase);
    let conv: { nome: string; tipo_repasse: string | null; percentual: number | null; valor: number | null } | undefined;
    for (const alvo of variants) {
      conv = (convs ?? []).find((c) => norm(c.nome) === alvo) as typeof conv;
      if (conv) break;
    }
    if (!conv && procData?.tipo) {
      const sentinel = `__CAT__:${String(procData.tipo).toUpperCase()}`;
      conv = (convs ?? []).find((c) => c.nome === sentinel) as typeof conv;
    }
    if (conv) {
      if (conv.tipo_repasse === "valor" && conv.valor != null) {
        prestador = Number(conv.valor);
        // Repasse fixo de convênio só se aplica quando o paciente não pagou
        // nada no caixa (convênio cobre direto com a clínica). Quando há
        // pagamento normal, segue para o Math.min abaixo e limita ao recebido.
        if (valor <= 0) repasseFixoConvenio = true;
      } else if (conv.tipo_repasse === "percentual" && conv.percentual != null) {
        prestador = +(valor * Number(conv.percentual) / 100).toFixed(2);
      } else if (medicoData) {
        // sem tipo/valor cadastrado para o serviço → usa padrão do médico
        if (medicoData.tipo_repasse === "valor" && medicoData.valor_repasse_padrao != null) {
          prestador = Number(medicoData.valor_repasse_padrao);
        } else {
          prestador = +(valor * Number(medicoData.percentual_repasse_padrao ?? 0) / 100).toFixed(2);
        }
      }
    } else if (medicoData) {
      if (medicoData.tipo_repasse === "valor" && medicoData.valor_repasse_padrao != null) {
        prestador = Number(medicoData.valor_repasse_padrao);
      } else {
        prestador = +(valor * Number(medicoData.percentual_repasse_padrao ?? 0) / 100).toFixed(2);
      }
    }
  }
  // Só limita o repasse pelo valor pago quando NÃO é repasse fixo de convênio.
  if (!repasseFixoConvenio) {
    prestador = Math.min(prestador, valor);
  }
  const clinica = +(Math.max(0, valor - prestador)).toFixed(2);

  // NUNCA assumir "DINHEIRO" quando a forma real é desconhecida (lançamento
  // antigo sem forma_pagamento salva, ou pagamento ainda não processado) — um
  // fallback silencioso para dinheiro já causou guias mostrando forma errada
  // para pagamentos reais em débito/pix/etc.
  const formaLbl = pagResolvido?.forma_pagamento ? (FORMA_LABEL[pagResolvido.forma_pagamento] ?? pagResolvido.forma_pagamento.toUpperCase()) : "NÃO INFORMADO";
  const parcelasTxt = pagResolvido && pagResolvido.forma_pagamento === "cartao_credito" && pagResolvido.parcelas && pagResolvido.parcelas > 1
    ? `${pagResolvido.parcelas}x DE ${fmtBRL(valor / pagResolvido.parcelas)}`
    : "À VISTA";
  const bandeiraTxt = pagResolvido?.bandeira_cartao ? pagResolvido.bandeira_cartao.toUpperCase() : "";
  const isMisto = pagResolvido?.forma_pagamento === "misto" && (pagResolvido.detalhe?.length ?? 0) > 0;
  const detalheRows = isMisto
    ? pagResolvido!.detalhe!
        .map((d) => {
          const lbl = FORMA_LABEL[d.forma] ?? d.forma.toUpperCase();
          const trocoTxt = d.troco > 0 ? ` (RECEB. ${fmtBRL(d.recebido)} / TROCO ${fmtBRL(d.troco)})` : "";
          return `<tr><td class="label">${esc(lbl)}:</td><td class="v right">${fmtBRL(d.pago)}${esc(trocoTxt)}</td></tr>`;
        })
        .join("")
    : "";

  const endereco = [c?.endereco, c?.cidade && c?.estado ? `${c.cidade} - ${c.estado}` : c?.cidade ?? c?.estado].filter(Boolean).join("<br/>");

  const viaTexto = `IMPRESSÃO Nº ${viaNumero}`;

  const convLabel = await resolveConvLabel(
    (a as { tipo_atendimento?: string | null }).tipo_atendimento ?? null,
    a.paciente_id ?? null,
    clinicaId,
  );
  const vinculoConv = await resolveVinculoConvenio(a.paciente_id ?? null, clinicaId);

  const ticketHtml = `
  <div class="ticket">
    <div class="clinica-nome">${esc(c?.nome ?? "")}</div>
    <div class="center sm">${endereco}</div>
    ${c?.telefone ? `<div class="center sm">FONE ${esc(c.telefone)}</div>` : ""}
    ${c?.cnpj ? `<div class="center sm">CNPJ ${esc(c.cnpj)}</div>` : ""}

    <div class="sep"></div>
    <div class="center lg">GUIA DE ATENDIMENTO</div>
    <div class="sep"></div>

    <div class="center bold">${esc(paciente?.nome ?? a.paciente_nome)}</div>
    ${prontuario ? `<div class="center sm">PRONTUÁRIO: <span class="v">${esc(prontuario)}</span></div>` : ""}
    ${paciente?.cpf ? `<div class="center sm">CPF: <span class="v">${esc(paciente.cpf)}</span></div>` : ""}
    ${paciente?.telefone ? `<div class="center sm">FONE: <span class="v">${esc(paciente.telefone)}</span></div>` : ""}
    ${paciente?.data_nascimento ? `<div class="center sm">NASC: <span class="v">${fmtDataSimples(paciente.data_nascimento)}</span></div>` : ""}
    ${convLabel ? `<div class="center sm" style="white-space: nowrap">CONV: <span class="v">${esc(convLabel)}</span></div>` : ""}
    ${renderLinhaVinculo(vinculoConv)}

    <div class="sep"></div>

    <table>
      <tr><td class="label" colspan="2">FICHA: <span class="v">${ficha}</span></td></tr>
      <tr><td class="label" colspan="2">PROFISSIONAL: <span class="v">${esc(medicoNome)}</span></td></tr>
      <tr><td class="label" colspan="2">HORÁRIO: <span class="v">${fmtData(a.inicio)}</span></td></tr>
      ${usuarioFinalNome ? `<tr><td class="label" colspan="2">USUÁRIO: <span class="v">${esc(usuarioFinalNome)}</span></td></tr>` : ""}
    </table>

    <div class="sep"></div>

    <table>
      <tr class="bold">
        <td class="qtd">QTD</td>
        <td>SERVIÇO</td>
      </tr>
      <tr>
        <td class="qtd">1</td>
        <td>${esc(procNome)}</td>
      </tr>
    </table>

    ${valor > 0 ? `
    <div class="row" style="margin-top:8px">
      <div class="bold">VALOR RECEBIDO<br/><span class="sm">(${esc(isMisto ? "MISTO" : formaLbl)})</span></div>
      <div class="bold lg">${fmtBRL(valor)}</div>
    </div>

    ${isMisto ? `
    <table style="margin-top:4px">
      ${detalheRows}
    </table>
    ` : ""}

    ${pagResolvido?.forma_pagamento === "cartao_credito" ? `
    <table>
      ${bandeiraTxt ? `<tr><td class="label">BANDEIRA:</td><td class="v right">${esc(bandeiraTxt)}</td></tr>` : ""}
      <tr><td class="label">PARCELAMENTO:</td><td class="v right">${parcelasTxt}</td></tr>
    </table>
    ` : ""}

    <div class="sep"></div>
    <table>
      <tr><td class="label">CLINICA:</td><td class="v right">${fmtBRL(clinica)}</td></tr>
      <tr><td class="label">PRESTADOR:</td><td class="v right">${fmtBRL(prestador)}</td></tr>
    </table>
    ` : ""}

    <div class="sep"></div>
    <div class="row sm">
      <div>DATA</div>
      <div>${fmtData(new Date().toISOString())}${viaNumero >= 2 ? ` — ${viaTexto}` : ""}</div>
    </div>
  </div>`;

  const nVias = numViasGR(pagResolvido);
  const corpoVias = multiplicarVias(ticketHtml, nVias);

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<title>GR - ${esc(paciente?.nome ?? a.paciente_nome)}</title>
<style>
  ${BASE_CSS}
</style></head>
<body>
  ${corpoVias}
</body></html>`;

  imprimirViaIframe(html);

  // Registra a impressão (se for nova via). Não bloqueia a janela já aberta em caso de erro.
  if (!reimpressao) {
    try {
      await supabase.from("gr_impressoes" as never).insert({
        clinica_id: clinicaId,
        agendamento_id: agendamentoId,
        via_numero: viaNumero,
        impresso_por: usuarioId ?? null,
        impresso_por_nome: usuarioNome ?? null,
        ficha_numero: fichaNum > 0 ? fichaNum : null,
      } as never);
    } catch (_) { /* falha silenciosa: registro de via não deve bloquear impressão */ }
    // Não "congela" mais ficha_numero no agendamento: a ficha é POSICIONAL e
    // acompanha a lista da agenda (pode mudar se slots forem inseridos/removidos
    // antes da paciente). O gr_impressoes acima guarda o número de cada via só
    // para histórico.
  }
}

/** Reimprime a última via já emitida sem gerar novo registro. */
export async function reimprimirGuiaAtendimento(input: PrintGRInput) {
  return printGuiaAtendimentoCore({ ...input, reimpressao: true });
}

// ============================================================================
// GR AGRUPADA — vários agendamentos do mesmo paciente em um único impresso
// ============================================================================

export interface PrintGRAgrupadaInput {
  agendamentoIds: string[];
  clinicaId: string;
  usuarioNome?: string;
  usuarioId?: string | null;
  reimpressao?: boolean;
  pagamento: {
    valor: number;
    forma_pagamento: string | null;
    parcelas: number | null;
    bandeira_cartao: string | null;
    detalhe?: Array<{ forma: string; pago: number; troco: number; recebido: number }>;
  };
}

const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export async function printGuiaAtendimentoAgrupada(input: PrintGRAgrupadaInput) {
  const ids = Array.from(new Set((input.agendamentoIds ?? []).filter(Boolean)));
  if (ids.length === 0) throw new Error("Nenhum agendamento informado para impressão.");

  // 1 agendamento → delega para a impressão simples (mesmo layout de sempre).
  if (ids.length === 1) {
    return printGuiaAtendimento({
      agendamentoId: ids[0],
      clinicaId: input.clinicaId,
      usuarioNome: input.usuarioNome,
      usuarioId: input.usuarioId,
      reimpressao: input.reimpressao,
      pagamento: input.pagamento,
    });
  }

  return printGuiaAtendimentoAgrupadaCore(input, ids);
}

/** Reimprime a última via da GR agrupada sem gerar novo registro. */
export async function reimprimirGuiaAtendimentoAgrupada(input: PrintGRAgrupadaInput) {
  return printGuiaAtendimentoAgrupada({ ...input, reimpressao: true });
}

async function printGuiaAtendimentoAgrupadaCore(input: PrintGRAgrupadaInput, ids: string[]) {
  const { clinicaId, usuarioNome, usuarioId, reimpressao, pagamento } = input;

  // Controle de vias: usa o primeiro id como "chave" para limite (1ª/2ª via).
  const chaveVia = ids[0];
  const { data: visExistentes, error: errVias } = await supabase
    .from("gr_impressoes" as never)
    .select("via_numero, impresso_por_nome")
    .eq("agendamento_id", chaveVia)
    .order("via_numero", { ascending: false });
  if (errVias) throw new Error(errVias.message);
  const existentes = (visExistentes as Array<{ via_numero: number; impresso_por_nome: string | null }> | null) ?? [];
  const ultimaVia = existentes[0]?.via_numero ?? 0;
  let viaNumero: number;
  if (reimpressao) {
    viaNumero = ultimaVia > 0 ? ultimaVia : 1;
  } else {
    viaNumero = ultimaVia + 1;
  }
  const primeiraVia = existentes.length ? existentes[existentes.length - 1] : null;
  let usuarioFinalNome: string | null | undefined = reimpressao
    ? primeiraVia?.impresso_por_nome
    : (usuarioNome ?? primeiraVia?.impresso_por_nome);

  // Fallback do "USUÁRIO:" idêntico ao da GR individual/mensalidade: se a 1ª
  // via não gravou o nome, resolve via fin_lancamentos.criado_por → profiles.
  if (!usuarioFinalNome) {
    try {
      const { data: lancs } = await supabase
        .from("fin_lancamentos")
        .select("criado_por, created_at")
        .in("agendamento_id", ids)
        .eq("tipo", "receita")
        .eq("status", "confirmado")
        .order("created_at", { ascending: true });
      const criadoPor = ((lancs ?? []) as Array<{ criado_por: string | null }>)
        .map((l) => l.criado_por)
        .find((v): v is string => !!v);
      if (criadoPor) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("nome")
          .eq("id", criadoPor)
          .maybeSingle();
        const nome = (prof as { nome: string | null } | null)?.nome;
        if (nome) usuarioFinalNome = nome;
      }
    } catch { /* mantém oculto se não conseguir resolver */ }
  }

  // Busca agendamentos + clínica + tabela de procedimentos da clínica
  const [agsRes, cliRes, procsRes, lancsRes] = await Promise.all([
    supabase
      .from("agendamentos")
      .select("id, paciente_nome, paciente_id, medico_id, agenda_id, inicio, procedimento, tipo_atendimento")
      .in("id", ids),
    supabase
      .from("clinicas")
      .select("nome, endereco, cidade, estado, telefone, cnpj")
      .eq("id", clinicaId)
      .maybeSingle(),
    supabase
      .from("procedimentos")
      .select("nome, valor_dinheiro_pix, valor_cartao, tipo")
      .eq("clinica_id", clinicaId),
    supabase
      .from("fin_lancamentos")
      .select("agendamento_id, valor, status, tipo")
      .in("agendamento_id", ids)
      .eq("tipo", "receita")
      .eq("status", "confirmado"),
  ]);

  if (agsRes.error || !agsRes.data || agsRes.data.length === 0) {
    throw new Error(agsRes.error?.message ?? "Agendamentos não encontrados");
  }
  const ags = agsRes.data;
  const c = cliRes.data;
  const procs = (procsRes.data ?? []) as Array<{ nome: string; valor_dinheiro_pix: number | null; valor_cartao: number | null; tipo: string | null }>;
  const procByNome = new Map(procs.map((p) => [normalizar(p.nome ?? ""), p]));
  // Valor efetivamente pago por agendamento (fonte da verdade — usa quando há lançamento confirmado).
  const valorPagoByAg = new Map<string, number>();
  for (const l of ((lancsRes.data ?? []) as Array<{ agendamento_id: string | null; valor: number | string }>)) {
    if (!l.agendamento_id) continue;
    valorPagoByAg.set(l.agendamento_id, (valorPagoByAg.get(l.agendamento_id) ?? 0) + Number(l.valor));
  }

  // Paciente: pega do primeiro agendamento (mesmo paciente esperado em todos).
  const pacIdRef = ags[0].paciente_id;
  const pacienteRes = pacIdRef
    ? await supabase
        .from("pacientes")
        .select("nome, cpf, telefone, data_nascimento, codigo_prontuario, numero_pasta")
        .eq("id", pacIdRef)
        .maybeSingle()
    : { data: null };
  const paciente = pacienteRes.data as { nome: string; cpf: string | null; telefone: string | null; data_nascimento: string | null; codigo_prontuario: string | null; numero_pasta: string | null } | null;
  const pacienteNome = paciente?.nome ?? ags[0].paciente_nome ?? "—";
  const prontuarioPac = paciente?.codigo_prontuario || paciente?.numero_pasta || "";

  // Busca dados de todos os médicos envolvidos + seus convênios
  const medicoIds = Array.from(new Set(ags.map((a) => a.medico_id).filter((x): x is string => !!x)));
  const [medsRes, convsRes, repRes] = await Promise.all([
    medicoIds.length > 0
      ? supabase
          .from("medicos")
          .select("id, nome, especialidade:especialidades!medicos_especialidade_id_fkey(nome)")
          .in("id", medicoIds)
      : Promise.resolve({ data: [] as Array<{ id: string; nome: string; especialidade: { nome: string } | null }> }),
    medicoIds.length > 0
      ? supabase
          .from("medico_convenios")
          .select("medico_id, nome, tipo_repasse, percentual, valor, ativo")
          .in("medico_id", medicoIds)
          .eq("ativo", true)
      : Promise.resolve({ data: [] as Array<{ medico_id: string; nome: string; tipo_repasse: string | null; percentual: number | null; valor: number | null }> }),
    medicoIds.length > 0
      ? supabase.rpc("medicos_repasse_lista", { _clinica_id: clinicaId })
      : Promise.resolve({ data: [] as Array<{ id: string; tipo_repasse: string | null; percentual_repasse_padrao: number | null; valor_repasse_padrao: number | null }> }),
  ]);
  const repMap = new Map<string, { tipo_repasse: string | null; percentual_repasse_padrao: number | null; valor_repasse_padrao: number | null }>();
  for (const r of ((repRes as any).data ?? []) as Array<{ id: string; tipo_repasse: string | null; percentual_repasse_padrao: number | null; valor_repasse_padrao: number | null }>) {
    repMap.set(r.id, r);
  }
  const medById = new Map(((medsRes.data ?? []) as Array<{ id: string; nome: string; especialidade: { nome: string } | null }>).map((m) => {
    const r = repMap.get(m.id);
    return [m.id, { id: m.id, nome: m.nome, especialidadeNome: m.especialidade?.nome ?? null, tipo_repasse: r?.tipo_repasse ?? null, percentual_repasse_padrao: r?.percentual_repasse_padrao ?? null, valor_repasse_padrao: r?.valor_repasse_padrao ?? null }] as const;
  }));
  const convsByMedico = new Map<string, Array<{ nome: string; tipo_repasse: string | null; percentual: number | null; valor: number | null }>>();
  for (const cv of (convsRes.data ?? []) as Array<{ medico_id: string; nome: string; tipo_repasse: string | null; percentual: number | null; valor: number | null }>) {
    const arr = convsByMedico.get(cv.medico_id) ?? [];
    arr.push(cv);
    convsByMedico.set(cv.medico_id, arr);
  }

  // Agrupa por médico
  type Item = { procNome: string; valor: number; prestador: number; clinica: number; inicio: string };
  type Grupo = { medicoId: string | null; agendaId: string | null; agIdRef: string; medicoNome: string; itens: Item[]; subtotal: number; prestador: number; clinica: number; inicioRef: string };
  const grupos = new Map<string, Grupo>();

  for (const a of ags) {
    const procNomeBase = (a.procedimento || "CONSULTA").toUpperCase();
    const proc = procByNome.get(normalizar(procNomeBase));
    const espNome = a.medico_id ? (medById.get(a.medico_id)?.especialidadeNome ?? null) : null;
    const procNome = formatServicoLinha(procNomeBase, espNome);
    // Prioriza valor realmente pago (fin_lancamentos); cai para tabela de procedimentos.
    const valorPago = valorPagoByAg.get(a.id);
    const valor = valorPago != null && valorPago > 0
      ? valorPago
      : Number(proc?.valor_dinheiro_pix ?? 0);

    // Repasse: convenio por nome do procedimento → senão padrão do médico
    let prestador = 0;
    if (a.medico_id) {
      const med = medById.get(a.medico_id);
      const convs = convsByMedico.get(a.medico_id) ?? [];
      const baseNorm = normalizar(procNomeBase);
      const variants = new Set<string>([baseNorm]);
      let cur = baseNorm;
      for (let i = 0; i < 3; i++) {
        const m = cur.match(/^(.*)\s*\([^()]*\)\s*$/);
        if (!m) break;
        cur = m[1].trim();
        if (cur) variants.add(cur);
      }
      const semParens = baseNorm.replace(/\s*\([^()]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
      if (semParens) variants.add(semParens);
      let conv: typeof convs[number] | undefined;
      for (const alvo of variants) {
        conv = convs.find((cv) => normalizar(cv.nome) === alvo);
        if (conv) break;
      }
      if (!conv && proc?.tipo) {
        const sentinel = `__CAT__:${String(proc.tipo).toUpperCase()}`;
        conv = convs.find((cv) => cv.nome === sentinel);
      }
      if (conv) {
        if (conv.tipo_repasse === "valor" && conv.valor != null) {
          prestador = Number(conv.valor);
        } else if (conv.tipo_repasse === "percentual" && conv.percentual != null) {
          prestador = +(valor * Number(conv.percentual) / 100).toFixed(2);
        } else if (med) {
          if (med.tipo_repasse === "valor" && med.valor_repasse_padrao != null) {
            prestador = Number(med.valor_repasse_padrao);
          } else {
            prestador = +(valor * Number(med.percentual_repasse_padrao ?? 0) / 100).toFixed(2);
          }
        }
      } else if (med) {
        if (med.tipo_repasse === "valor" && med.valor_repasse_padrao != null) {
          prestador = Number(med.valor_repasse_padrao);
        } else {
          prestador = +(valor * Number(med.percentual_repasse_padrao ?? 0) / 100).toFixed(2);
        }
      }
    }
    prestador = Math.min(prestador, valor);
    const clin = +(valor - prestador).toFixed(2);

    // GR separada por serviço: cada agendamento vira sua própria guia,
    // com seu próprio valor/clínica/prestador. Assim, quando o paciente faz
    // vários serviços (ex.: USG mama + USG abdominal), cada um imprime uma
    // GR independente com o repasse calculado só para aquele serviço.
    const key = a.id;
    const medicoNome = a.medico_id ? (medById.get(a.medico_id)?.nome ?? "—") : "SEM PROFISSIONAL";
    const g: Grupo = grupos.get(key) ?? { medicoId: a.medico_id ?? null, agendaId: (a as any).agenda_id ?? null, agIdRef: a.id, medicoNome, itens: [] as Item[], subtotal: 0, prestador: 0, clinica: 0, inicioRef: a.inicio };
    g.itens.push({ procNome, valor, prestador, clinica: clin, inicio: a.inicio });
    if (a.inicio < g.inicioRef) { g.inicioRef = a.inicio; g.agIdRef = a.id; }
    g.subtotal = +(g.subtotal + valor).toFixed(2);
    g.prestador = +(g.prestador + prestador).toFixed(2);
    g.clinica = +(g.clinica + clin).toFixed(2);
    grupos.set(key, g);
  }

  // Calcula a ficha (posição na fila do PROFISSIONAL no dia) para cada grupo —
  // mesma regra de app.agenda.tsx > fichaPorId e da GR individual: cada
  // (dia, profissional, agenda) tem sua própria sequência 001, 002, 003…
  const fichaByGrupo = new Map<string, number>();
  await Promise.all(Array.from(grupos.entries()).map(async ([key, g]) => {
    try {
      const dt = new Date(g.inicioRef);
      const ini = new Date(dt); ini.setHours(0,0,0,0);
      const fim = new Date(dt); fim.setHours(23,59,59,999);
      const q = supabase.from("agendamentos")
        .select("id, inicio, paciente_nome, medico_id, agenda_id")
        .eq("clinica_id", clinicaId)
        .gte("inicio", ini.toISOString())
        .lte("inicio", fim.toISOString());
      if (g.medicoId) q.eq("medico_id", g.medicoId); else q.is("medico_id", null);
      if (g.agendaId) q.eq("agenda_id", g.agendaId); else q.is("agenda_id", null);
      const { data } = await q;
      const ordenados = [...(data ?? [])].sort((x: any, y: any) => {
        const t = String(x.inicio).localeCompare(String(y.inicio));
        if (t !== 0) return t;
        return String(x.paciente_nome ?? "").localeCompare(String(y.paciente_nome ?? ""), "pt-BR", { sensitivity: "base" });
      });
      const idx = ordenados.findIndex((r: any) => r.id === g.agIdRef);
      fichaByGrupo.set(key, idx >= 0 ? idx + 1 : 0);
    } catch { fichaByGrupo.set(key, 0); }
  }));

  // Ver comentário equivalente em printGuiaAtendimentoCore: nunca assumir
  // "DINHEIRO" quando a forma real é desconhecida.
  const formaLbl = pagamento.forma_pagamento ? (FORMA_LABEL[pagamento.forma_pagamento] ?? pagamento.forma_pagamento.toUpperCase()) : "NÃO INFORMADO";
  const bandeiraTxt = pagamento.bandeira_cartao ? pagamento.bandeira_cartao.toUpperCase() : "";
  const isMisto = pagamento.forma_pagamento === "misto" && (pagamento.detalhe?.length ?? 0) > 0;
  const detalheRows = isMisto
    ? pagamento.detalhe!
        .map((d) => {
          const lbl = FORMA_LABEL[d.forma] ?? d.forma.toUpperCase();
          const trocoTxt = d.troco > 0 ? ` (RECEB. ${fmtBRL(d.recebido)} / TROCO ${fmtBRL(d.troco)})` : "";
          return `<tr><td class="label">${esc(lbl)}:</td><td class="v right">${fmtBRL(d.pago)}${esc(trocoTxt)}</td></tr>`;
        })
        .join("")
    : "";

  const endereco = [c?.endereco, c?.cidade && c?.estado ? `${c.cidade} - ${c.estado}` : c?.cidade ?? c?.estado].filter(Boolean).join("<br/>");
  const viaTexto = `IMPRESSÃO Nº ${viaNumero}`;

  const convLabelAgrupada = await resolveConvLabel(
    (ags[0] as { tipo_atendimento?: string | null }).tipo_atendimento ?? null,
    pacIdRef ?? null,
    clinicaId,
  );
  const vinculoConvAgrupada = await resolveVinculoConvenio(pacIdRef ?? null, clinicaId);

  // Cabeçalho da clínica (reutilizado em cada GR)
  const headerClinica = `
    <div class="clinica-nome">${esc(c?.nome ?? "")}</div>
    <div class="center sm">${endereco}</div>
    ${c?.telefone ? `<div class="center sm">FONE ${esc(c.telefone)}</div>` : ""}
    ${c?.cnpj ? `<div class="center sm">CNPJ ${esc(c.cnpj)}</div>` : ""}
  `;
  const headerPaciente = `
    <div class="center bold">${esc(pacienteNome)}</div>
    ${prontuarioPac ? `<div class="center sm">PRONTUÁRIO: <span class="v">${esc(prontuarioPac)}</span></div>` : ""}
    ${paciente?.cpf ? `<div class="center sm">CPF: <span class="v">${esc(paciente.cpf)}</span></div>` : ""}
    ${paciente?.telefone ? `<div class="center sm">FONE: <span class="v">${esc(paciente.telefone)}</span></div>` : ""}
    ${paciente?.data_nascimento ? `<div class="center sm">NASC: <span class="v">${fmtDataSimples(paciente.data_nascimento)}</span></div>` : ""}
    ${convLabelAgrupada ? `<div class="center sm" style="white-space: nowrap">CONV: <span class="v">${esc(convLabelAgrupada)}</span></div>` : ""}
    ${renderLinhaVinculo(vinculoConvAgrupada)}
  `;

  const gruposArr = Array.from(grupos.values());
  const dataImpressao = fmtData(new Date().toISOString());

  // Uma GR completa por médico, separadas por linha tracejada bem visível
  const grsHtml = gruposArr.map((g, idx) => {
    const isLast = idx === gruposArr.length - 1;
    const key = g.agIdRef;
    const ficha = (() => {
      const num = fichaByGrupo.get(key) ?? 0;
      if (num > 0) return String(num).padStart(3, "0");
      const d = new Date(g.inicioRef);
      return String(d.getHours() * 60 + d.getMinutes()).padStart(3, "0");
    })();
    const linhas = g.itens
      .map(
        (it) => `<tr>
          <td style="width:14mm">1</td>
          <td>${esc(it.procNome)}</td>
        </tr>`
      )
      .join("");
    const parcelasTxt = pagamento.forma_pagamento === "cartao_credito" && pagamento.parcelas && pagamento.parcelas > 1
      ? `${pagamento.parcelas}x DE ${fmtBRL(g.subtotal / pagamento.parcelas)}`
      : "À VISTA";
    return `
      <div class="ticket">
        ${headerClinica}
        <div class="sep"></div>
        <div class="center lg">GUIA DE ATENDIMENTO</div>
        <div class="sep"></div>
        ${headerPaciente}
        <div class="sep"></div>
        <table>
          <tr><td class="label" colspan="2">FICHA: <span class="v">${ficha}</span></td></tr>
          <tr><td class="label" colspan="2">PROFISSIONAL: <span class="v">${esc(g.medicoNome)}</span></td></tr>
          <tr><td class="label" colspan="2">HORÁRIO: <span class="v">${fmtData(g.inicioRef)}</span></td></tr>
          ${usuarioFinalNome ? `<tr><td class="label" colspan="2">USUÁRIO: <span class="v">${esc(usuarioFinalNome)}</span></td></tr>` : ""}
        </table>
        <div class="sep"></div>
        <table>
          <tr class="bold">
            <td style="width:14mm">QTD</td>
            <td>SERVIÇO</td>
          </tr>
          ${linhas}
        </table>
        ${g.subtotal > 0 ? `
        <div class="row" style="margin-top:8px">
          <div class="bold">VALOR RECEBIDO<br/><span class="sm">(${esc(isMisto ? "MISTO" : formaLbl)})</span></div>
          <div class="bold lg">${fmtBRL(g.subtotal)}</div>
        </div>
        ${isLast && isMisto ? `<table style="margin-top:4px">${detalheRows}</table>` : ""}
        ${pagamento.forma_pagamento === "cartao_credito" ? `
        <table>
          ${bandeiraTxt ? `<tr><td class="label">BANDEIRA:</td><td class="v right">${esc(bandeiraTxt)}</td></tr>` : ""}
          <tr><td class="label">PARCELAMENTO:</td><td class="v right">${parcelasTxt}</td></tr>
        </table>
        ` : ""}
        <div class="sep"></div>
        <table>
          <tr><td class="label">CLINICA:</td><td class="v right">${fmtBRL(g.clinica)}</td></tr>
          <tr><td class="label">PRESTADOR:</td><td class="v right">${fmtBRL(g.prestador)}</td></tr>
        </table>
        ` : ""}
        <div class="sep"></div>
        <div class="row sm">
          <div>DATA</div>
          <div>${dataImpressao}${viaNumero >= 2 ? ` — ${viaTexto}` : ""}</div>
        </div>
      </div>
      ${!isLast ? `<div class="cut"><div class="cut-line"></div><div class="cut-label">- - - - - - - - - - - - CORTE AQUI - - - - - - - - - - - -</div><div class="cut-line"></div></div>` : ""}
    `;
  }).join("");

  const nVias = numViasGR(pagamento);
  const corpoVias = multiplicarVias(grsHtml, nVias);

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<title>GR - ${esc(pacienteNome)}</title>
<style>
  ${BASE_CSS}
  .cut    { width: 76mm; padding: 4mm 2mm; text-align: center; }
  .cut-line { border-top: 2px dashed #000; margin: 2mm 0; }
  .cut-label { font-size: 8pt; letter-spacing: 1px; }
</style></head>
<body>
  ${corpoVias}
</body></html>`;

  imprimirViaIframe(html);

  // Registra a impressão para cada agendamento (mantém limite de 2 vias por id).
  if (!reimpressao) {
    try {
      const rows = ids.map((agId) => ({
        clinica_id: clinicaId,
        agendamento_id: agId,
        via_numero: viaNumero,
        impresso_por: usuarioId ?? null,
        impresso_por_nome: usuarioNome ?? null,
      }));
      await supabase.from("gr_impressoes" as never).insert(rows as never);
    } catch (_) { /* falha silenciosa */ }
  }
}

// ============================================================================
// GR DE MENSALIDADE — pagamento de parcela de contrato de convênio
// ============================================================================

export interface PrintGRMensalidadeInput {
  mensalidadeId: string;
  clinicaId: string;
  usuarioNome?: string;
  usuarioId?: string | null;
  reimpressao?: boolean;
  /** Nome de quem está reimprimindo esta 2ª via — impresso ao final da GR. */
  reimpressoPorNome?: string;
  reimpressoPorId?: string | null;
  pagamento: {
    valor: number;
    forma_pagamento: string | null;
    parcelas: number | null;
    bandeira_cartao: string | null;
    detalhe?: Array<{ forma: string; pago: number; troco: number; recebido: number }>;
  };
}

export async function printGuiaMensalidade(input: PrintGRMensalidadeInput) {
  return printGuiaMensalidadeCore(input);
}

export async function reimprimirGuiaMensalidade(input: PrintGRMensalidadeInput) {
  return printGuiaMensalidadeCore({ ...input, reimpressao: true });
}

async function printGuiaMensalidadeCore({ mensalidadeId, clinicaId, usuarioNome, usuarioId, reimpressao, reimpressoPorNome, reimpressoPorId, pagamento }: PrintGRMensalidadeInput) {
  // Controle de vias 1ª/2ª via por mensalidade
  const { data: visExistentes, error: errVias } = await supabase
    .from("gr_impressoes" as never)
    .select("via_numero, impresso_por_nome, tipo")
    .eq("mensalidade_id", mensalidadeId)
    .eq("tipo", "mensalidade")
    .order("via_numero", { ascending: false });
  if (errVias) throw new Error(errVias.message);
  const existentes = (visExistentes as Array<{ via_numero: number; impresso_por_nome: string | null }> | null) ?? [];
  const ultimaVia = existentes[0]?.via_numero ?? 0;
  let viaNumero: number;
  if (reimpressao) {
    viaNumero = ultimaVia > 0 ? ultimaVia : 1;
  } else {
    viaNumero = ultimaVia + 1;
  }
  const primeiraVia = existentes.length ? existentes[existentes.length - 1] : null;
  let usuarioFinalNome: string | null | undefined = usuarioNome ?? primeiraVia?.impresso_por_nome;

  const [mensRes, cliRes] = await Promise.all([
    supabase
      .from("contrato_mensalidades")
      .select("id, contrato_id, numero_parcela, vencimento, valor, pago_em, lancamento_id")
      .eq("id", mensalidadeId)
      .maybeSingle(),
    supabase
      .from("clinicas")
      .select("nome, endereco, cidade, estado, telefone, cnpj")
      .eq("id", clinicaId)
      .maybeSingle(),
  ]);
  if (mensRes.error || !mensRes.data) throw new Error(mensRes.error?.message ?? "Mensalidade não encontrada");
  const m = mensRes.data as { id: string; contrato_id: string; numero_parcela: number; vencimento: string; valor: number; pago_em: string | null; lancamento_id: string | null };
  const c = cliRes.data as { nome: string; endereco: string | null; cidade: string | null; estado: string | null; telefone: string | null; cnpj: string | null } | null;

  // Fallback do "USUÁRIO:" na reimpressão: se a 1ª via não gravou o nome
  // (contratos antigos / migrados), busca quem lançou o pagamento em
  // fin_lancamentos.criado_por → profiles.nome. Sem isso, a reimpressão sai
  // sem a linha USUÁRIO que constava na impressão original.
  if (!usuarioFinalNome && m.lancamento_id) {
    try {
      const { data: lanc } = await supabase
        .from("fin_lancamentos")
        .select("criado_por")
        .eq("id", m.lancamento_id)
        .maybeSingle();
      const criadoPor = (lanc as { criado_por: string | null } | null)?.criado_por;
      if (criadoPor) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("nome")
          .eq("id", criadoPor)
          .maybeSingle();
        const nome = (prof as { nome: string | null } | null)?.nome;
        if (nome) usuarioFinalNome = nome;
      }
    } catch { /* mantém oculto se não conseguir resolver */ }
  }

  const { data: contratoRow, error: errC } = await supabase
    .from("contratos_assinatura")
    .select("id, numero, paciente_id, paciente_nome, plano_id, num_parcelas")
    .eq("id", m.contrato_id)
    .maybeSingle();
  if (errC || !contratoRow) throw new Error(errC?.message ?? "Contrato não encontrado");
  const contrato = contratoRow as { id: string; numero: number; paciente_id: string | null; paciente_nome: string; plano_id: string | null; num_parcelas: number | null };

  const [planoRes, pacRes] = await Promise.all([
    contrato.plano_id
      ? supabase.from("planos_assinatura").select("nome").eq("id", contrato.plano_id).maybeSingle()
      : Promise.resolve({ data: null }),
    contrato.paciente_id
      ? supabase.from("pacientes").select("nome, cpf, telefone, data_nascimento").eq("id", contrato.paciente_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const plano = planoRes.data as { nome: string } | null;
  const paciente = pacRes.data as { nome: string; cpf: string | null; telefone: string | null; data_nascimento: string | null } | null;

  const isAdesao = Number(m.numero_parcela) === 0;
  const totalParcelas = contrato.num_parcelas ?? m.numero_parcela;
  const valor = Number(pagamento.valor ?? m.valor ?? 0);

  // Ver comentário equivalente em printGuiaAtendimentoCore: nunca assumir
  // "DINHEIRO" quando a forma real é desconhecida.
  const formaLbl = pagamento.forma_pagamento ? (FORMA_LABEL[pagamento.forma_pagamento] ?? pagamento.forma_pagamento.toUpperCase()) : "NÃO INFORMADO";
  const isMisto = pagamento.forma_pagamento === "misto" && (pagamento.detalhe?.length ?? 0) > 0;
  const parcelasTxt = pagamento.forma_pagamento === "cartao_credito" && pagamento.parcelas && pagamento.parcelas > 1
    ? `${pagamento.parcelas}x DE ${fmtBRL(valor / pagamento.parcelas)}`
    : "À VISTA";
  const bandeiraTxt = pagamento.bandeira_cartao ? pagamento.bandeira_cartao.toUpperCase() : "";
  const detalheRows = isMisto
    ? pagamento.detalhe!
        .map((d) => {
          const lbl = FORMA_LABEL[d.forma] ?? d.forma.toUpperCase();
          const trocoTxt = d.troco > 0 ? ` (RECEB. ${fmtBRL(d.recebido)} / TROCO ${fmtBRL(d.troco)})` : "";
          return `<tr><td class="label">${esc(lbl)}:</td><td class="v right">${fmtBRL(d.pago)}${esc(trocoTxt)}</td></tr>`;
        })
        .join("")
    : "";

  const endereco = [c?.endereco, c?.cidade && c?.estado ? `${c.cidade} - ${c.estado}` : c?.cidade ?? c?.estado].filter(Boolean).join("<br/>");
  const viaTexto = `IMPRESSÃO Nº ${viaNumero}`;
  const descricao = isAdesao
    ? `TAXA DE ADESAO - CONTRATO #${contrato.numero}${plano?.nome ? ` - ${plano.nome.toUpperCase()}` : ""}`
    : `MENSALIDADE ${m.numero_parcela}/${totalParcelas} - CONTRATO #${contrato.numero}${plano?.nome ? ` - ${plano.nome.toUpperCase()}` : ""}`;
  const tituloPac = paciente?.nome ?? contrato.paciente_nome;

  const ticketHtml = `
  <div class="ticket">
    <div class="clinica-nome">${esc(c?.nome ?? "")}</div>
    <div class="center sm">${endereco}</div>
    ${c?.telefone ? `<div class="center sm">FONE ${esc(c.telefone)}</div>` : ""}
    ${c?.cnpj ? `<div class="center sm">CNPJ ${esc(c.cnpj)}</div>` : ""}

    <div class="sep"></div>
    <div class="center lg">GUIA DE RECEBIMENTO</div>
    <div class="center sm">${isAdesao ? "TAXA DE ADESAO" : "MENSALIDADE DE CONVÊNIO"}</div>
    <div class="sep"></div>

    <div class="center bold">${esc(tituloPac)}</div>
    ${paciente?.cpf ? `<div class="center sm">CPF: <span class="v">${esc(paciente.cpf)}</span></div>` : ""}
    ${paciente?.telefone ? `<div class="center sm">FONE: <span class="v">${esc(paciente.telefone)}</span></div>` : ""}

    <div class="sep"></div>

    <table>
      <tr><td class="label">CONTRATO:</td><td class="v right">#${contrato.numero}</td></tr>
      <tr><td class="label">COBRANCA:</td><td class="v right">${isAdesao ? "ADESAO" : `${m.numero_parcela}/${totalParcelas}`}</td></tr>
      <tr><td class="label">VENCIMENTO:</td><td class="v right">${fmtDataSimples(m.vencimento)}</td></tr>
      ${usuarioFinalNome ? `<tr><td class="label" colspan="2">USUÁRIO: <span class="v">${esc(usuarioFinalNome)}</span></td></tr>` : ""}
    </table>

    <div class="sep"></div>

    <table>
      <tr class="bold">
        <td style="width:14mm">QTD</td>
        <td>DESCRIÇÃO</td>
      </tr>
      <tr>
        <td>1</td>
        <td>${esc(descricao)}</td>
      </tr>
    </table>

    <div class="row" style="margin-top:8px">
      <div class="bold">VALOR RECEBIDO<br/><span class="sm">(${esc(isMisto ? "MISTO" : formaLbl)})</span></div>
      <div class="bold lg">${fmtBRL(valor)}</div>
    </div>

    ${isMisto ? `
    <table style="margin-top:4px">
      ${detalheRows}
    </table>
    ` : ""}

    ${pagamento.forma_pagamento === "cartao_credito" ? `
    <table>
      ${bandeiraTxt ? `<tr><td class="label">BANDEIRA:</td><td class="v right">${esc(bandeiraTxt)}</td></tr>` : ""}
      <tr><td class="label">PARCELAMENTO:</td><td class="v right">${parcelasTxt}</td></tr>
    </table>
    ` : ""}

    <div class="sep"></div>
    <div class="row sm">
      <div>DATA</div>
      <div>${fmtData(new Date().toISOString())}${viaNumero >= 2 ? ` — ${viaTexto}` : ""}</div>
    </div>
    ${reimpressao && reimpressoPorNome ? `
    <div class="sep"></div>
    <div class="center sm">*** 2ª VIA — REIMPRESSÃO ***</div>
    <div class="center sm">REIMPRESSO POR: <span class="v">${esc(reimpressoPorNome)}</span></div>
    <div class="center sm">EM ${fmtData(new Date().toISOString())}</div>
    ` : ""}
  </div>`;

  const nVias = numViasGR(pagamento);
  const corpoVias = multiplicarVias(ticketHtml, nVias);

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<title>GR - ${esc(tituloPac)}</title>
<style>
  ${BASE_CSS}
</style></head>
<body>
  ${corpoVias}
</body></html>`;

  imprimirViaIframe(html);

  if (!reimpressao) {
    try {
      await supabase.from("gr_impressoes" as never).insert({
        clinica_id: clinicaId,
        mensalidade_id: mensalidadeId,
        via_numero: viaNumero,
        impresso_por: usuarioId ?? null,
        impresso_por_nome: usuarioNome ?? null,
        tipo: "mensalidade",
      } as never);
    } catch (_) { /* falha silenciosa */ }
  } else if (reimpressoPorNome) {
    // Registra também as reimpressões, para auditoria (não afeta a 1ª via original).
    try {
      await supabase.from("gr_impressoes" as never).insert({
        clinica_id: clinicaId,
        mensalidade_id: mensalidadeId,
        via_numero: ultimaVia + 1,
        impresso_por: reimpressoPorId ?? null,
        impresso_por_nome: reimpressoPorNome,
        tipo: "mensalidade",
      } as never);
    } catch (_) { /* falha silenciosa */ }
  }
}

// ============================================================================
// GR DE TAXA DE ADESÃO — cobrada uma única vez, junto com a 1ª mensalidade
// ============================================================================

export interface PrintGRTaxaAdesaoInput {
  mensalidadeId: string;
  clinicaId: string;
  valorTaxa: number;
  usuarioNome?: string;
  usuarioId?: string | null;
  reimpressao?: boolean;
  pagamento: {
    forma_pagamento: string | null;
    parcelas: number | null;
    bandeira_cartao: string | null;
    detalhe?: Array<{ forma: string; pago: number; troco: number; recebido: number }>;
  };
}

export async function printGuiaTaxaAdesao(input: PrintGRTaxaAdesaoInput) {
  return printGuiaTaxaAdesaoCore(input);
}

export async function reimprimirGuiaTaxaAdesao(input: PrintGRTaxaAdesaoInput) {
  return printGuiaTaxaAdesaoCore({ ...input, reimpressao: true });
}

async function printGuiaTaxaAdesaoCore({ mensalidadeId, clinicaId, valorTaxa, usuarioNome, usuarioId, reimpressao, pagamento }: PrintGRTaxaAdesaoInput) {
  const { data: visExistentes, error: errVias } = await supabase
    .from("gr_impressoes" as never)
    .select("via_numero, impresso_por_nome, tipo")
    .eq("mensalidade_id", mensalidadeId)
    .eq("tipo", "taxa_adesao")
    .order("via_numero", { ascending: false });
  if (errVias) throw new Error(errVias.message);
  const existentes = (visExistentes as Array<{ via_numero: number; impresso_por_nome: string | null }> | null) ?? [];
  const ultimaVia = existentes[0]?.via_numero ?? 0;
  let viaNumero: number;
  if (reimpressao) {
    viaNumero = ultimaVia > 0 ? ultimaVia : 1;
  } else {
    viaNumero = ultimaVia + 1;
  }
  const primeiraVia = existentes.length ? existentes[existentes.length - 1] : null;
  const usuarioFinalNome = usuarioNome ?? primeiraVia?.impresso_por_nome;

  const [mensRes, cliRes] = await Promise.all([
    supabase
      .from("contrato_mensalidades")
      .select("id, contrato_id, numero_parcela, vencimento")
      .eq("id", mensalidadeId)
      .maybeSingle(),
    supabase
      .from("clinicas")
      .select("nome, endereco, cidade, estado, telefone, cnpj")
      .eq("id", clinicaId)
      .maybeSingle(),
  ]);
  if (mensRes.error || !mensRes.data) throw new Error(mensRes.error?.message ?? "Mensalidade não encontrada");
  const m = mensRes.data as { id: string; contrato_id: string; numero_parcela: number; vencimento: string };
  const c = cliRes.data as { nome: string; endereco: string | null; cidade: string | null; estado: string | null; telefone: string | null; cnpj: string | null } | null;

  const { data: contratoRow, error: errC } = await supabase
    .from("contratos_assinatura")
    .select("id, numero, paciente_id, paciente_nome, plano_id")
    .eq("id", m.contrato_id)
    .maybeSingle();
  if (errC || !contratoRow) throw new Error(errC?.message ?? "Contrato não encontrado");
  const contrato = contratoRow as { id: string; numero: number; paciente_id: string | null; paciente_nome: string; plano_id: string | null };

  const [planoRes, pacRes] = await Promise.all([
    contrato.plano_id
      ? supabase.from("planos_assinatura").select("nome").eq("id", contrato.plano_id).maybeSingle()
      : Promise.resolve({ data: null }),
    contrato.paciente_id
      ? supabase.from("pacientes").select("nome, cpf, telefone").eq("id", contrato.paciente_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const plano = planoRes.data as { nome: string } | null;
  const paciente = pacRes.data as { nome: string; cpf: string | null; telefone: string | null } | null;

  const valor = Number(valorTaxa ?? 0);
  const formaLbl = pagamento.forma_pagamento ? (FORMA_LABEL[pagamento.forma_pagamento] ?? pagamento.forma_pagamento.toUpperCase()) : "NÃO INFORMADO";
  const isMisto = pagamento.forma_pagamento === "misto" && (pagamento.detalhe?.length ?? 0) > 0;
  const parcelasTxt = pagamento.forma_pagamento === "cartao_credito" && pagamento.parcelas && pagamento.parcelas > 1
    ? `${pagamento.parcelas}x DE ${fmtBRL(valor / pagamento.parcelas)}`
    : "À VISTA";
  const bandeiraTxt = pagamento.bandeira_cartao ? pagamento.bandeira_cartao.toUpperCase() : "";
  const detalheRows = isMisto
    ? pagamento.detalhe!
        .map((d) => {
          const lbl = FORMA_LABEL[d.forma] ?? d.forma.toUpperCase();
          const trocoTxt = d.troco > 0 ? ` (RECEB. ${fmtBRL(d.recebido)} / TROCO ${fmtBRL(d.troco)})` : "";
          return `<tr><td class="label">${esc(lbl)}:</td><td class="v right">${fmtBRL(d.pago)}${esc(trocoTxt)}</td></tr>`;
        })
        .join("")
    : "";

  const endereco = [c?.endereco, c?.cidade && c?.estado ? `${c.cidade} - ${c.estado}` : c?.cidade ?? c?.estado].filter(Boolean).join("<br/>");
  const viaTexto = `IMPRESSÃO Nº ${viaNumero}`;
  const descricao = `TAXA DE ADESÃO — CONTRATO #${contrato.numero}${plano?.nome ? ` — ${plano.nome.toUpperCase()}` : ""}`;
  const tituloPac = paciente?.nome ?? contrato.paciente_nome;

  const ticketHtml = `
  <div class="ticket">
    <div class="clinica-nome">${esc(c?.nome ?? "")}</div>
    <div class="center sm">${endereco}</div>
    ${c?.telefone ? `<div class="center sm">FONE ${esc(c.telefone)}</div>` : ""}
    ${c?.cnpj ? `<div class="center sm">CNPJ ${esc(c.cnpj)}</div>` : ""}

    <div class="sep"></div>
    <div class="center lg">GUIA DE RECEBIMENTO</div>
    <div class="center sm">TAXA DE ADESÃO — CARTÃO DE BENEFÍCIOS</div>
    <div class="sep"></div>

    <div class="center bold">${esc(tituloPac)}</div>
    ${paciente?.cpf ? `<div class="center sm">CPF: <span class="v">${esc(paciente.cpf)}</span></div>` : ""}
    ${paciente?.telefone ? `<div class="center sm">FONE: <span class="v">${esc(paciente.telefone)}</span></div>` : ""}

    <div class="sep"></div>

    <table>
      <tr><td class="label">CONTRATO:</td><td class="v right">#${contrato.numero}</td></tr>
      <tr><td class="label">REFERÊNCIA:</td><td class="v right">PARCELA ${m.numero_parcela}</td></tr>
      ${usuarioFinalNome ? `<tr><td class="label" colspan="2">USUÁRIO: <span class="v">${esc(usuarioFinalNome)}</span></td></tr>` : ""}
    </table>

    <div class="sep"></div>

    <table>
      <tr class="bold">
        <td style="width:14mm">QTD</td>
        <td>DESCRIÇÃO</td>
      </tr>
      <tr>
        <td>1</td>
        <td>${esc(descricao)}</td>
      </tr>
    </table>

    <div class="row" style="margin-top:8px">
      <div class="bold">VALOR RECEBIDO<br/><span class="sm">(${esc(isMisto ? "MISTO" : formaLbl)})</span></div>
      <div class="bold lg">${fmtBRL(valor)}</div>
    </div>

    ${isMisto ? `
    <table style="margin-top:4px">
      ${detalheRows}
    </table>
    ` : ""}

    ${pagamento.forma_pagamento === "cartao_credito" ? `
    <table>
      ${bandeiraTxt ? `<tr><td class="label">BANDEIRA:</td><td class="v right">${esc(bandeiraTxt)}</td></tr>` : ""}
      <tr><td class="label">PARCELAMENTO:</td><td class="v right">${parcelasTxt}</td></tr>
    </table>
    ` : ""}

    <div class="sep"></div>
    <div class="row sm">
      <div>DATA</div>
      <div>${fmtData(new Date().toISOString())}${viaNumero >= 2 ? ` — ${viaTexto}` : ""}</div>
    </div>
  </div>`;

  const nVias = numViasGR({ forma_pagamento: pagamento.forma_pagamento });
  const corpoVias = multiplicarVias(ticketHtml, nVias);

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<title>GR TAXA - ${esc(tituloPac)}</title>
<style>
  ${BASE_CSS}
</style></head>
<body>
  ${corpoVias}
</body></html>`;

  imprimirViaIframe(html);

  if (!reimpressao) {
    try {
      await supabase.from("gr_impressoes" as never).insert({
        clinica_id: clinicaId,
        mensalidade_id: mensalidadeId,
        via_numero: viaNumero,
        impresso_por: usuarioId ?? null,
        impresso_por_nome: usuarioNome ?? null,
        tipo: "taxa_adesao",
      } as never);
    } catch (_) { /* falha silenciosa */ }
  }
}

// ============================================================================
// GR COMBINADA — mensalidade + taxa de adesão em UM único pop-up
// ============================================================================
// Emite uma via de cada GR (mensalidade e taxa) no mesmo documento,
// separadas por espaço. Se o operador quiser 2 cópias, usa o campo
// "Cópias" do próprio diálogo de impressão do navegador.

export interface PrintGRMensalidadeComTaxaInput extends PrintGRMensalidadeInput {
  valorTaxa: number;
}

export async function printGuiaMensalidadeComTaxa(input: PrintGRMensalidadeComTaxaInput) {
  const { mensalidadeId, clinicaId, usuarioNome, usuarioId, valorTaxa, pagamento } = input;

  // -----------------------------------------------------------------
  // 1) Controle de vias — busca as impressões existentes para os dois tipos.
  // -----------------------------------------------------------------
  const { data: visRows } = await supabase
    .from("gr_impressoes" as never)
    .select("via_numero, impresso_por_nome, tipo")
    .eq("mensalidade_id", mensalidadeId)
    .in("tipo", ["mensalidade", "taxa_adesao"])
    .order("via_numero", { ascending: false });
  const visExistentes = (visRows as Array<{ via_numero: number; impresso_por_nome: string | null; tipo: string }> | null) ?? [];
  const viasMens = visExistentes.filter((r) => r.tipo === "mensalidade");
  const viasTaxa = visExistentes.filter((r) => r.tipo === "taxa_adesao");
  const viaNumeroMens = (viasMens[0]?.via_numero ?? 0) + 1;
  const viaNumeroTaxa = (viasTaxa[0]?.via_numero ?? 0) + 1;
  const usuarioMensPrimeiro = viasMens.length ? viasMens[viasMens.length - 1].impresso_por_nome : null;
  const usuarioTaxaPrimeiro = viasTaxa.length ? viasTaxa[viasTaxa.length - 1].impresso_por_nome : null;
  const usuarioMensNome = usuarioMensPrimeiro ?? usuarioNome;
  const usuarioTaxaNome = usuarioTaxaPrimeiro ?? usuarioNome;

  // -----------------------------------------------------------------
  // 2) Busca dados compartilhados (clínica, mensalidade, contrato, paciente, plano).
  // -----------------------------------------------------------------
  const [mensRes, cliRes] = await Promise.all([
    supabase
      .from("contrato_mensalidades")
      .select("id, contrato_id, numero_parcela, vencimento, valor, pago_em")
      .eq("id", mensalidadeId)
      .maybeSingle(),
    supabase
      .from("clinicas")
      .select("nome, endereco, cidade, estado, telefone, cnpj")
      .eq("id", clinicaId)
      .maybeSingle(),
  ]);
  if (mensRes.error || !mensRes.data) throw new Error(mensRes.error?.message ?? "Mensalidade não encontrada");
  const m = mensRes.data as { id: string; contrato_id: string; numero_parcela: number; vencimento: string; valor: number; pago_em: string | null };
  const c = cliRes.data as { nome: string; endereco: string | null; cidade: string | null; estado: string | null; telefone: string | null; cnpj: string | null } | null;

  const { data: contratoRow, error: errC } = await supabase
    .from("contratos_assinatura")
    .select("id, numero, paciente_id, paciente_nome, plano_id, num_parcelas")
    .eq("id", m.contrato_id)
    .maybeSingle();
  if (errC || !contratoRow) throw new Error(errC?.message ?? "Contrato não encontrado");
  const contrato = contratoRow as { id: string; numero: number; paciente_id: string | null; paciente_nome: string; plano_id: string | null; num_parcelas: number | null };

  const [planoRes, pacRes] = await Promise.all([
    contrato.plano_id
      ? supabase.from("planos_assinatura").select("nome").eq("id", contrato.plano_id).maybeSingle()
      : Promise.resolve({ data: null }),
    contrato.paciente_id
      ? supabase.from("pacientes").select("nome, cpf, telefone, data_nascimento").eq("id", contrato.paciente_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const plano = planoRes.data as { nome: string } | null;
  const paciente = pacRes.data as { nome: string; cpf: string | null; telefone: string | null; data_nascimento: string | null } | null;

  // -----------------------------------------------------------------
  // 3) Formatação comum de pagamento.
  // -----------------------------------------------------------------
  const totalParcelas = contrato.num_parcelas ?? m.numero_parcela;
  const valorMens = Number(pagamento.valor ?? m.valor ?? 0);
  const valorTax = Number(valorTaxa ?? 0);
  const formaLbl = pagamento.forma_pagamento ? (FORMA_LABEL[pagamento.forma_pagamento] ?? pagamento.forma_pagamento.toUpperCase()) : "NÃO INFORMADO";
  const isMisto = pagamento.forma_pagamento === "misto" && (pagamento.detalhe?.length ?? 0) > 0;
  const bandeiraTxt = pagamento.bandeira_cartao ? pagamento.bandeira_cartao.toUpperCase() : "";
  const parcelasTxtMens = pagamento.forma_pagamento === "cartao_credito" && pagamento.parcelas && pagamento.parcelas > 1
    ? `${pagamento.parcelas}x DE ${fmtBRL(valorMens / pagamento.parcelas)}`
    : "À VISTA";
  const parcelasTxtTaxa = pagamento.forma_pagamento === "cartao_credito" && pagamento.parcelas && pagamento.parcelas > 1
    ? `${pagamento.parcelas}x DE ${fmtBRL(valorTax / pagamento.parcelas)}`
    : "À VISTA";
  const detalheRows = isMisto
    ? pagamento.detalhe!
        .map((d) => {
          const lbl = FORMA_LABEL[d.forma] ?? d.forma.toUpperCase();
          const trocoTxt = d.troco > 0 ? ` (RECEB. ${fmtBRL(d.recebido)} / TROCO ${fmtBRL(d.troco)})` : "";
          return `<tr><td class="label">${esc(lbl)}:</td><td class="v right">${fmtBRL(d.pago)}${esc(trocoTxt)}</td></tr>`;
        })
        .join("")
    : "";

  const endereco = [c?.endereco, c?.cidade && c?.estado ? `${c.cidade} - ${c.estado}` : c?.cidade ?? c?.estado].filter(Boolean).join("<br/>");
  const tituloPac = paciente?.nome ?? contrato.paciente_nome;

  // -----------------------------------------------------------------
  // 4) Ticket 1 — Mensalidade.
  // -----------------------------------------------------------------
  const descricaoMens = `MENSALIDADE ${m.numero_parcela}/${totalParcelas} — CONTRATO #${contrato.numero}${plano?.nome ? ` — ${plano.nome.toUpperCase()}` : ""}`;
  const viaTextoMens = `IMPRESSÃO Nº ${viaNumeroMens}`;
  const ticketMens = `
  <div class="ticket">
    <div class="clinica-nome">${esc(c?.nome ?? "")}</div>
    <div class="center sm">${endereco}</div>
    ${c?.telefone ? `<div class="center sm">FONE ${esc(c.telefone)}</div>` : ""}
    ${c?.cnpj ? `<div class="center sm">CNPJ ${esc(c.cnpj)}</div>` : ""}

    <div class="sep"></div>
    <div class="center lg">GUIA DE RECEBIMENTO</div>
    <div class="center sm">MENSALIDADE DE CONVÊNIO</div>
    <div class="sep"></div>

    <div class="center bold">${esc(tituloPac)}</div>
    ${paciente?.cpf ? `<div class="center sm">CPF: <span class="v">${esc(paciente.cpf)}</span></div>` : ""}
    ${paciente?.telefone ? `<div class="center sm">FONE: <span class="v">${esc(paciente.telefone)}</span></div>` : ""}

    <div class="sep"></div>

    <table>
      <tr><td class="label">CONTRATO:</td><td class="v right">#${contrato.numero}</td></tr>
      <tr><td class="label">PARCELA:</td><td class="v right">${m.numero_parcela}/${totalParcelas}</td></tr>
      <tr><td class="label">VENCIMENTO:</td><td class="v right">${fmtDataSimples(m.vencimento)}</td></tr>
      ${usuarioMensNome ? `<tr><td class="label" colspan="2">USUÁRIO: <span class="v">${esc(usuarioMensNome)}</span></td></tr>` : ""}
    </table>

    <div class="sep"></div>

    <table>
      <tr class="bold">
        <td style="width:14mm">QTD</td>
        <td>DESCRIÇÃO</td>
      </tr>
      <tr>
        <td>1</td>
        <td>${esc(descricaoMens)}</td>
      </tr>
    </table>

    <div class="row" style="margin-top:8px">
      <div class="bold">VALOR RECEBIDO<br/><span class="sm">(${esc(isMisto ? "MISTO" : formaLbl)})</span></div>
      <div class="bold lg">${fmtBRL(valorMens)}</div>
    </div>

    ${isMisto ? `
    <table style="margin-top:4px">
      ${detalheRows}
    </table>
    ` : ""}

    ${pagamento.forma_pagamento === "cartao_credito" ? `
    <table>
      ${bandeiraTxt ? `<tr><td class="label">BANDEIRA:</td><td class="v right">${esc(bandeiraTxt)}</td></tr>` : ""}
      <tr><td class="label">PARCELAMENTO:</td><td class="v right">${parcelasTxtMens}</td></tr>
    </table>
    ` : ""}

    <div class="sep"></div>
    <div class="row sm">
      <div>DATA</div>
      <div>${fmtData(new Date().toISOString())}${viaNumeroMens >= 2 ? ` — ${viaTextoMens}` : ""}</div>
    </div>
  </div>`;

  // -----------------------------------------------------------------
  // 5) Ticket 2 — Taxa de adesão.
  // -----------------------------------------------------------------
  const descricaoTaxa = `TAXA DE ADESÃO — CONTRATO #${contrato.numero}${plano?.nome ? ` — ${plano.nome.toUpperCase()}` : ""}`;
  const viaTextoTaxa = `IMPRESSÃO Nº ${viaNumeroTaxa}`;
  const ticketTaxa = `
  <div class="ticket">
    <div class="clinica-nome">${esc(c?.nome ?? "")}</div>
    <div class="center sm">${endereco}</div>
    ${c?.telefone ? `<div class="center sm">FONE ${esc(c.telefone)}</div>` : ""}
    ${c?.cnpj ? `<div class="center sm">CNPJ ${esc(c.cnpj)}</div>` : ""}

    <div class="sep"></div>
    <div class="center lg">GUIA DE RECEBIMENTO</div>
    <div class="center sm">TAXA DE ADESÃO — CARTÃO DE BENEFÍCIOS</div>
    <div class="sep"></div>

    <div class="center bold">${esc(tituloPac)}</div>
    ${paciente?.cpf ? `<div class="center sm">CPF: <span class="v">${esc(paciente.cpf)}</span></div>` : ""}
    ${paciente?.telefone ? `<div class="center sm">FONE: <span class="v">${esc(paciente.telefone)}</span></div>` : ""}

    <div class="sep"></div>

    <table>
      <tr><td class="label">CONTRATO:</td><td class="v right">#${contrato.numero}</td></tr>
      <tr><td class="label">REFERÊNCIA:</td><td class="v right">PARCELA ${m.numero_parcela}</td></tr>
      ${usuarioTaxaNome ? `<tr><td class="label" colspan="2">USUÁRIO: <span class="v">${esc(usuarioTaxaNome)}</span></td></tr>` : ""}
    </table>

    <div class="sep"></div>

    <table>
      <tr class="bold">
        <td style="width:14mm">QTD</td>
        <td>DESCRIÇÃO</td>
      </tr>
      <tr>
        <td>1</td>
        <td>${esc(descricaoTaxa)}</td>
      </tr>
    </table>

    <div class="row" style="margin-top:8px">
      <div class="bold">VALOR RECEBIDO<br/><span class="sm">(${esc(isMisto ? "MISTO" : formaLbl)})</span></div>
      <div class="bold lg">${fmtBRL(valorTax)}</div>
    </div>

    ${isMisto ? `
    <table style="margin-top:4px">
      ${detalheRows}
    </table>
    ` : ""}

    ${pagamento.forma_pagamento === "cartao_credito" ? `
    <table>
      ${bandeiraTxt ? `<tr><td class="label">BANDEIRA:</td><td class="v right">${esc(bandeiraTxt)}</td></tr>` : ""}
      <tr><td class="label">PARCELAMENTO:</td><td class="v right">${parcelasTxtTaxa}</td></tr>
    </table>
    ` : ""}

    <div class="sep"></div>
    <div class="row sm">
      <div>DATA</div>
      <div>${fmtData(new Date().toISOString())}${viaNumeroTaxa >= 2 ? ` — ${viaTextoTaxa}` : ""}</div>
    </div>
  </div>`;

  // -----------------------------------------------------------------
  // 6) Monta um único documento com as duas GRs, separadas por espaço.
  // -----------------------------------------------------------------
  // Linha de corte entre as duas GRs (tracejada, com legenda ✂).
  const linhaCorte = `
    <div style="margin:6mm 0; text-align:center; font-size:8pt; color:#000;">
      <div style="border-top:1px dashed #000; position:relative; height:0;">
        <span style="position:relative; top:-7px; background:#fff; padding:0 4px;">✂ &nbsp; corte aqui &nbsp; ✂</span>
      </div>
    </div>`;
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<title>GR - ${esc(tituloPac)}</title>
<style>
  ${BASE_CSS}
</style></head>
<body>
  ${ticketMens}
  ${linhaCorte}
  ${ticketTaxa}
</body></html>`;

  imprimirViaIframe(html);

  // -----------------------------------------------------------------
  // 7) Registra auditoria — uma linha por tipo.
  // -----------------------------------------------------------------
  try {
    await supabase.from("gr_impressoes" as never).insert([
      {
        clinica_id: clinicaId,
        mensalidade_id: mensalidadeId,
        via_numero: viaNumeroMens,
        impresso_por: usuarioId ?? null,
        impresso_por_nome: usuarioNome ?? null,
        tipo: "mensalidade",
      },
      {
        clinica_id: clinicaId,
        mensalidade_id: mensalidadeId,
        via_numero: viaNumeroTaxa,
        impresso_por: usuarioId ?? null,
        impresso_por_nome: usuarioNome ?? null,
        tipo: "taxa_adesao",
      },
    ] as never);
  } catch (_) { /* falha silenciosa */ }
}
