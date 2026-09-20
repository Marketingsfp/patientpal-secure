/** Preferências conversacionais revalidadas no catálogo; nunca autorizam agendamento. */
import { normalizarTexto, type FatoRecuperado } from "./evidencia";
import { perguntaIdentificacaoProfissional } from "../catalogo-busca";

export type RaizSelecaoContextual = {
  fonte: "catalogo_publicado";
  registro: string;
  versao: string | null;
};
export type ModalidadeSelecaoContextual = {
  nome: string;
  procedimento: string;
  raizesFonte: RaizSelecaoContextual[];
};
export type SelecaoContextual = {
  versao: 1;
  clinicaId: string;
  sessaoId: string;
  /** ID do fato oficial, quando houver. Não é necessariamente o UUID da agenda. */
  medicoId: string | null;
  medicoNome: string;
  referenciaProfissional: string;
  raizesFonte: RaizSelecaoContextual[];
  modalidade: ModalidadeSelecaoContextual | null;
};
export type CandidatoSelecaoContextual = {
  medicoId: string | null;
  medicoNome: string;
  referenciaProfissional: string;
  raizesFonte: RaizSelecaoContextual[];
  modalidades: ModalidadeSelecaoContextual[];
  unidades: string[];
};
export type ResultadoSelecaoContextual = {
  estado: "sem_selecao" | "selecionado" | "esclarecer_medico" | "esclarecer_modalidade" | "limpo";
  selecao: SelecaoContextual | null;
  opcoesMedicos: CandidatoSelecaoContextual[];
  opcoesModalidades: ModalidadeSelecaoContextual[];
  pergunta: string | null;
  motivo: string;
  escolhaExplicita: boolean;
  /** Inclui recusa e escolha ambígua; é esclarecimento, não execução. */
  turnoDeSelecao: boolean;
  aceiteAgendamento: false;
};
export type EntradaSelecaoContextual = {
  mensagem: string;
  clinicaId: string;
  sessaoId: string;
  /** Apenas fatos que o servidor voltou a recuperar da publicação vigente. */
  fatosOficiais: FatoRecuperado[];
  selecaoAnterior?: SelecaoContextual | null;
  mudancaTema?: boolean;
  agora?: string;
};

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const objeto = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const nomeNormalizado = (v: string) =>
  normalizarTexto(v).replace(/^(?:dra?|doutor|doutora)\.?\s+/, "");
const tokensNome = (v: string) =>
  nomeNormalizado(v)
    .split(/[^a-z]+/)
    .filter((p) => p && !["da", "de", "do", "das", "dos", "e"].includes(p));
const juntarRaizes = (raizes: RaizSelecaoContextual[]) => [
  ...new Map(raizes.map((r) => [`${r.registro}\u0000${r.versao ?? ""}`, r])).values(),
];

/** JSON persistido é somente uma referência: resolverSelecaoContextual revalida os fatos. */
export function normalizarSelecaoContextual(valor: unknown): SelecaoContextual | null {
  const v = objeto(valor);
  const clinicaId = texto(v.clinicaId),
    sessaoId = texto(v.sessaoId),
    medicoNome = texto(v.medicoNome),
    referenciaProfissional = texto(v.referenciaProfissional);
  const lerRaizes = (r: unknown): RaizSelecaoContextual[] =>
    Array.isArray(r)
      ? r.flatMap((x) => {
          const item = objeto(x),
            registro = texto(item.registro);
          return item.fonte === "catalogo_publicado" && registro
            ? [{ fonte: "catalogo_publicado" as const, registro, versao: texto(item.versao) }]
            : [];
        })
      : [];
  const raizesFonte = lerRaizes(v.raizesFonte);
  if (
    v.versao !== 1 ||
    !clinicaId ||
    !sessaoId ||
    !medicoNome ||
    !referenciaProfissional ||
    !raizesFonte.length
  )
    return null;
  const mod = objeto(v.modalidade),
    nome = texto(mod.nome),
    procedimento = texto(mod.procedimento),
    raizesMod = lerRaizes(mod.raizesFonte);
  return {
    versao: 1,
    clinicaId,
    sessaoId,
    medicoId: texto(v.medicoId),
    medicoNome,
    referenciaProfissional,
    raizesFonte,
    modalidade:
      nome && procedimento && raizesMod.length
        ? { nome, procedimento, raizesFonte: raizesMod }
        : null,
  };
}

/** Registros opacos/prefixados são válidos; sobrenomes iguais não unem dois IDs. */
export function candidatosDaSelecaoContextual(
  e: Pick<EntradaSelecaoContextual, "clinicaId" | "fatosOficiais" | "agora">,
): CandidatoSelecaoContextual[] {
  const grupos = new Map<string, CandidatoSelecaoContextual>();
  const referenciasConflitantes = new Set<string>();
  const agora = Date.parse(e.agora ?? new Date().toISOString());
  for (const f of e.fatosOficiais) {
    if (
      f.fonte !== "catalogo_publicado" ||
      f.clinicaId !== e.clinicaId ||
      f.entidade !== "profissional" ||
      f.campo !== "nome"
    )
      continue;
    const registro = texto(f.registro),
      nome = texto(f.chave?.medicoNome) ?? texto(f.valor);
    if (!registro || !nome || !tokensNome(nome).length) continue;
    if (
      f.vigenteAte &&
      (!Number.isFinite(Date.parse(f.vigenteAte)) ||
        !Number.isFinite(agora) ||
        Date.parse(f.vigenteAte) < agora)
    )
      continue;
    const medicoId = texto(f.chave?.medicoId);
    const referenciaProfissional = medicoId
      ? `medico:${medicoId}`
      : `registro:${registro}:${nomeNormalizado(nome)}`;
    if (referenciasConflitantes.has(referenciaProfissional)) continue;
    const raiz: RaizSelecaoContextual = {
      fonte: "catalogo_publicado",
      registro,
      versao: texto(f.versao),
    };
    const existente = grupos.get(referenciaProfissional);
    // Um ID que agora aponta para outro nome não pode resolver uma preferência por acaso.
    if (existente && nomeNormalizado(existente.medicoNome) !== nomeNormalizado(nome)) {
      referenciasConflitantes.add(referenciaProfissional);
      grupos.delete(referenciaProfissional);
      continue;
    }
    const candidato = existente ?? {
      medicoId,
      medicoNome: nome,
      referenciaProfissional,
      raizesFonte: [],
      modalidades: [],
      unidades: [],
    };
    const unidade = texto(f.chave?.unidadeNome);
    if (unidade && !candidato.unidades.includes(unidade)) candidato.unidades.push(unidade);
    candidato.raizesFonte = juntarRaizes([...candidato.raizesFonte, raiz]);
    const procedimento = texto(f.chave?.procedimento) ?? texto(f.chave?.especialidade);
    if (procedimento) {
      const partes = procedimento
        .replace(/^consulta\s*(?:[—–:-]\s*)?/i, "")
        .split(/\s*[,;]\s*/)
        .filter(Boolean);
      for (const nomeModalidade of partes) {
        const anterior = candidato.modalidades.find(
          (m) => normalizarTexto(m.nome) === normalizarTexto(nomeModalidade),
        );
        if (anterior) anterior.raizesFonte = juntarRaizes([...anterior.raizesFonte, raiz]);
        else
          candidato.modalidades.push({ nome: nomeModalidade, procedimento, raizesFonte: [raiz] });
      }
    }
    grupos.set(referenciaProfissional, candidato);
  }
  return [...grupos.values()].sort(
    (a, b) =>
      a.medicoNome.localeCompare(b.medicoNome, "pt-BR") ||
      a.referenciaProfissional.localeCompare(b.referenciaProfissional),
  );
}

const FIM_NOME =
  /\b(?:com|para|pra|por|na|no|nas|nos|tem|atende|atendem|pode|posso|quero|prefiro|vou|amanha|hoje|segunda|terca|quarta|quinta|sexta|sabado|domingo|geral|infantil|adulto|adulta|horario|consulta|obrigado|obrigada|mesmo|sim|nao|mas|ou)\b/;
type Citacao = { tokens: string[]; inicio: number; fim: number; negada: boolean };
function negadaNoTrecho(m: string, inicio: number, fim: number): boolean {
  const antes =
    m
      .slice(0, inicio)
      .split(/[,.!?;\n]|\bmas\b/)
      .at(-1) ?? "";
  const depois = m.slice(fim);
  return /\b(?:nao|nem|nunca|sem)\b/.test(antes) || /^\s*(?:nao|nem)\b/.test(depois);
}
function citacoesMedicos(m: string, candidatos: CandidatoSelecaoContextual[]): Citacao[] {
  const primeiras = [
    ...new Set(candidatos.map((c) => tokensNome(c.medicoNome)[0]).filter(Boolean)),
  ];
  const citacoes: Citacao[] = [];
  const encontrados = m.matchAll(/\b(?:dra?|doutor|doutora)\.?\s+([a-z][a-z\s]*)/g);
  for (const match of encontrados) {
    const bruto = match[1]!
      .split(FIM_NOME)[0]!
      .split(/[,.!?;\n]/)[0]!
      .trim();
    const inicio = match.index!,
      fim = inicio + match[0].indexOf(match[1]!) + bruto.length;
    const tokens = tokensNome(bruto);
    if (tokens.length)
      citacoes.push({ tokens, inicio, fim, negada: negadaNoTrecho(m, inicio, fim) });
  }
  // Nome sem título só é candidato; o chamador ainda exige uma escolha explícita.
  for (const primeiro of primeiras) {
    for (const match of m.matchAll(new RegExp(`\\b${primeiro}\\b`, "g"))) {
      if (citacoes.some((c) => match.index! >= c.inicio && match.index! < c.fim)) continue;
      const inicio = match.index!,
        cauda = m.slice(inicio).split(/[,.!?;\n]/)[0]!;
      const depoisPrimeiro = cauda.slice(primeiro!.length).split(FIM_NOME)[0]!.trim();
      const bruto = `${primeiro} ${depoisPrimeiro}`.trim(),
        fim = inicio + bruto.length;
      citacoes.push({
        tokens: tokensNome(bruto),
        inicio,
        fim,
        negada: negadaNoTrecho(m, inicio, fim),
      });
    }
  }
  return citacoes;
}
function nomeConfere(c: CandidatoSelecaoContextual, citacao: Citacao): boolean {
  const nome = tokensNome(c.medicoNome),
    pedido = citacao.tokens;
  if (!pedido.length || pedido[0] !== nome[0]) return false;
  let ultimo = -1;
  for (const p of pedido) {
    ultimo = nome.indexOf(p, ultimo + 1);
    if (ultimo < 0) return false;
  }
  return true;
}
function citaModalidade(
  m: string,
  modalidade: ModalidadeSelecaoContextual,
): { citada: boolean; negada: boolean } {
  const nome = normalizarTexto(modalidade.nome);
  const termos = [
    nome,
    ...["infantil", "geral", "adulto", "adulta"].filter((t) => new RegExp(`\\b${t}\\b`).test(nome)),
  ];
  for (const termo of termos) {
    const inicio = m.indexOf(termo),
      fim = inicio + termo.length;
    if (inicio >= 0 && !/[a-z]/.test(m[inicio - 1] ?? "") && !/[a-z]/.test(m[fim] ?? ""))
      return { citada: true, negada: negadaNoTrecho(m, inicio, fim) };
  }
  return { citada: false, negada: false };
}
function snapshot(
  e: EntradaSelecaoContextual,
  c: CandidatoSelecaoContextual,
  modalidade: ModalidadeSelecaoContextual | null,
): SelecaoContextual {
  return {
    versao: 1,
    clinicaId: e.clinicaId,
    sessaoId: e.sessaoId,
    medicoId: c.medicoId,
    medicoNome: c.medicoNome,
    referenciaProfissional: c.referenciaProfissional,
    raizesFonte: c.raizesFonte,
    modalidade,
  };
}

export function resolverSelecaoContextual(e: EntradaSelecaoContextual): ResultadoSelecaoContextual {
  const candidatos = candidatosDaSelecaoContextual(e);
  const m = normalizarTexto(e.mensagem);
  const anteriorBruta = normalizarSelecaoContextual(e.selecaoAnterior);
  const anterior =
    anteriorBruta?.clinicaId === e.clinicaId && anteriorBruta.sessaoId === e.sessaoId
      ? anteriorBruta
      : null;
  const medicoAnterior = anterior
    ? candidatos.find(
        (c) =>
          c.referenciaProfissional === anterior.referenciaProfissional &&
          nomeNormalizado(c.medicoNome) === nomeNormalizado(anterior.medicoNome) &&
          c.raizesFonte.some((r) => anterior.raizesFonte.some((a) => a.registro === r.registro)),
      )
    : null;
  const modalidadeAnterior =
    medicoAnterior?.modalidades.find(
      (m) => normalizarTexto(m.nome) === normalizarTexto(anterior?.modalidade?.nome),
    ) ?? null;
  const anteriorValida = medicoAnterior ? snapshot(e, medicoAnterior, modalidadeAnterior) : null;
  const responder = (parte: Partial<ResultadoSelecaoContextual>): ResultadoSelecaoContextual => ({
    estado: anteriorValida ? "selecionado" : e.selecaoAnterior ? "limpo" : "sem_selecao",
    selecao: anteriorValida,
    opcoesMedicos: candidatos,
    opcoesModalidades: medicoAnterior?.modalidades ?? [],
    pergunta: null,
    motivo: anteriorValida ? "PREFERENCIA_REVALIDADA" : "SEM_PREFERENCIA_COMPROVADA",
    escolhaExplicita: false,
    turnoDeSelecao: false,
    aceiteAgendamento: false,
    ...parte,
  });
  if (!texto(e.clinicaId) || !texto(e.sessaoId))
    return responder({ estado: "limpo", selecao: null, motivo: "ESCOPO_AUSENTE" });
  if (
    e.mudancaTema ||
    /\b(?:outro assunto|mudar de assunto|esquece|deixa pra la|deixe para la)\b/.test(m)
  )
    return responder({
      estado: "limpo",
      selecao: null,
      opcoesModalidades: [],
      motivo: "MUDANCA_DE_TEMA",
    });
  const citacoes = citacoesMedicos(m, candidatos);
  const positivas = citacoes.filter((c) => !c.negada),
    negativas = citacoes.filter((c) => c.negada);
  const informacao =
    /\b(?:informacao|informacoes|saber|sobre|valor|preco|custa|horario|horarios|atende|atendem|dias|quem|qual|quais|tem|faz|realiza)\b/.test(
      m,
    );
  const nomeSozinho =
    citacoes.length === 1 &&
    tokensNome(m.replace(/^(?:o|a)\s+/, "")).join(" ") === citacoes[0]!.tokens.join(" ");
  const escolha =
    !informacao &&
    (/\b(?:vou fazer|quero|queria|gostaria|prefiro|escolho|escolhi|pode ser|vai ser|seria com|vou com)\b/.test(
      m,
    ) ||
      /^com\b/.test(m) ||
      nomeSozinho);
  const correspondentes = candidatos.filter((c) => positivas.some((p) => nomeConfere(c, p)));
  if (informacao && citacoes.length) {
    const mesmoMedico =
      medicoAnterior &&
      correspondentes.length === 1 &&
      correspondentes[0]?.referenciaProfissional === medicoAnterior.referenciaProfissional;
    return responder({
      estado:
        anteriorValida && !mesmoMedico ? "limpo" : anteriorValida ? "selecionado" : "sem_selecao",
      selecao: mesmoMedico ? anteriorValida : null,
      opcoesModalidades: mesmoMedico ? medicoAnterior.modalidades : [],
      motivo: "PEDIDO_DE_INFORMACAO_NAO_E_ESCOLHA",
    });
  }
  if (negativas.length && !positivas.length) {
    const recusouAnterior = medicoAnterior && negativas.some((p) => nomeConfere(medicoAnterior, p));
    return responder({
      estado: recusouAnterior ? "limpo" : anteriorValida ? "selecionado" : "sem_selecao",
      selecao: recusouAnterior ? null : anteriorValida,
      opcoesModalidades: recusouAnterior ? [] : (medicoAnterior?.modalidades ?? []),
      motivo: "PREFERENCIA_RECUSADA",
      turnoDeSelecao: true,
    });
  }
  let escolhido = medicoAnterior ?? null;
  if (escolha && positivas.length) {
    if (correspondentes.length !== 1)
      return responder({
        estado: "esclarecer_medico",
        selecao: null,
        opcoesMedicos: correspondentes.length ? correspondentes : candidatos,
        opcoesModalidades: [],
        pergunta: correspondentes.length
          ? perguntaIdentificacaoProfissional(
              correspondentes.map((c) => ({
                nome: c.medicoNome,
                especialidade: c.modalidades.map((m) => m.nome).join(", "),
                unidade: c.unidades.join(", "),
              })),
            )
          : "Pode informar o nome completo do profissional?",
        motivo: correspondentes.length ? "PROFISSIONAL_AMBIGUO" : "PROFISSIONAL_NAO_CONFIRMADO",
        escolhaExplicita: true,
        turnoDeSelecao: true,
      });
    escolhido = correspondentes[0]!;
  }
  if (!escolhido) return responder({});
  const modCitadas = escolhido.modalidades.map((modalidade) => ({
    modalidade,
    ...citaModalidade(m, modalidade),
  }));
  const modPositivas = modCitadas
    .filter((c) => c.citada && !c.negada)
    .filter(
      (c) =>
        !modCitadas.some(
          (outra) =>
            outra !== c &&
            outra.citada &&
            !outra.negada &&
            normalizarTexto(outra.modalidade.nome).includes(normalizarTexto(c.modalidade.nome)) &&
            normalizarTexto(outra.modalidade.nome) !== normalizarTexto(c.modalidade.nome) &&
            m.includes(normalizarTexto(outra.modalidade.nome)),
        ),
    );
  const modNegativas = modCitadas.filter((c) => c.citada && c.negada);
  const trocaMedico = escolhido.referenciaProfissional !== medicoAnterior?.referenciaProfissional;
  let modalidade = trocaMedico ? null : modalidadeAnterior;
  const escolhaModalidade = !informacao && modCitadas.some((c) => c.citada);
  if (escolhaModalidade) {
    if (modPositivas.length === 1) modalidade = modPositivas[0]!.modalidade;
    else if (
      modPositivas.length > 1 ||
      modNegativas.some((c) => c.modalidade.nome === modalidade?.nome)
    )
      modalidade = null;
  }
  if (!modalidade && escolhido.modalidades.length === 1 && !modNegativas.length)
    modalidade = escolhido.modalidades[0]!;
  const selecao = snapshot(e, escolhido, modalidade);
  const turnoDeSelecao = (escolha && positivas.length > 0) || escolhaModalidade;
  if (!modalidade && escolhido.modalidades.length > 1)
    return responder({
      estado: "esclarecer_modalidade",
      selecao,
      opcoesModalidades: escolhido.modalidades,
      pergunta: `Qual modalidade você deseja: ${escolhido.modalidades.map((m) => m.nome).join(" ou ")}?`,
      motivo: "MODALIDADE_NAO_DEFINIDA",
      escolhaExplicita: turnoDeSelecao,
      turnoDeSelecao,
    });
  return responder({
    estado: "selecionado",
    selecao,
    opcoesModalidades: escolhido.modalidades,
    motivo: turnoDeSelecao ? "PREFERENCIA_CONFIRMADA_NO_CATALOGO" : "PREFERENCIA_REVALIDADA",
    escolhaExplicita: turnoDeSelecao,
    turnoDeSelecao,
  });
}
