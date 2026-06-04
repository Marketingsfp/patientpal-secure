import { supabase } from "@/integrations/supabase/client";

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
  pix: "PIX",
  cartao_credito: "CARTÃO CRÉDITO",
  cartao_debito: "CARTÃO DÉBITO",
  boleto: "BOLETO",
  convenio: "CONVÊNIO",
  transferencia: "TRANSFERÊNCIA",
};

export async function printGuiaAtendimento(input: PrintGRInput) {
  return printGuiaAtendimentoCore(input);
}

async function printGuiaAtendimentoCore({ agendamentoId, clinicaId, usuarioNome, usuarioId, reimpressao, pagamento }: PrintGRInput) {
  // Controle de vias: máximo 2 (1ª e 2ª via). Reimpressão repete a última sem incrementar.
  const { data: visExistentes, error: errVias } = await supabase
    .from("gr_impressoes" as never)
    .select("via_numero")
    .eq("agendamento_id", agendamentoId)
    .order("via_numero", { ascending: false });
  if (errVias) throw new Error(errVias.message);
  const existentes = (visExistentes as Array<{ via_numero: number }> | null) ?? [];
  const ultimaVia = existentes[0]?.via_numero ?? 0;
  let viaNumero: number;
  if (reimpressao) {
    viaNumero = ultimaVia > 0 ? ultimaVia : 1;
  } else {
    if (ultimaVia >= 2) {
      throw new Error("Limite de 2 vias atingido. Use 'Reimprimir última via' para uma cópia.");
    }
    viaNumero = ultimaVia + 1;
  }

  // Busca dados em paralelo
  const [ag, cli] = await Promise.all([
    supabase
      .from("agendamentos")
      .select("id, paciente_nome, paciente_id, medico_id, agenda_id, inicio, procedimento, observacoes")
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
          .select("nome, cpf, telefone, data_nascimento")
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
          .select("nome, valor_dinheiro_pix, valor_cartao, tipo")
          .eq("clinica_id", clinicaId)
          .ilike("nome", a.procedimento)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const paciente = pac.data as { nome: string; cpf: string | null; telefone: string | null; data_nascimento: string | null } | null;
  const medicoBasic = med.data as { nome: string; especialidade: { nome: string } | null } | null;
  const medicoNome = medicoBasic?.nome ?? "—";
  const espNome = medicoBasic?.especialidade?.nome?.toUpperCase() ?? "";
  let medicoData: { tipo_repasse: string | null; percentual_repasse_padrao: number | null; valor_repasse_padrao: number | null } | null = null;
  if (a.medico_id) {
    try {
      const { data: sens } = await supabase.rpc("medico_dados_sensiveis", { _medico_id: a.medico_id });
      const s = (sens as any) ?? {};
      medicoData = { tipo_repasse: s.tipo_repasse ?? null, percentual_repasse_padrao: s.percentual_repasse_padrao ?? null, valor_repasse_padrao: s.valor_repasse_padrao ?? null };
    } catch { medicoData = null; }
  }
  const procData = proc.data as { nome: string; valor_dinheiro_pix: number | null; valor_cartao: number | null; tipo: string | null } | null;

  // Se já temos pagamento informado, usa ele; senão tenta tabela de procedimentos
  const valor = pagamento ? Number(pagamento.valor) : Number(procData?.valor_dinheiro_pix ?? 0);
  const procNomeBase = (a.procedimento || procData?.nome || "CONSULTA").toUpperCase();
  const procNome = espNome ? `${espNome} - ${procNomeBase}` : procNomeBase;

  // Ficha = sequência do dia (placeholder simples baseado nos minutos)
  const inicioDt = new Date(a.inicio);
  const ficha = String(inicioDt.getHours() * 60 + inicioDt.getMinutes()).padStart(3, "0");

  // Repasse conforme cadastro: tenta primeiro medico_convenios pelo nome do procedimento,
  // senão usa o padrão do médico (tipo_repasse / percentual / valor).
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  let prestador = 0;
  if (a.medico_id) {
    const { data: convs } = await supabase
      .from("medico_convenios")
      .select("nome, tipo_repasse, percentual, valor, ativo")
      .eq("medico_id", a.medico_id)
      .eq("ativo", true);
    const alvo = norm(procNomeBase);
    let conv = (convs ?? []).find((c) => norm(c.nome) === alvo);
    if (!conv && procData?.tipo) {
      const sentinel = `__CAT__:${String(procData.tipo).toUpperCase()}`;
      conv = (convs ?? []).find((c) => c.nome === sentinel);
    }
    if (conv) {
      if (conv.tipo_repasse === "valor" && conv.valor != null) {
        prestador = Number(conv.valor);
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
  prestador = Math.min(prestador, valor);
  const clinica = +(valor - prestador).toFixed(2);

  const formaLbl = pagamento?.forma_pagamento ? (FORMA_LABEL[pagamento.forma_pagamento] ?? pagamento.forma_pagamento.toUpperCase()) : "DINHEIRO";
  const parcelasTxt = pagamento && pagamento.forma_pagamento === "cartao_credito" && pagamento.parcelas && pagamento.parcelas > 1
    ? `${pagamento.parcelas}x DE ${fmtBRL(valor / pagamento.parcelas)}`
    : "À VISTA";
  const bandeiraTxt = pagamento?.bandeira_cartao ? pagamento.bandeira_cartao.toUpperCase() : "";
  const isMisto = pagamento?.forma_pagamento === "misto" && (pagamento.detalhe?.length ?? 0) > 0;
  const detalheRows = isMisto
    ? pagamento!.detalhe!
        .map((d) => {
          const lbl = FORMA_LABEL[d.forma] ?? d.forma.toUpperCase();
          const trocoTxt = d.troco > 0 ? ` (RECEB. ${fmtBRL(d.recebido)} / TROCO ${fmtBRL(d.troco)})` : "";
          return `<tr><td class="label">${esc(lbl)}:</td><td class="v right">${fmtBRL(d.pago)}${esc(trocoTxt)}</td></tr>`;
        })
        .join("")
    : "";

  const endereco = [c?.endereco, c?.cidade && c?.estado ? `${c.cidade} - ${c.estado}` : c?.cidade ?? c?.estado].filter(Boolean).join("<br/>");

  const viaTexto = viaNumero === 1 ? "1ª VIA" : "2ª VIA — REIMPRESSÃO";

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<title>GR - ${esc(paciente?.nome ?? a.paciente_nome)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { font-family: "Courier New", "Consolas", monospace; font-size: 11pt; line-height: 1.25; }
  .ticket { width: 76mm; padding: 3mm 2mm 6mm; }
  .center { text-align: center; }
  .right  { text-align: right; }
  .bold   { font-weight: 700; }
  .sm     { font-size: 9pt; }
  .lg     { font-size: 13pt; font-weight: 700; }
  .sep    { border-top: 1px dashed #000; margin: 6px 0; }
  .row    { display: flex; justify-content: space-between; gap: 6px; }
  table   { width: 100%; border-collapse: collapse; }
  td      { padding: 1px 0; vertical-align: top; }
  .label  { color: #000; }
  .v      { font-weight: 700; }
  h1, h2, h3 { margin: 0; }
  @media print { .noprint { display: none; } }
  .noprint { position: fixed; top: 8px; right: 8px; }
  .noprint button { padding: 6px 12px; font-size: 12px; cursor: pointer; }
</style></head>
<body>
  <div class="noprint">
    <button onclick="window.print()">Imprimir</button>
    <button onclick="window.close()">Fechar</button>
  </div>
  <div class="ticket">
    <div class="center bold">${esc(c?.nome ?? "")}</div>
    <div class="center sm">${endereco}</div>
    ${c?.telefone ? `<div class="center sm">FONE ${esc(c.telefone)}</div>` : ""}
    ${c?.cnpj ? `<div class="center sm">CNPJ ${esc(c.cnpj)}</div>` : ""}

    <div class="sep"></div>
    <div class="center lg">GUIA DE ATENDIMENTO</div>
    <div class="center bold" style="margin-top:2px">${viaTexto}</div>
    <div class="sep"></div>

    <div class="center bold">${esc(paciente?.nome ?? a.paciente_nome)}</div>
    ${paciente?.cpf ? `<div class="center sm">CPF: <span class="v">${esc(paciente.cpf)}</span></div>` : ""}
    ${paciente?.telefone ? `<div class="center sm">FONE: <span class="v">${esc(paciente.telefone)}</span></div>` : ""}
    ${paciente?.data_nascimento ? `<div class="center sm">NASC: <span class="v">${fmtDataSimples(paciente.data_nascimento)}</span></div>` : ""}

    <div class="sep"></div>

    <table>
      <tr><td class="label">FICHA:</td><td class="v right">${ficha}</td></tr>
      <tr><td class="label">PROFISSIONAL:</td><td class="v right">${esc(medicoNome)}</td></tr>
      <tr><td class="label">HORÁRIO:</td><td class="v right">${fmtData(a.inicio)}</td></tr>
      ${usuarioNome ? `<tr><td class="label">USUÁRIO:</td><td class="v right">${esc(usuarioNome)}</td></tr>` : ""}
    </table>

    <div class="sep"></div>

    <table>
      <tr class="bold">
        <td style="width:14mm">QTD</td>
        <td>SERVIÇO</td>
      </tr>
      <tr>
        <td>1</td>
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

    ${pagamento?.forma_pagamento === "cartao_credito" ? `
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
      <div>DATA IMPRESSAO</div>
      <div>${fmtData(new Date().toISOString())}</div>
    </div>
  </div>
  <script>
    window.addEventListener("load", function () {
      setTimeout(function () { window.print(); }, 150);
    });
  </script>
</body></html>`;

  const w = window.open("", "_blank", "width=420,height=720");
  if (!w) {
    throw new Error("O navegador bloqueou a janela de impressão. Permita pop-ups e tente novamente.");
  }
  w.document.open();
  w.document.write(html);
  w.document.close();

  // Registra a impressão (se for nova via). Não bloqueia a janela já aberta em caso de erro.
  if (!reimpressao) {
    try {
      await supabase.from("gr_impressoes" as never).insert({
        clinica_id: clinicaId,
        agendamento_id: agendamentoId,
        via_numero: viaNumero,
        impresso_por: usuarioId ?? null,
        impresso_por_nome: usuarioNome ?? null,
      } as never);
    } catch (_) { /* falha silenciosa: registro de via não deve bloquear impressão */ }
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
    .select("via_numero")
    .eq("agendamento_id", chaveVia)
    .order("via_numero", { ascending: false });
  if (errVias) throw new Error(errVias.message);
  const existentes = (visExistentes as Array<{ via_numero: number }> | null) ?? [];
  const ultimaVia = existentes[0]?.via_numero ?? 0;
  let viaNumero: number;
  if (reimpressao) {
    viaNumero = ultimaVia > 0 ? ultimaVia : 1;
  } else {
    if (ultimaVia >= 2) {
      throw new Error("Limite de 2 vias atingido. Use 'Reimprimir última via' para uma cópia.");
    }
    viaNumero = ultimaVia + 1;
  }

  // Busca agendamentos + clínica + tabela de procedimentos da clínica
  const [agsRes, cliRes, procsRes, lancsRes] = await Promise.all([
    supabase
      .from("agendamentos")
      .select("id, paciente_nome, paciente_id, medico_id, inicio, procedimento")
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
        .select("nome, cpf, telefone, data_nascimento")
        .eq("id", pacIdRef)
        .maybeSingle()
    : { data: null };
  const paciente = pacienteRes.data as { nome: string; cpf: string | null; telefone: string | null; data_nascimento: string | null } | null;
  const pacienteNome = paciente?.nome ?? ags[0].paciente_nome ?? "—";

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
  type Grupo = { medicoId: string | null; medicoNome: string; itens: Item[]; subtotal: number; prestador: number; clinica: number; inicioRef: string };
  const grupos = new Map<string, Grupo>();

  for (const a of ags) {
    const procNomeBase = (a.procedimento || "CONSULTA").toUpperCase();
    const proc = procByNome.get(normalizar(procNomeBase));
    const espNome = a.medico_id ? (medById.get(a.medico_id)?.especialidadeNome ?? null) : null;
    const procNome = espNome ? `${espNome.toUpperCase()} - ${procNomeBase}` : procNomeBase;
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
      const alvo = normalizar(procNomeBase);
      let conv = convs.find((cv) => normalizar(cv.nome) === alvo);
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

    const key = a.medico_id ?? "__sem_medico__";
    const medicoNome = a.medico_id ? (medById.get(a.medico_id)?.nome ?? "—") : "SEM PROFISSIONAL";
    const g = grupos.get(key) ?? { medicoId: a.medico_id ?? null, medicoNome, itens: [], subtotal: 0, prestador: 0, clinica: 0, inicioRef: a.inicio };
    g.itens.push({ procNome, valor, prestador, clinica: clin, inicio: a.inicio });
    if (a.inicio < g.inicioRef) g.inicioRef = a.inicio;
    g.subtotal = +(g.subtotal + valor).toFixed(2);
    g.prestador = +(g.prestador + prestador).toFixed(2);
    g.clinica = +(g.clinica + clin).toFixed(2);
    grupos.set(key, g);
  }

  const formaLbl = pagamento.forma_pagamento ? (FORMA_LABEL[pagamento.forma_pagamento] ?? pagamento.forma_pagamento.toUpperCase()) : "DINHEIRO";
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
  const viaTexto = viaNumero === 1 ? "1ª VIA" : "2ª VIA — REIMPRESSÃO";

  // Cabeçalho da clínica (reutilizado em cada GR)
  const headerClinica = `
    <div class="center bold">${esc(c?.nome ?? "")}</div>
    <div class="center sm">${endereco}</div>
    ${c?.telefone ? `<div class="center sm">FONE ${esc(c.telefone)}</div>` : ""}
    ${c?.cnpj ? `<div class="center sm">CNPJ ${esc(c.cnpj)}</div>` : ""}
  `;
  const headerPaciente = `
    <div class="center bold">${esc(pacienteNome)}</div>
    ${paciente?.cpf ? `<div class="center sm">CPF: <span class="v">${esc(paciente.cpf)}</span></div>` : ""}
    ${paciente?.telefone ? `<div class="center sm">FONE: <span class="v">${esc(paciente.telefone)}</span></div>` : ""}
    ${paciente?.data_nascimento ? `<div class="center sm">NASC: <span class="v">${fmtDataSimples(paciente.data_nascimento)}</span></div>` : ""}
  `;

  const gruposArr = Array.from(grupos.values());
  const dataImpressao = fmtData(new Date().toISOString());

  // Uma GR completa por médico, separadas por linha tracejada bem visível
  const grsHtml = gruposArr.map((g, idx) => {
    const isLast = idx === gruposArr.length - 1;
    const ficha = (() => {
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
        <div class="center bold" style="margin-top:2px">${viaTexto}</div>
        <div class="sep"></div>
        ${headerPaciente}
        <div class="sep"></div>
        <table>
          <tr><td class="label">FICHA:</td><td class="v right">${ficha}</td></tr>
          <tr><td class="label">PROFISSIONAL:</td><td class="v right">${esc(g.medicoNome)}</td></tr>
          <tr><td class="label">HORÁRIO:</td><td class="v right">${fmtData(g.inicioRef)}</td></tr>
          ${usuarioNome ? `<tr><td class="label">USUÁRIO:</td><td class="v right">${esc(usuarioNome)}</td></tr>` : ""}
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
          <div>DATA IMPRESSAO</div>
          <div>${dataImpressao}</div>
        </div>
      </div>
      ${!isLast ? `<div class="cut"><div class="cut-line"></div><div class="cut-label">- - - - - - - - - - - - CORTE AQUI - - - - - - - - - - - -</div><div class="cut-line"></div></div>` : ""}
    `;
  }).join("");

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<title>GR - ${esc(pacienteNome)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { font-family: "Courier New", "Consolas", monospace; font-size: 11pt; line-height: 1.25; }
  .ticket { width: 76mm; padding: 3mm 2mm 6mm; }
  .center { text-align: center; }
  .right  { text-align: right; }
  .bold   { font-weight: 700; }
  .sm     { font-size: 9pt; }
  .lg     { font-size: 13pt; font-weight: 700; }
  .sep    { border-top: 1px dashed #000; margin: 6px 0; }
  .row    { display: flex; justify-content: space-between; gap: 6px; }
  table   { width: 100%; border-collapse: collapse; }
  td      { padding: 1px 0; vertical-align: top; }
  .label  { color: #000; }
  .v      { font-weight: 700; }
  .cut    { width: 76mm; padding: 4mm 2mm; text-align: center; }
  .cut-line { border-top: 2px dashed #000; margin: 2mm 0; }
  .cut-label { font-size: 8pt; letter-spacing: 1px; }
  @media print { .noprint { display: none; } }
  .noprint { position: fixed; top: 8px; right: 8px; }
  .noprint button { padding: 6px 12px; font-size: 12px; cursor: pointer; }
</style></head>
<body>
  <div class="noprint">
    <button onclick="window.print()">Imprimir</button>
    <button onclick="window.close()">Fechar</button>
  </div>
  ${grsHtml}
  <script>
    window.addEventListener("load", function () {
      setTimeout(function () { window.print(); }, 150);
    });
  </script>
</body></html>`;

  const w = window.open("", "_blank", "width=420,height=720");
  if (!w) {
    throw new Error("O navegador bloqueou a janela de impressão. Permita pop-ups e tente novamente.");
  }
  w.document.open();
  w.document.write(html);
  w.document.close();

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

async function printGuiaMensalidadeCore({ mensalidadeId, clinicaId, usuarioNome, usuarioId, reimpressao, pagamento }: PrintGRMensalidadeInput) {
  // Controle de vias 1ª/2ª via por mensalidade
  const { data: visExistentes, error: errVias } = await supabase
    .from("gr_impressoes" as never)
    .select("via_numero")
    .eq("mensalidade_id", mensalidadeId)
    .order("via_numero", { ascending: false });
  if (errVias) throw new Error(errVias.message);
  const existentes = (visExistentes as Array<{ via_numero: number }> | null) ?? [];
  const ultimaVia = existentes[0]?.via_numero ?? 0;
  let viaNumero: number;
  if (reimpressao) {
    viaNumero = ultimaVia > 0 ? ultimaVia : 1;
  } else {
    if (ultimaVia >= 2) {
      throw new Error("Limite de 2 vias atingido. Use 'Reimprimir última via' para uma cópia.");
    }
    viaNumero = ultimaVia + 1;
  }

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

  const totalParcelas = contrato.num_parcelas ?? m.numero_parcela;
  const valor = Number(pagamento.valor ?? m.valor ?? 0);

  const formaLbl = pagamento.forma_pagamento ? (FORMA_LABEL[pagamento.forma_pagamento] ?? pagamento.forma_pagamento.toUpperCase()) : "DINHEIRO";
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
  const viaTexto = viaNumero === 1 ? "1ª VIA" : "2ª VIA — REIMPRESSÃO";
  const descricao = `MENSALIDADE ${m.numero_parcela}/${totalParcelas} — CONTRATO #${contrato.numero}${plano?.nome ? ` — ${plano.nome.toUpperCase()}` : ""}`;
  const tituloPac = paciente?.nome ?? contrato.paciente_nome;

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<title>GR - ${esc(tituloPac)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { font-family: "Courier New", "Consolas", monospace; font-size: 11pt; line-height: 1.25; }
  .ticket { width: 76mm; padding: 3mm 2mm 6mm; }
  .center { text-align: center; }
  .right  { text-align: right; }
  .bold   { font-weight: 700; }
  .sm     { font-size: 9pt; }
  .lg     { font-size: 13pt; font-weight: 700; }
  .sep    { border-top: 1px dashed #000; margin: 6px 0; }
  .row    { display: flex; justify-content: space-between; gap: 6px; }
  table   { width: 100%; border-collapse: collapse; }
  td      { padding: 1px 0; vertical-align: top; }
  .label  { color: #000; }
  .v      { font-weight: 700; }
  @media print { .noprint { display: none; } }
  .noprint { position: fixed; top: 8px; right: 8px; }
  .noprint button { padding: 6px 12px; font-size: 12px; cursor: pointer; }
</style></head>
<body>
  <div class="noprint">
    <button onclick="window.print()">Imprimir</button>
    <button onclick="window.close()">Fechar</button>
  </div>
  <div class="ticket">
    <div class="center bold">${esc(c?.nome ?? "")}</div>
    <div class="center sm">${endereco}</div>
    ${c?.telefone ? `<div class="center sm">FONE ${esc(c.telefone)}</div>` : ""}
    ${c?.cnpj ? `<div class="center sm">CNPJ ${esc(c.cnpj)}</div>` : ""}

    <div class="sep"></div>
    <div class="center lg">GUIA DE RECEBIMENTO</div>
    <div class="center sm">MENSALIDADE DE CONVÊNIO</div>
    <div class="center bold" style="margin-top:2px">${viaTexto}</div>
    <div class="sep"></div>

    <div class="center bold">${esc(tituloPac)}</div>
    ${paciente?.cpf ? `<div class="center sm">CPF: <span class="v">${esc(paciente.cpf)}</span></div>` : ""}
    ${paciente?.telefone ? `<div class="center sm">FONE: <span class="v">${esc(paciente.telefone)}</span></div>` : ""}

    <div class="sep"></div>

    <table>
      <tr><td class="label">CONTRATO:</td><td class="v right">#${contrato.numero}</td></tr>
      <tr><td class="label">PARCELA:</td><td class="v right">${m.numero_parcela}/${totalParcelas}</td></tr>
      <tr><td class="label">VENCIMENTO:</td><td class="v right">${fmtDataSimples(m.vencimento)}</td></tr>
      ${usuarioNome ? `<tr><td class="label">USUÁRIO:</td><td class="v right">${esc(usuarioNome)}</td></tr>` : ""}
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
      <div>DATA IMPRESSÃO</div>
      <div>${fmtData(new Date().toISOString())}</div>
    </div>
  </div>
  <script>
    window.addEventListener("load", function () {
      setTimeout(function () { window.print(); }, 150);
    });
  </script>
</body></html>`;

  const w = window.open("", "_blank", "width=420,height=720");
  if (!w) throw new Error("O navegador bloqueou a janela de impressão. Permita pop-ups e tente novamente.");
  w.document.open();
  w.document.write(html);
  w.document.close();

  if (!reimpressao) {
    try {
      await supabase.from("gr_impressoes" as never).insert({
        clinica_id: clinicaId,
        mensalidade_id: mensalidadeId,
        via_numero: viaNumero,
        impresso_por: usuarioId ?? null,
        impresso_por_nome: usuarioNome ?? null,
      } as never);
    } catch (_) { /* falha silenciosa */ }
  }
}