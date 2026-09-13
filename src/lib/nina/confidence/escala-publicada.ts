/** Escala semanal descreve atendimento habitual; nunca comprova uma vaga. */
import { normalizarHora, normalizarTexto, type ChaveFato, type FatoRecuperado } from "./evidencia";
import { referenciaDoFato, type CorrespondenciaAfirmacao } from "./afirmacao";

const DIAS = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
const RE_DIA = /\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)s?(?:-feiras?)?\b/g;
const RE_HORA = /\b\d{1,2}\s*(?::\d{2}h?|h(?:\d{2})?)\b/g;

export type HorarioSemanal = { dia: string; hora: string | null };

/** Recorrência limitada não pode ser promovida a atendimento semanal irrestrito. */
export function restricaoDaEscala(texto: string | null | undefined): string | null {
  const t = normalizarTexto(texto).replace(/[ºª°]/g, "");
  return /\b(?:[1-5]\s*(?:e\s*[1-5]\s*)?(?:sabado|domingo|segunda|terca|quarta|quinta|sexta)|primeir[ao]|segund[ao]\s+do\s+mes|terceir[ao]|quart[ao]\s+do\s+mes|ultim[ao]|quinzenal|alternad[ao]s?|somente\s+encaixe)\b/.test(
    t,
  )
    ? t
    : null;
}

/** Lê listas e intervalos: "segunda a sábado", "quartas e sextas às 13h". */
export function horariosSemanais(texto: string): HorarioSemanal[] {
  const t = normalizarTexto(texto).replace(/[*_]/g, "");
  const dias = [...t.matchAll(RE_DIA)];
  if (dias.length === 0) return [];
  const horas = [...t.matchAll(RE_HORA)];
  const pares: HorarioSemanal[] = [];
  const expandir = (grupo: RegExpMatchArray[]): string[] => {
    const valores: string[] = [];
    for (let i = 0; i < grupo.length; i++) {
      const atual = grupo[i]!;
      valores.push(atual[1]!);
      const seguinte = grupo[i + 1];
      if (!seguinte) continue;
      const entre = t.slice(atual.index! + atual[0].length, seguinte.index).trim();
      if (!/^(?:a|ate|-)$/.test(entre)) continue;
      let dia = (DIAS.indexOf(atual[1]!) + 1) % 7;
      while (dia !== DIAS.indexOf(seguinte[1]!)) {
        valores.push(DIAS[dia]!);
        dia = (dia + 1) % 7;
      }
    }
    return [...new Set(valores)];
  };
  if (horas.length === 0) return expandir(dias).map((dia) => ({ dia, hora: null }));
  let fimAnterior = 0;
  let diasAnteriores: string[] = [];
  for (const hora of horas) {
    const grupo = dias.filter((d) => d.index! >= fimAnterior && d.index! < hora.index!);
    const doHorario = grupo.length ? expandir(grupo) : diasAnteriores;
    for (const dia of doHorario) pares.push({ dia, hora: normalizarHora(hora[0]) });
    diasAnteriores = doHorario;
    fimAnterior = hora.index! + hora[0].length;
  }
  // Dias sem hora não herdam o horário de outro grupo.
  for (const dia of expandir(dias.filter((d) => d.index! >= fimAnterior))) {
    pares.push({ dia, hora: null });
  }
  return pares;
}

/** Data específica ou afirmação de vaga exige evidência da agenda. */
export function afirmaDisponibilidade(texto: string): boolean {
  const t = normalizarTexto(texto);
  return (
    /\b(vagas?|disponibilidade|disponiveis|disponivel|livres?|encaixes?)\b/.test(t) ||
    /\b(?:temos|tem|ha)\s+horarios?\b(?!\s+habituais?\b)/.test(t) ||
    /\b(hoje|amanha)\b|\b(?:nesta|neste|proxim[ao])\s+(?:segunda|terca|quarta|quinta|sexta|sabado|domingo|dia|semana)\b/.test(
      t,
    ) ||
    /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b|\b\d{4}-\d{2}-\d{2}\b/.test(t) ||
    /\b(?:pode|posso|podemos)\s+(?:vir|agendar|marcar|reservar)\b/.test(t)
  );
}

function mesmoMedico(afirmado: string, fonte: string | null | undefined): boolean {
  const limpar = (v: string) =>
    normalizarTexto(v)
      .replace(/\b(?:dra?|doutora?)\.?\s*/g, "")
      .trim();
  const a = limpar(afirmado);
  const b = limpar(fonte ?? "");
  // Um resumo com vários nomes não identifica de quem é cada horário.
  if (!a || !b || /[,;|]/.test(b)) return false;
  return a === b || ` ${b} `.includes(` ${a} `);
}

export function compararEscalaPublicada(
  fatos: FatoRecuperado[],
  chave: ChaveFato,
  frase: string,
): CorrespondenciaAfirmacao {
  const escalas = fatos.filter(
    (f) =>
      f.entidade === "escala" &&
      ["dia_atendimento", "funcionamento"].includes(f.campo) &&
      ["catalogo_publicado", "agenda"].includes(f.fonte),
  );
  if (!escalas.length) return { situacao: "sem_fato" };
  const pedidas = chave.data
    ? [{ dia: normalizarTexto(chave.data), hora: normalizarHora(chave.hora) }]
    : horariosSemanais(frase);
  if (!pedidas.length)
    return {
      situacao: "indeterminado",
      motivo: "não foi possível identificar o dia da escala afirmada",
    };
  const noEscopo = escalas.filter((f) => {
    // Prefira as associações detalhadas do mesmo registro ao resumo combinado.
    if (
      !f.chave?.data &&
      f.registro &&
      escalas.some((outro) => outro.registro === f.registro && outro.chave?.data)
    )
      return false;
    if (chave.medicoNome && !mesmoMedico(chave.medicoNome, f.chave?.medicoNome)) return false;
    if (chave.medicoId && chave.medicoId !== f.chave?.medicoId) return false;
    if (chave.unidadeId && normalizarTexto(chave.unidadeId) !== normalizarTexto(f.chave?.unidadeId))
      return false;
    return true;
  });
  if (!noEscopo.length)
    return {
      situacao: "fora_do_escopo",
      motivo: "a escala recuperada não identifica o mesmo profissional/unidade",
    };
  const referencias: FatoRecuperado[] = [];
  for (const pedida of pedidas) {
    const confirmado = noEscopo.find((f) => {
      const condicao = restricaoDaEscala(f.chave?.condicoes) ?? restricaoDaEscala(f.valor);
      if (condicao && !normalizarTexto(frase).replace(/[ºª°]/g, "").includes(condicao))
        return false;
      const pares = horariosSemanais(
        `${f.chave?.data ?? ""} ${f.valor ?? ""} ${f.chave?.hora ?? ""}`,
      );
      return pares.some((p) => p.dia === pedida.dia && (!pedida.hora || p.hora === pedida.hora));
    });
    if (!confirmado) {
      const f = noEscopo[0]!;
      return {
        situacao: "divergente",
        fato: f,
        referencia: referenciaDoFato(f),
        valorDaFonte: f.valor,
      };
    }
    referencias.push(confirmado);
  }
  const fato = referencias[0]!;
  return { situacao: "confirmado", fato, referencia: referenciaDoFato(fato) };
}

/** Cada item enumerado é uma afirmação independente, inclusive nomes desconhecidos. */
export function itensDeOferta(trecho: string): string[] {
  const t = trecho.replace(/[*_]/g, "").trim();
  const exemplo = t.match(/\bcomo\s+(.+?)(?:\)|$)/i)?.[1];
  const corpo = (
    exemplo ??
    t.replace(
      /^(?:(?:realizamos|fazemos|oferecemos|temos)\s+(?:o\s+|a\s+)?(?:exames?|procedimentos?|consultas?|atendimento)|atendemos)\s*(?:em|de|:)?\s*/i,
      "",
    )
  )
    // Um cabeçalho de lista descreve a apresentação dos profissionais, não
    // altera o nome do serviço. Só removemos esse sufixo completo; nomes,
    // condições ou outros serviços que venham depois continuam verificáveis.
    .replace(
      /\s+com\s+(?:(?:os|as)\s+)?(?:seguintes\s+)?(?:profissionais|m[ée]dicos|m[ée]dicas|especialistas)\s*:?\s*$/i,
      "",
    )
    .replace(
      /\s+(?:na|no|em\s+nossa|em\s+nosso)\s+(?:cl[ií]nica|policl[ií]nica|hospital|unidade)\b.*$/i,
      "",
    );
  if (
    !corpo ||
    corpo === t ||
    /^(?:esse|este|esse exame|este exame|aqui|cardiologicos?|cardiológicos?)$/i.test(corpo)
  )
    return [];
  return corpo
    .split(/,\s*|\s+(?:e|ou)\s+/i)
    .map((p) => p.replace(/[().!?]+$/g, "").trim())
    .filter(Boolean);
}

export function compararOferta(
  fatos: FatoRecuperado[],
  item: string,
  chave?: ChaveFato,
): CorrespondenciaAfirmacao {
  const limpar = (v: string) =>
    normalizarTexto(v)
      .replace(/^\s*(?:consulta|exame|procedimento)\s*(?:de|em|[-—–])?\s*/g, "")
      .replace(/\s+24\s*h(?:oras)?\b/g, "")
      .trim();
  const alvo = limpar(item);
  const elegiveis = fatos.filter(
    (f) =>
      f.fonte === "catalogo_publicado" &&
      ["procedimento", "servico"].includes(f.entidade) &&
      ["nome", "oferecido"].includes(f.campo),
  );
  const fato = elegiveis.find(
    (f) =>
      alvo &&
      limpar(f.valor ?? "") === alvo &&
      (!chave?.unidadeId ||
        normalizarTexto(f.chave?.unidadeId) === normalizarTexto(chave.unidadeId)) &&
      (!chave?.medicoNome || mesmoMedico(chave.medicoNome, f.chave?.medicoNome)),
  );
  if (fato) return { situacao: "confirmado", fato, referencia: referenciaDoFato(fato) };
  return elegiveis.length
    ? {
        situacao: "fora_do_escopo",
        motivo: `o procedimento "${item}" não consta entre os itens recuperados da base publicada`,
      }
    : { situacao: "sem_fato" };
}
