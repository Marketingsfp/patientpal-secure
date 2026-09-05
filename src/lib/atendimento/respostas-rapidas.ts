/**
 * Mensagens rápidas (slash commands) do atendimento — regras puras.
 *
 * Este arquivo NÃO fala com banco nem com WhatsApp. Ele só contém as regras
 * de comando, busca, ordenação e preenchimento de variáveis, para que possam
 * ser testadas isoladamente e reaproveitadas pelo composer e pelo cadastro.
 *
 * IMPORTANTE: mensagem rápida é apenas um atalho de digitação interno.
 * Ela não é, e não deve ser tratada como, um template oficial do WhatsApp/Meta.
 */

export type EscopoResposta = "clinica" | "pessoal";

export type RespostaRapida = {
  id: string;
  clinica_id: string;
  comando: string;
  nome: string;
  conteudo: string;
  categoria: string | null;
  ativo: boolean;
  escopo: EscopoResposta;
  owner_user_id: string | null;
};

/** Categorias sugeridas (o cadastro aceita texto livre também). */
export const CATEGORIAS_SUGERIDAS = [
  "Agendamento",
  "Consultas",
  "Exames",
  "Valores",
  "Documentos",
  "Endereço",
  "Pagamento",
  "Pós-atendimento",
  "Administrativo",
] as const;

/** Variáveis realmente suportadas pelos dados existentes no sistema. */
export const VARIAVEIS_SUPORTADAS = [
  { chave: "patient.name", rotulo: "nome do paciente", exemplo: "João da Silva" },
  { chave: "patient.first_name", rotulo: "primeiro nome do paciente", exemplo: "João" },
  { chave: "patient.phone", rotulo: "telefone do paciente", exemplo: "(11) 91234-5678" },
  { chave: "doctor.name", rotulo: "nome do profissional", exemplo: "Dra. Ana Souza" },
  { chave: "appointment.date", rotulo: "data do agendamento", exemplo: "12/03/2026" },
  { chave: "appointment.time", rotulo: "horário do agendamento", exemplo: "14:30" },
  { chave: "unit.name", rotulo: "nome da unidade", exemplo: "Unidade Centro" },
  { chave: "procedure.name", rotulo: "procedimento", exemplo: "Ultrassonografia" },
  { chave: "attendant.name", rotulo: "nome do atendente", exemplo: "Maria" },
] as const;

export type ChaveVariavel = (typeof VARIAVEIS_SUPORTADAS)[number]["chave"];

/** Valores reais disponíveis na conversa atual. Ausente = não preenchido. */
export type ContextoVariaveis = Partial<Record<ChaveVariavel, string | null | undefined>>;

/** Marcador usado quando não existe dado real para a variável. */
export const LACUNA = "______";

export function rotuloVariavel(chave: string): string {
  return VARIAVEIS_SUPORTADAS.find((v) => v.chave === chave)?.rotulo ?? chave;
}

/* ============================================================
 *  COMANDO
 * ========================================================== */

/** Normaliza o que o usuário digitou para o formato aceito (sem a barra). */
export function normalizarComando(entrada: string): string {
  return entrada
    .trim()
    .replace(/^\/+/, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 40);
}

/** Retorna a mensagem de erro, ou null quando o comando é válido. */
export function validarComando(entrada: string): string | null {
  const c = entrada.replace(/^\/+/, "");
  if (!c) return "Informe o comando (ex.: /endereco).";
  if (/\s/.test(c)) return "O comando não pode ter espaços.";
  if (!/^[a-z0-9_]+$/.test(c))
    return "Use apenas letras minúsculas, números e sublinhado (ex.: /valor_consulta).";
  if (c.length > 40) return "Comando muito longo (máximo 40 caracteres).";
  return null;
}

/* ============================================================
 *  DETECÇÃO DO "/" NO COMPOSER
 * ========================================================== */

export type ComandoDigitado = { inicio: number; fim: number; termo: string };

/**
 * Detecta um comando sendo digitado imediatamente antes do cursor.
 * Só considera "/" no início do texto ou precedido de espaço/quebra de linha,
 * para não disparar dentro de uma URL ou de uma data.
 */
export function detectarComandoNoTexto(texto: string, cursor: number): ComandoDigitado | null {
  const antes = texto.slice(0, cursor);
  const m = /(^|[\s\n])\/([a-zA-Z0-9_]*)$/.exec(antes);
  if (!m) return null;
  const termo = m[2] ?? "";
  const inicio = cursor - termo.length - 1;
  return { inicio, fim: cursor, termo: termo.toLowerCase() };
}

/**
 * Substitui apenas o trecho do comando pelo conteúdo escolhido, preservando
 * todo o restante do que já estava digitado.
 */
export function substituirTrecho(
  texto: string,
  inicio: number,
  fim: number,
  insercao: string,
): { texto: string; cursor: number } {
  const novo = texto.slice(0, inicio) + insercao + texto.slice(fim);
  return { texto: novo, cursor: inicio + insercao.length };
}

/* ============================================================
 *  BUSCA E ORDENAÇÃO
 * ========================================================== */

function semAcento(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export type OrdenacaoCtx = {
  /** IDs favoritados pelo usuário atual. */
  favoritos?: ReadonlySet<string>;
  /** Quantidade de usos do próprio usuário por resposta. */
  usos?: ReadonlyMap<string, number>;
  /** IDs usados recentemente pelo usuário (mais recente primeiro). */
  recentes?: readonly string[];
  /** Termos do contexto da conversa (ex.: procedimento em discussão). */
  contexto?: readonly string[];
};

/**
 * Filtra pelo termo digitado (comando, nome, conteúdo e categoria) e ordena
 * por: favoritas → contexto → mais usadas → recentes → alfabética.
 * Nada é escondido por contexto; ele apenas prioriza.
 */
export function filtrarRespostas(
  lista: readonly RespostaRapida[],
  termo: string,
  ctx: OrdenacaoCtx = {},
): RespostaRapida[] {
  const q = semAcento(termo.replace(/^\//, "").trim());
  const ativas = lista.filter((r) => r.ativo);
  const filtradas = !q
    ? ativas
    : ativas.filter((r) =>
        [r.comando, r.nome, r.conteudo, r.categoria ?? ""].some((campo) =>
          semAcento(campo).includes(q),
        ),
      );

  const favoritos = ctx.favoritos ?? new Set<string>();
  const usos = ctx.usos ?? new Map<string, number>();
  const recentes = ctx.recentes ?? [];
  const contexto = (ctx.contexto ?? []).map(semAcento).filter(Boolean);

  const pesoContexto = (r: RespostaRapida) =>
    contexto.some((t) => semAcento(`${r.nome} ${r.conteudo} ${r.categoria ?? ""}`).includes(t))
      ? 1
      : 0;
  const pesoPrefixo = (r: RespostaRapida) => (q && r.comando.startsWith(q) ? 1 : 0);

  return filtradas.slice().sort((a, b) => {
    const fa = favoritos.has(a.id) ? 1 : 0;
    const fb = favoritos.has(b.id) ? 1 : 0;
    if (fa !== fb) return fb - fa;
    const pa = pesoPrefixo(a);
    const pb = pesoPrefixo(b);
    if (pa !== pb) return pb - pa;
    const ca = pesoContexto(a);
    const cb = pesoContexto(b);
    if (ca !== cb) return cb - ca;
    const ua = usos.get(a.id) ?? 0;
    const ub = usos.get(b.id) ?? 0;
    if (ua !== ub) return ub - ua;
    const ra = recentes.indexOf(a.id);
    const rb = recentes.indexOf(b.id);
    if (ra !== rb) return (ra < 0 ? 999 : ra) - (rb < 0 ? 999 : rb);
    return a.comando.localeCompare(b.comando, "pt-BR");
  });
}

/* ============================================================
 *  VARIÁVEIS
 * ========================================================== */

export type ResultadoVariaveis = {
  texto: string;
  /** Rótulos amigáveis das variáveis que não puderam ser preenchidas. */
  faltantes: string[];
  /** Variáveis escritas na mensagem que o sistema não conhece. */
  desconhecidas: string[];
};

/**
 * Preenche as variáveis com dados reais. O que não tiver dado vira uma lacuna
 * visível (`______`) para a atendente completar — nunca sai `{{...}}` para o
 * paciente. O texto definido pela clínica não é reescrito de nenhuma forma.
 */
export function aplicarVariaveis(conteudo: string, ctx: ContextoVariaveis): ResultadoVariaveis {
  const faltantes: string[] = [];
  const desconhecidas: string[] = [];
  const conhecidas = new Set<string>(VARIAVEIS_SUPORTADAS.map((v) => v.chave));

  const texto = conteudo.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_all, chave: string) => {
    if (!conhecidas.has(chave)) {
      if (!desconhecidas.includes(chave)) desconhecidas.push(chave);
      if (!faltantes.includes(chave)) faltantes.push(chave);
      return LACUNA;
    }
    const valor = ctx[chave as ChaveVariavel];
    const limpo = typeof valor === "string" ? valor.trim() : "";
    if (!limpo) {
      const rot = rotuloVariavel(chave);
      if (!faltantes.includes(rot)) faltantes.push(rot);
      return LACUNA;
    }
    return limpo;
  });

  return { texto, faltantes, desconhecidas };
}

/** Prévia do cadastro: usa exemplos, apenas para visualização. */
export function previewComExemplos(conteudo: string): string {
  return conteudo.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_all, chave: string) => {
    const v = VARIAVEIS_SUPORTADAS.find((x) => x.chave === chave);
    return v ? v.exemplo : LACUNA;
  });
}

/**
 * Primeiro nome, usado para {{patient.first_name}}.
 */
export function primeiroNome(nome?: string | null): string {
  const n = (nome ?? "").trim();
  if (!n) return "";
  return n.split(/\s+/)[0] ?? "";
}
