/**
 * Plano de treinamento: o orçamento total de 20 minutos é dividido
 * automaticamente entre as 5 ligações, as 5 conversas de WhatsApp e a prova.
 */
export const LIMITE_TOTAL_MS = 20 * 60 * 1000;
/** Trava de tempo desligada: treinamentos e prova rodam sem limite. */
export const TRAVA_TEMPO_ATIVA: boolean = false;
export const META_LIGACOES = 5;
export const META_WHATSAPP = 5;
/** Nota mínima para um atendimento contar como concluído na trilha. */
export const NOTA_MINIMA = 6;

export type Dificuldade = "facil" | "medio" | "dificil";

export const DIFICULDADES: { valor: Dificuldade; label: string; descricao: string }[] = [
  { valor: "facil", label: "Fácil", descricao: "Paciente receptivo, poucas objeções." },
  { valor: "medio", label: "Médio", descricao: "Dúvidas de preço e horário, objeções comuns." },
  { valor: "dificil", label: "Difícil", descricao: "Paciente apressado, desconfiado e resistente." },
];

/** Um atendimento só conta para a meta quando atinge a nota mínima. */
export function contaParaMeta(nota: number | null | undefined) {
  return (Number(nota) || 0) >= NOTA_MINIMA;
}

/** 5 ligações + 5 conversas + 1 prova */
export const TOTAL_ATIVIDADES = META_LIGACOES + META_WHATSAPP + 1;
/** Cota fixa de cada atividade (~1min49s) */
export const COTA_ATIVIDADE_MS = Math.floor(LIMITE_TOTAL_MS / TOTAL_ATIVIDADES);

export type Atividade = "voz" | "texto" | "prova";

/** Próxima atividade da trilha, na ordem: WhatsApp → ligações → prova. */
export function proximaAtividade(feitasVoz: number, feitasTexto: number): Atividade {
  if (feitasTexto < META_WHATSAPP) return "texto";
  if (feitasVoz < META_LIGACOES) return "voz";
  return "prova";
}

/** Cota disponível para a sessão atual, respeitando o saldo geral. */
export function cotaSessaoMs(usadoMs: number) {
  return Math.max(0, Math.min(COTA_ATIVIDADE_MS, LIMITE_TOTAL_MS - usadoMs));
}

export function formatDuracaoMs(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// ---------------------------------------------------------------------------
// Regra ÚNICA de progresso do Coach.
//
// Antes cada tela contava de um jeito: a home da atendente só olhava o dia, o
// roleplay só as sessões de hoje com nota mínima e o painel da gestora somava
// tudo sem nota mínima — por isso a gestora via 5/5 e a atendente 3/5, e o
// certificado "Trilha concluída" reaparecia todo dia. Agora existem dois
// blocos, calculados aqui e usados por todas as telas:
//   - `hoje`   → "o que fazer hoje" (meta diária)
//   - `trilha` → conclusão e certificado (acumulado, não zera de um dia para o
//                outro)
// ---------------------------------------------------------------------------

/** 1 hora de plataforma por dia. */
export const META_SEGUNDOS_DIA = 3600;
/** Dias de constância considerados no certificado. */
export const META_DIAS_CONSTANCIA = 3;

export type SessaoProgresso = {
  nota?: number | null;
  created_at: string;
  modo?: string | null;
  simulacao_gestor?: boolean | null;
};

export type ProvaProgresso = {
  nota?: number | null;
  created_at: string;
  simulacao_gestor?: boolean | null;
};

export type TempoProgresso = { dia: string; segundos: number };

export type RegrasProgresso = {
  metaLigacoes: number;
  metaWhatsapp: number;
  notaMinima: number;
  segundosDia: number;
  /** Dia de referência (America/Sao_Paulo, formato AAAA-MM-DD). */
  hoje: string;
};

export function diaSaoPaulo(d: Date | string = new Date()): string {
  const data = typeof d === "string" ? new Date(d) : d;
  return data.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export function regrasPadrao(hoje: string = diaSaoPaulo()): RegrasProgresso {
  return {
    metaLigacoes: META_LIGACOES,
    metaWhatsapp: META_WHATSAPP,
    notaMinima: NOTA_MINIMA,
    segundosDia: META_SEGUNDOS_DIA,
    hoje,
  };
}

export type Progresso = {
  hoje: {
    ligacoes: number;
    whatsapp: number;
    segundos: number;
    provaFeita: boolean;
    percentual: number;
    completo: boolean;
  };
  trilha: {
    ligacoes: number;
    whatsapp: number;
    provaAprovada: boolean;
    percentual: number;
    concluida: boolean;
  };
  totais: {
    segundos: number;
    dias: number;
    mediaProva: number;
    mediaRoleplay: number;
    sessoes: number;
    provas: number;
  };
};

const mediaNotas = (arr: { nota?: number | null }[]) =>
  arr.length ? arr.reduce((s, x) => s + (Number(x.nota) || 0), 0) / arr.length : 0;

/** Simulação feita por um gestor nunca conta para a atendente. */
const semGestor = <T extends { simulacao_gestor?: boolean | null }>(arr: T[]) =>
  arr.filter((x) => x.simulacao_gestor !== true);

export function calcularProgresso(
  sessoesEntrada: SessaoProgresso[],
  provasEntrada: ProvaProgresso[],
  tempos: TempoProgresso[],
  regras: RegrasProgresso = regrasPadrao(),
): Progresso {
  const sessoes = semGestor(sessoesEntrada);
  const provas = semGestor(provasEntrada);

  const validaSessao = (s: SessaoProgresso) => (Number(s.nota) || 0) >= regras.notaMinima;
  const validaProva = (p: ProvaProgresso) => (Number(p.nota) || 0) >= regras.notaMinima;
  const ehVoz = (s: SessaoProgresso) => (s.modo ?? "voz") === "voz";
  const deHoje = (iso: string) => diaSaoPaulo(iso) === regras.hoje;

  const sessoesValidas = sessoes.filter(validaSessao);
  const sessoesHoje = sessoesValidas.filter((s) => deHoje(s.created_at));
  const provasHoje = provas.filter((p) => deHoje(p.created_at));

  const segundosHoje = tempos
    .filter((t) => t.dia === regras.hoje)
    .reduce((s, t) => s + (Number(t.segundos) || 0), 0);
  const segundosTotal = tempos.reduce((s, t) => s + (Number(t.segundos) || 0), 0);
  const dias = new Set(tempos.filter((t) => (Number(t.segundos) || 0) > 0).map((t) => t.dia)).size;

  const ligacoesHoje = sessoesHoje.filter(ehVoz).length;
  const whatsappHoje = sessoesHoje.filter((s) => !ehVoz(s)).length;
  const itensHoje = [
    ligacoesHoje >= regras.metaLigacoes,
    whatsappHoje >= regras.metaWhatsapp,
    provasHoje.length > 0,
    segundosHoje >= regras.segundosDia,
  ];

  const ligacoesTotal = sessoesValidas.filter(ehVoz).length;
  const whatsappTotal = sessoesValidas.filter((s) => !ehVoz(s)).length;
  const provaAprovada = provas.some(validaProva);
  const itensTrilha = [
    ligacoesTotal >= regras.metaLigacoes,
    whatsappTotal >= regras.metaWhatsapp,
    provaAprovada,
  ];

  const pct = (itens: boolean[]) =>
    Math.round((itens.filter(Boolean).length / itens.length) * 100);

  return {
    hoje: {
      ligacoes: ligacoesHoje,
      whatsapp: whatsappHoje,
      segundos: segundosHoje,
      provaFeita: provasHoje.length > 0,
      percentual: pct(itensHoje),
      completo: itensHoje.every(Boolean),
    },
    trilha: {
      ligacoes: ligacoesTotal,
      whatsapp: whatsappTotal,
      provaAprovada,
      percentual: pct(itensTrilha),
      concluida: itensTrilha.every(Boolean),
    },
    totais: {
      segundos: segundosTotal,
      dias,
      mediaProva: mediaNotas(provas),
      mediaRoleplay: mediaNotas(sessoes),
      sessoes: sessoes.length,
      provas: provas.length,
    },
  };
}
