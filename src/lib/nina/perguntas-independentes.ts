import type { ConhecimentoSessao } from "./confidence/conhecimento-sessao";
import { apresentarPerguntaEsclarecimento } from "./esclarecimento-apresentacao";
import type { ResultadoBroker } from "./tool-broker";
import type { RegistroConhecimento, ResultadoConhecimento } from "./knowledge-contract";
import { sugerirResultadoJev } from "./identificacao-catalogo";
import { confirmacaoDaEscolha } from "./agendamento-escolha";
import type { EstadoFluxoNina } from "./fluxo-estado-normalizar";
import type { ConfirmacaoIdentificacao } from "./confirmacao-identificacao";
import { preservarFinalidadeVacina, pendenciaAntigaDaVacina } from "./finalidade-vacina";

const normal = (v: unknown) =>
  typeof v === "string"
    ? v
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()
    : "";
export function parametrosPesquisa(args: unknown): Record<string, unknown> {
  try {
    const p = typeof args === "string" ? JSON.parse(args) : args;
    return p && typeof p === "object" && !Array.isArray(p) ? p : {};
  } catch {
    return {};
  }
}
const consulta = (p: Record<string, unknown>) => ({
  termo: String(p.termo ?? p.especialidade ?? p.nome ?? ""),
  medico: String(p.medico ?? p.nome ?? ""),
});
const chave = (q: { termo: string; medico?: string }) => normal(q.termo) + "|" + normal(q.medico);
/** Assunto da pesquisa sem o prefixo "consulta": "CONSULTA ODONTOLOGIA" e "odontologia" coincidem. */
const assunto = (termo: string) =>
  normal(termo)
    .replace(/^consultas?\s+(?:(?:de|da|do|com)\s+)?/, "")
    .trim();
export const PESQUISAS_INDEPENDENTES = new Set([
  "consultar_cadastro",
  "buscar_medicos",
  "buscar_procedimentos",
  "listar_especialidades",
]);

/** Só libera a escolha já validada e inequívoca. IDs de catálogo distintos
 * comprovam que a pendência pertence a outro pedido; ausência de prova bloqueia.
 * Isso não autoriza reserva: o executor ainda exige paciente, aceite e vaga. */
export function pendenciaBloqueiaFerramenta(
  nome: string,
  args: unknown,
  pendentes: readonly ConhecimentoSessao[],
  estado: EstadoFluxoNina,
  clinicaId: string,
): boolean {
  if (!pendentes.length || PESQUISAS_INDEPENDENTES.has(nome)) return false;
  if (
    ![
      "agendar",
      "verificar_horario",
      "selecionar_horario",
      "consultar_cadastro_paciente",
      "identificar_paciente",
    ].includes(nome)
  )
    return true;
  const c = confirmacaoDaEscolha(estado, clinicaId),
    p = parametrosPesquisa(args);
  if (!c?.vaga.catalogo_id) return true;
  const v = c.vaga;
  if (
    (p.medico_id != null && p.medico_id !== v.medico_id) ||
    (p.procedimento != null && normal(p.procedimento) !== normal(v.procedimento)) ||
    (p.data != null && p.data !== v.data) ||
    (p.hora != null && p.hora !== v.hora) ||
    (p.inicio != null && Date.parse(String(p.inicio)) !== Date.parse(v.inicio)) ||
    (p.fim != null && Date.parse(String(p.fim)) !== Date.parse(v.fim))
  )
    return true;
  return pendentes.some((q) => {
    if (
      q.clinicaId !== clinicaId ||
      q.sessionId !== estado.session_id ||
      normal(q.consulta.termo) === normal(v.procedimento)
    )
      return true;
    const ids = [
      ...q.referencias.map((r) => r.registro),
      ...(q.esclarecimento?.opcoes.map((o) => o.id) ?? []),
    ].filter(Boolean);
    return !ids.length || ids.includes(v.catalogo_id!);
  });
}

/** Uma dúvida pertence à pergunta pesquisada, não ao conjunto da mensagem. */
export function criarPerguntasDoTurno(
  anterior: ConhecimentoSessao | null,
  mensagem = "",
  aceites: readonly ConfirmacaoIdentificacao[] = [],
) {
  const anteriores = anterior?.pendenciasIdentificacao?.length
    ? anterior.pendenciasIdentificacao
    : anterior
      ? [anterior]
      : [];
  const pendentes = new Map(
    anteriores.filter((p) => p.esclarecimento).map((p) => [chave(p.consulta), p]),
  );
  const pesquisas = new Set<string>();
  const confirmadas = new Set<string>();
  const tiposConfirmados = new Map<string, string>();
  const identificadas = new Map<string, ConhecimentoSessao>();
  // Apenas pesquisas deste turno. Nunca contam como nova resposta do paciente.
  const aliases = new Map<string, string>();
  const consultas = new Map<string, ReturnType<typeof consulta>>();
  function grupo(p: Record<string, unknown>) {
    const q = consulta(p),
      k = chave(q);
    if (p.nova_solicitacao !== true && typeof p.reformula_de === "string") {
      const candidatos = [...consultas.entries()].filter(
        ([, a]) =>
          normal(a.termo) === normal(p.reformula_de) && normal(a.medico) === normal(q.medico),
      );
      const raizes = [...new Set(candidatos.map(([id]) => aliases.get(id) ?? id))];
      if (raizes.length === 1) return raizes[0]!;
    }
    return aliases.get(k) ?? k;
  }
  // Pendências de exame/procedimento abertas NESTE turno (não respostas do paciente).
  const pendentesDoTurno = new Set<string>();
  // Assuntos confirmados como consulta neste turno ("odontologia", "fonoaudiologia").
  const consultasConfirmadas = new Set<string>();
  /**
   * Regra confirmada (06/10/2026, opção B): com um exame/procedimento ainda
   * ambíguo, a Nina não escolhe a variante pelo paciente. Uma busca nova,
   * no mesmo turno, que confirma uma das opções da dúvida não libera preço
   * nem detalhes; a dúvida continua sendo perguntada. Se o paciente escreveu
   * o nome dessa opção, a escolha é dele e a busca vale normalmente.
   */
  function escolhaPresumida(k: string, resultado: ResultadoBroker): ResultadoBroker | null {
    // consultar_cadastro devolve records/procedure/price; buscar_procedimentos,
    // registros/procedimento/preco. Os dois formatos chegam aqui.
    const dados = resultado.dados as
      | (ResultadoConhecimento & { registros?: RegistroConhecimento[] })
      | null;
    const registros = dados?.records?.length
      ? dados.records
      : Array.isArray(dados?.registros)
        ? dados.registros
        : [];
    if (
      !dados ||
      dados.esclarecimento ||
      dados.knowledge_status === "conflict" ||
      !registros.length
    )
      return null;
    const textoPaciente = compacto(mensagem);
    for (const [chavePendente, pendencia] of pendentes) {
      if (chavePendente === k || !pendentesDoTurno.has(chavePendente)) continue;
      const esclarecimento = pendencia.esclarecimento;
      if (
        pendencia.consulta.tipo_atendimento !== "exame_procedimento" ||
        !esclarecimento?.opcoes.length
      )
        continue;
      const ids = new Set(esclarecimento.opcoes.map((o) => o.id));
      const nomes = new Set(esclarecimento.opcoes.map((o) => compacto(o.nome)));
      const escolhidos = registros.filter(
        (r) => (r.id && ids.has(r.id)) || (r.procedimento && nomes.has(compacto(r.procedimento))),
      );
      if (!escolhidos.length) continue;
      if (
        escolhidos.some((r) => r.procedimento && textoPaciente.includes(compacto(r.procedimento)))
      )
        continue;
      return {
        ...resultado,
        dados: {
          ...dados,
          found: false,
          procedure: null,
          price: null,
          records: [],
          registros: [],
          procedimento: null,
          preco: null,
          observacoes: null,
          esclarecimento,
          instrucao: `Este registro é uma das opções que o paciente ainda não escolheu para o pedido “${pendencia.consulta.termo}”. Não informe preço, profissional, horários nem detalhes de uma opção específica; pergunte qual opção corresponde ao pedido.`,
        },
      };
    }
    return null;
  }
  function referencia(args: unknown) {
    const p = parametrosPesquisa(args),
      q = consulta(p);
    const correcaoExplicita =
      pesquisas.size === 0 &&
      anteriores.length === 1 &&
      /^nao[,\s]+(?:e |quis dizer )/.test(normal(mensagem));
    if (p.nova_solicitacao === true && !correcaoExplicita) return null;
    const aceitas = aceites.filter(
      (a) =>
        normal(a.opcao.nome) === normal(q.termo) &&
        normal(a.anterior.consulta.medico) === normal(q.medico) &&
        (!p.tipo_atendimento || p.tipo_atendimento === a.anterior.consulta.tipo_atendimento),
    );
    if (aceitas.length === 1) return aceitas[0]!.anterior;
    const exata = anteriores.find((a) => chave(a.consulta) === chave(q));
    if (exata) return exata;
    const mesmoAtendimento = anteriores.filter((a) => normal(a.consulta.termo) === normal(q.termo));
    if (mesmoAtendimento.length === 1) return mesmoAtendimento[0]!;
    if (anteriores.length !== 1 || pesquisas.size > 0) return null;
    const a = anteriores[0]!;
    // Outro par especialidade/profissional não é a resposta à dúvida anterior.
    if (
      q.medico &&
      a.consulta.medico &&
      normal(q.medico) !== normal(a.consulta.medico) &&
      normal(q.termo) !== normal(a.consulta.termo)
    )
      return null;
    return a;
  }
  return {
    referencia,
    prepararContinuidade(ferramenta: string, args: string | undefined): string | undefined {
      const finalidade = preservarFinalidadeVacina(ferramenta, args, mensagem);
      if (finalidade !== args) return finalidade;
      if (!["consultar_cadastro", "buscar_procedimentos"].includes(ferramenta)) return args;
      const p = parametrosPesquisa(args);
      if (p.nova_solicitacao === true) return args;
      const k = grupo(p),
        identificada = identificadas.get(k);
      if (
        !identificada ||
        (p.tipo_atendimento && p.tipo_atendimento !== identificada.consulta.tipo_atendimento)
      )
        return args;
      // Só um registro identificado neste turno. Nunca unir exames por semelhança
      // nem reutilizar preço/preparo: a ferramenta relê o catálogo normalmente.
      if (identificada.referencias.length !== 1) return args;
      const nome = identificada.referencias[0]?.procedimento;
      if (!nome) return args;
      const id = chave(consulta(p));
      aliases.set(id, k);
      consultas.set(id, consulta(p));
      const preparado = {
        ...p,
        termo: nome,
        ...(identificada.consulta.tipo_atendimento
          ? { tipo_atendimento: identificada.consulta.tipo_atendimento }
          : {}),
      };
      aliases.set(chave(consulta(preparado)), k);
      return JSON.stringify(preparado);
    },
    reconciliar(args: unknown, resultado: ResultadoBroker, ferramenta?: string): ResultadoBroker {
      if (
        !resultado.success ||
        resultado.erro ||
        !["searchKnowledgeBase", "listCatalog"].includes(resultado.capacidade ?? "")
      )
        return resultado;
      const limitacao = (resultado.dados as ResultadoConhecimento | null)?.limitacao_catalogo;
      if (limitacao) {
        // Limpeza de pendências antigas incorretas desse pedido, sem afetar DNA etc.
        for (const [id, pendencia] of pendentes) {
          if (pendenciaAntigaDaVacina(pendencia.consulta.termo, mensagem || limitacao.pedido))
            pendentes.delete(id);
        }
        return resultado;
      }
      const p = parametrosPesquisa(args),
        k = grupo(p);
      const origem = referencia(args),
        aceite = aceites.find((a) => a.anterior === origem);
      if (aceite) {
        const dados = resultado.dados as ResultadoConhecimento | null;
        if (
          dados?.knowledge_status === "found" &&
          !dados.esclarecimento &&
          !dados.records?.some((r) => r.id === aceite.opcao.id)
        ) {
          return {
            ...resultado,
            dados: {
              ...dados,
              found: false,
              procedure: null,
              price: null,
              records: [],
              esclarecimento: origem!.esclarecimento,
              instrucao:
                "A releitura não recuperou o registro confirmado. Não substitua por outro exame nem informe seus fatos.",
            },
          };
        }
      }
      const presumida = escolhaPresumida(k, resultado);
      if (presumida) return presumida;
      const anteriorDoTurno = [...aliases.values()].includes(k) ? pendentes.get(k) : null;
      if (!anteriorDoTurno?.esclarecimento) return resultado;
      const dados = resultado.dados as ResultadoConhecimento | null;
      if (!dados || dados.knowledge_status === "conflict") return resultado;
      // Consulta (inclusive buscar_medicos) e exame/procedimento são pedidos
      // diferentes: os profissionais da especialidade não viram uma pergunta
      // sobre o nome do pedido médico (homologação 06/10/2026, dentista/fono).
      const tipoAtual =
        dados.tipo_atendimento ??
        p.tipo_atendimento ??
        (ferramenta === "buscar_medicos"
          ? "consulta"
          : ferramenta === "buscar_procedimentos"
            ? "exame_procedimento"
            : null);
      const tipoAnterior = anteriorDoTurno.consulta.tipo_atendimento;
      if (tipoAtual && tipoAnterior && tipoAtual !== tipoAnterior) return resultado;
      if (dados.esclarecimento && chave(consulta(p)) === k) return resultado;
      // Encontrar o título reformulado não comprova os qualificadores do pedido original.
      const hipotese =
        dados.esclarecimento || !Array.isArray(dados.records) ? dados : sugerirResultadoJev(dados);
      const esclarecimento = hipotese.esclarecimento ?? anteriorDoTurno.esclarecimento;
      const nomes = [
        ...new Map(
          esclarecimento.opcoes.map((o) => [normal(o.nome).replace(/[^a-z0-9]/g, ""), o.nome]),
        ).values(),
      ];
      const pedido = anteriorDoTurno.consulta.termo;
      const referenciaPedido =
        anteriorDoTurno.consulta.tipo_atendimento === "exame_procedimento"
          ? "pedido médico"
          : "atendimento solicitado";
      const pergunta = nomes.length
        ? `Para o pedido “${pedido}”, pode conferir qual nome corresponde ao ${referenciaPedido}?\n${nomes.join("\n")}`
        : `Para o pedido “${pedido}”, pode conferir e escrever o nome completo do ${referenciaPedido}?`;
      return {
        ...resultado,
        dados: {
          ...hipotese,
          procedure: null,
          price: null,
          esclarecimento: { ...esclarecimento, pergunta },
          instrucao:
            "Reformulação do mesmo pedido, ainda sem correspondência confirmada. Esta pergunta substitui as anteriores deste pedido. Não informe preço nem presuma equivalência clínica.",
        },
      };
    },
    registrar(
      args: unknown,
      atual: ConhecimentoSessao | null,
      origem: ConhecimentoSessao | null,
      confirmado: boolean,
    ) {
      const p = parametrosPesquisa(args),
        q = consulta(p),
        id = chave(q),
        k = grupo(p);
      const aceite = aceites.find((a) => a.anterior === origem);
      // Falha técnica não resolve a pendência nem reaproveita fatos do turno anterior.
      if (
        aceite &&
        !atual?.esclarecimento &&
        (!confirmado || !atual?.referencias.some((r) => r.registro === aceite.opcao.id))
      )
        return;
      const anteriorDoTurno = pendentes.get(k);
      aliases.set(id, k);
      consultas.set(id, q);
      pesquisas.add(id);
      if (origem) pendentes.delete(chave(origem.consulta));
      // O mesmo assunto já foi confirmado neste turno como outro tipo de
      // atendimento (ex.: consulta de fonoaudiologia): a ambiguidade da busca
      // de procedimentos com o mesmo nome não vira pergunta (06/10/2026).
      const tipoConfirmado = tiposConfirmados.get(k);
      const tipoAtual = atual?.consulta.tipo_atendimento;
      if (atual?.esclarecimento && tipoConfirmado && tipoAtual && tipoConfirmado !== tipoAtual)
        return;
      // "CONSULTA ODONTOLOGIA" pesquisada como procedimento é o mesmo assunto
      // da consulta de odontologia já confirmada no turno.
      if (
        atual?.esclarecimento &&
        tipoAtual === "exame_procedimento" &&
        consultasConfirmadas.has(assunto(q.termo))
      )
        return;
      if (atual?.esclarecimento) {
        confirmadas.delete(k);
        identificadas.delete(k);
        pendentes.set(
          k,
          anteriorDoTurno ? { ...atual, consulta: anteriorDoTurno.consulta } : atual,
        );
        pendentesDoTurno.add(k);
      } else {
        pendentes.delete(k);
        if (confirmado) confirmadas.add(k);
        if (confirmado && atual?.consulta.tipo_atendimento)
          tiposConfirmados.set(k, atual.consulta.tipo_atendimento);
        if (confirmado && atual) identificadas.set(k, atual);
        else identificadas.delete(k);
        if (confirmado && atual?.consulta.tipo_atendimento === "consulta") {
          const assuntoConfirmado = assunto(q.termo);
          consultasConfirmadas.add(assuntoConfirmado);
          // Dúvida de procedimento deste turno com o mesmo assunto fica respondida pela consulta.
          for (const [chavePendente, pendencia] of pendentes) {
            if (
              pendentesDoTurno.has(chavePendente) &&
              pendencia.consulta.tipo_atendimento === "exame_procedimento" &&
              assunto(pendencia.consulta.termo) === assuntoConfirmado
            )
              pendentes.delete(chavePendente);
          }
        }
      }
    },
    get pendentes() {
      return [...pendentes.values()];
    },
    get temConfirmadas() {
      return confirmadas.size > 0;
    },
    estado(atual: ConhecimentoSessao | null): ConhecimentoSessao | null {
      const lista = [...pendentes.values()];
      if (!lista.length) return atual;
      if (lista.length === 1) return { ...lista[0]!, pendenciasIdentificacao: undefined };
      // Um "sim" sem identificar a pergunta não confirma múltiplos candidatos.
      return {
        ...lista[0]!,
        pendenciasIdentificacao: lista.map((p) => ({ ...p, pendenciasIdentificacao: undefined })),
        esclarecimento: { tipo: "procedimento", opcoes: [], pergunta: perguntas(lista) },
      };
    },
  };
}
export function perguntas(lista: readonly ConhecimentoSessao[]): string {
  return lista
    .map((p) =>
      apresentarPerguntaEsclarecimento(p.esclarecimento!.pergunta, {
        tipo: p.esclarecimento!.tipo,
        tipoAtendimento: p.consulta.tipo_atendimento,
      }),
    )
    .join("\n\n");
}
const compacto = (v: string) => normal(v).replace(/[^a-z0-9]/g, "");
const opcoesDe = (p: ConhecimentoSessao) => [
  ...new Set((p.esclarecimento?.opcoes ?? []).map((o) => compacto(o.nome)).filter(Boolean)),
];

/**
 * Pendências que ainda precisam ser perguntadas. Reformulações do mesmo
 * pedido geram pendências com as mesmas opções; a resposta do modelo pode já
 * ter listado as opções. Nenhuma das duas situações repete a pergunta
 * (homologação 06/10/2026: a lista da fisioterapia saiu três vezes).
 */
export function pendenciasAPerguntar(
  textoConfirmado: string,
  lista: readonly ConhecimentoSessao[],
): ConhecimentoSessao[] {
  const texto = compacto(textoConfirmado);
  const restantes = lista.filter((p) => {
    const opcoes = opcoesDe(p);
    return !(opcoes.length && opcoes.every((o) => texto.includes(o)));
  });
  // Opções contidas nas de outra pendência mantida já são perguntadas por ela.
  return restantes.filter((p, i) => {
    const opcoes = opcoesDe(p);
    if (!opcoes.length) return true;
    return !restantes.some((q, j) => {
      if (j === i) return false;
      const outras = new Set(opcoesDe(q));
      const contidas = opcoes.every((o) => outras.has(o));
      return contidas && (outras.size > opcoes.length || j < i);
    });
  });
}

export function comporRespostaParcial(
  textoConfirmado: string,
  lista: readonly ConhecimentoSessao[],
  apresentacao?: string | null,
): string {
  const texto = textoConfirmado.trim();
  const faltantes = [
    ...new Set(pendenciasAPerguntar(texto, lista).map((p) => perguntas([p]))),
  ].filter((p) => !normal(texto).includes(normal(p)));
  return [!texto && apresentacao ? apresentacao : "", texto, ...faltantes]
    .filter(Boolean)
    .join("\n\n");
}
