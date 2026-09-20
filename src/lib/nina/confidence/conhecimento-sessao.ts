/** Guarda referências de pesquisa, nunca copia fatos antigos para a próxima avaliação. */
import { ehSaudacaoPura } from "./turno-tipo";
import { normalizarTexto, type FatoRecuperado } from "./evidencia";
import { lerEscolhaHorario } from "../agendamento-escolha";
import { prepararBuscaCatalogo } from "../catalogo-busca";
import type { ResultadoConhecimento } from "../knowledge-contract";

export type ReferenciaConhecimento = {
  registro: string;
  versao: string | null;
  procedimento: string | null;
  medicoNome: string | null;
};
export type ConhecimentoSessao = {
  versao: 1;
  clinicaId: string;
  sessionId: string;
  consulta: { termo: string; medico?: string; dia?: string };
  referencias: ReferenciaConhecimento[];
  /** Preferência conversacional; sempre revalidada contra o catálogo do turno. */
  selecao?: unknown;
  /** Referência ao aceite de leitura da agenda; revalidada com mensagens entregues. */
  interesseAgenda?: unknown;
  /** Somente opções de identificação, sem preço ou vaga; reconsultadas após a resposta. */
  esclarecimento?: ResultadoConhecimento["esclarecimento"];
};

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export function normalizarConhecimentoSessao(v: unknown): ConhecimentoSessao | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.versao !== 1 || !texto(o.clinicaId, 80) || !texto(o.sessionId, 80)) return null;
  const q = o.consulta as Record<string, unknown> | undefined;
  if (!q || texto(q.termo, 200).length < 2 || !Array.isArray(o.referencias)) return null;
  const referencias = o.referencias.slice(0, 40).flatMap((r: unknown) => {
    if (!r || typeof r !== "object") return [];
    const f = r as Record<string, unknown>;
    const registro = texto(f.registro, 180);
    return registro
      ? [
          {
            registro,
            versao: texto(f.versao, 100) || null,
            procedimento: texto(f.procedimento, 200) || null,
            medicoNome: texto(f.medicoNome, 160) || null,
          },
        ]
      : [];
  });
  const bruto = o.esclarecimento as Record<string, unknown> | undefined;
  const esclarecer =
    bruto &&
    ["procedimento", "profissional", "sigla"].includes(String(bruto.tipo)) &&
    Array.isArray(bruto.opcoes)
      ? {
          tipo: bruto.tipo as NonNullable<ResultadoConhecimento["esclarecimento"]>["tipo"],
          pergunta: texto(bruto.pergunta, 1600),
          opcoes: bruto.opcoes.slice(0, 12).flatMap((v: unknown) => {
            if (!v || typeof v !== "object") return [];
            const p = v as Record<string, unknown>,
              id = texto(p.id, 180),
              nome = texto(p.nome, 200);
            return id && nome && referencias.some((r) => r.registro === id)
              ? [
                  {
                    id,
                    nome,
                    especialidade: texto(p.especialidade, 200),
                    unidade: texto(p.unidade, 160) || null,
                  },
                ]
              : [];
          }),
        }
      : undefined;
  if (!referencias.length && !esclarecer?.pergunta) return null;
  return {
    versao: 1,
    clinicaId: texto(o.clinicaId, 80),
    sessionId: texto(o.sessionId, 80),
    consulta: {
      termo: texto(q.termo, 200),
      ...(texto(q.medico, 160) ? { medico: texto(q.medico, 160) } : {}),
      ...(texto(q.dia, 40) ? { dia: texto(q.dia, 40) } : {}),
    },
    referencias,
    ...(esclarecer ? { esclarecimento: esclarecer } : {}),
    ...(o.selecao && typeof o.selecao === "object" ? { selecao: o.selecao } : {}),
    ...(o.interesseAgenda && typeof o.interesseAgenda === "object"
      ? { interesseAgenda: o.interesseAgenda }
      : {}),
  };
}

export function conhecimentoDaMesmaSessao(
  v: unknown,
  clinicaId: string,
  sessionId: string | null,
): ConhecimentoSessao | null {
  const c = normalizarConhecimentoSessao(v);
  return c && c.clinicaId === clinicaId && c.sessionId === sessionId ? c : null;
}

/** Termos de continuidade não são evidência: servem exclusivamente à nova pesquisa. */
export function consultaDoNovoTurno(e: {
  mensagem: string;
  anterior: ConhecimentoSessao | null;
  dispensarConsulta?: boolean;
}): { args: ConhecimentoSessao["consulta"]; continuidade: boolean } | null {
  if (e.dispensarConsulta || ehSaudacaoPura(e.mensagem)) return null;
  if (e.anterior && !e.anterior.esclarecimento && lerEscolhaHorario(e.mensagem)) {
    return {
      args: {
        termo: e.anterior.consulta.termo,
        ...(e.anterior.consulta.medico ? { medico: e.anterior.consulta.medico } : {}),
      },
      continuidade: true,
    };
  }
  const m = normalizarTexto(e.mensagem)
    .replace(/[?!.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!m || /^(?:obrigad[oa]|valeu|tchau|ate mais|ok obrigado|ok obrigada)$/.test(m)) return null;
  const pendente = e.anterior?.esclarecimento;
  if (pendente?.opcoes.length) {
    // Uma resposta curta só retoma uma opção que está identificada na pergunta
    // anterior. Negação, ordinal e mudanças de assunto ficam para o modelo.
    const nomes = pendente.opcoes.map((p) =>
      [p.nome, p.especialidade, p.unidade].filter(Boolean).join(" "),
    );
    const busca = prepararBuscaCatalogo(e.mensagem, nomes);
    const matches = pendente.opcoes.filter(
      (p) => busca.pontuar(p.nome, [p.especialidade, p.unidade].filter(Boolean).join(" ")) > 0,
    );
    const confirmacao =
      /^(?:(?:sim|s|ss|isso|esse|essa|ele|ela|e|mesmo|mesma|correto|correta|pode|ser|ok|certo|por|favor)\s*)+$/.test(
        m,
      );
    const confirmacaoUnica = pendente.opcoes.length === 1 && confirmacao;
    const ordinal =
      /^(?:o|a)?\s*(primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|quint[oa]|sext[oa]|[1-6])(?:\s+(?:opcao|profissional|exame))?$/.exec(
        m,
      )?.[1];
    const posicao = ordinal
      ? /^[1-6]$/.test(ordinal)
        ? Number(ordinal) - 1
        : ["primeir", "segund", "terceir", "quart", "quint", "sext"].findIndex((p) =>
            ordinal.startsWith(p),
          )
      : -1;
    const escolha =
      posicao >= 0
        ? pendente.opcoes[posicao]
        : confirmacaoUnica
          ? pendente.opcoes[0]
          : matches.length === 1
            ? matches[0]
            : null;
    if (escolha && !/\b(?:nao|nem|outro|outra|trocar|mudar)\b/.test(m) && !busca.ajustes.length)
      return {
        args:
          pendente.tipo === "profissional"
            ? { termo: escolha.especialidade || escolha.nome, medico: escolha.id }
            : { termo: escolha.nome },
        continuidade: true,
      };
    // "sim" a uma pergunta com várias opções continua sendo ambíguo.
    if (confirmacao) return { args: e.anterior!.consulta, continuidade: true };
  }
  // Só respostas curtas sem novo assunto explícito herdam a pesquisa. Um
  // procedimento diferente escrito pelo paciente inicia uma consulta própria.
  // Cortesias não mudam o assunto: "sim, por favor" continua a oferta anterior.
  // Isso apenas escolhe os termos da releitura; não autoriza consultar ou reservar.
  const restante = m
    .replace(/\b(?:por favor|por gentileza|faz favor|se possivel)\b/g, " ")
    .replace(
      /\b(?:e|o|a|os|as|um|uma|de|do|da|dos|das|no|na|nos|nas|em|para|pra|por|com|ele|ela|esse|essa|este|esta|mesmo|mesma|atendimento|consulta|consultas|tipo|modalidade|que|qual|quais|se|sim|isso|claro|ok|okay|certo|nao|pode|podem|poderia|quero|queria|gostaria|vou|fazer|prefiro|ser|sera|seria|melhor|ver|verificar|consultar|agendar|marcar|remarcar|saber|aceita|aceitam|aceito|pagamento|pagar|pix|dinheiro|cartao|credito|debito|cheque|parcelado|avista|valor|valores|preco|precos|custa|custo|quanto|horario|horarios|dia|dias|data|datas|vagas|vaga|disponibilidade|disponivel|disponiveis|agenda|manha|tarde|noite|hoje|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo|feira|semana|proxima|proximo|adulto|adulta|infantil|geral|crianca|anos|ano|mes|meses)\b/g,
      "",
    )
    .replace(/[\d\s/-]/g, "");
  if (e.anterior && !restante) {
    // Um filtro de dia do turno anterior não pode esconder os demais dias.
    return {
      args: {
        termo: e.anterior.consulta.termo,
        ...(e.anterior.consulta.medico ? { medico: e.anterior.consulta.medico } : {}),
      },
      continuidade: true,
    };
  }
  return { args: { termo: e.mensagem.trim().slice(0, 200) }, continuidade: false };
}

export function lembrarConsultaComprovada(e: {
  clinicaId: string;
  sessionId: string | null;
  args: ConhecimentoSessao["consulta"];
  fatos: FatoRecuperado[];
  anterior?: ConhecimentoSessao | null;
  esclarecimento?: ResultadoConhecimento["esclarecimento"];
}): ConhecimentoSessao | null {
  if (!e.sessionId) return null;
  const porRegistro = new Map<string, ReferenciaConhecimento>();
  for (const f of e.fatos) {
    if (f.fonte !== "catalogo_publicado" || f.clinicaId !== e.clinicaId || !f.registro) continue;
    const id = `${f.registro}|${f.chave?.procedimento ?? ""}|${f.chave?.medicoNome ?? ""}`;
    porRegistro.set(id, {
      registro: f.registro,
      versao: f.versao ?? null,
      procedimento: f.chave?.procedimento ?? null,
      medicoNome: f.chave?.medicoNome ?? null,
    });
  }
  const referencias = [...porRegistro.values()].slice(0, 40);
  if (!referencias.length && !e.esclarecimento) return null;
  return {
    versao: 1,
    clinicaId: e.clinicaId,
    sessionId: e.sessionId,
    consulta: e.args,
    referencias,
    ...(e.esclarecimento ? { esclarecimento: e.esclarecimento } : {}),
    ...(e.anterior?.selecao ? { selecao: e.anterior.selecao } : {}),
    ...(e.anterior?.interesseAgenda ? { interesseAgenda: e.anterior.interesseAgenda } : {}),
  };
}

export function compararReferenciasConhecimento(
  antigas: ReferenciaConhecimento[],
  atuais: ReferenciaConhecimento[],
) {
  const atuaisPorId = new Map(atuais.map((r) => [r.registro, r.versao]));
  const antigasPorId = new Map(antigas.map((r) => [r.registro, r.versao]));
  return {
    reconsultadas: [...atuaisPorId.keys()],
    alteradas: [...antigasPorId]
      .filter(([id, versao]) => atuaisPorId.has(id) && atuaisPorId.get(id) !== versao)
      .map(([id]) => id),
    naoRecuperadas: [...antigasPorId.keys()].filter((id) => !atuaisPorId.has(id)),
  };
}
