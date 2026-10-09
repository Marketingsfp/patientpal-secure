import type { ResultadoBroker } from "./tool-broker";

function serializar(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(serializar).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.entries(v)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, valor]) => `${JSON.stringify(k)}:${serializar(valor)}`)
      .join(",")}}`;
  return JSON.stringify(v) ?? "null";
}

/** Mede novidade dos retornos; o teto de segurança fica em `criarLimiteTurno`. */
export function criarProgressoTurno() {
  const vistos = new Set<string>();
  return {
    registrar(nome: string, resultado: ResultadoBroker): boolean {
      if (resultado.reused) return false;
      const dados =
        resultado.dados && typeof resultado.dados === "object" && !Array.isArray(resultado.dados)
          ? { ...(resultado.dados as Record<string, unknown>) }
          : resultado.dados;
      if (dados && typeof dados === "object" && !Array.isArray(dados)) {
        // Orientação e identificação da pesquisa não são fatos novos.
        for (const chave of [
          "instrucao",
          "mapa_campos",
          "trace",
          "pedido_interpretado",
          "consulta_agenda",
        ])
          delete (dados as Record<string, unknown>)[chave];
      }
      const chave = serializar({ nome, sucesso: resultado.success, erro: resultado.erro, dados });
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    },
  };
}

/**
 * Teto de segurança do turno (06/10/2026), somado ao controle de progresso.
 * Calibrado com 7 dias de produção: com o teto antigo (3/6) o máximo foi 6
 * rodadas; sem teto, 97% dos turnos usaram até 6 e o pedido médico com 19
 * exames chegou a 30 chamadas e 1,1 milhão de tokens.
 * - comum: 6 rodadas com ferramentas;
 * - lista (vários exames do catálogo com resultado novo no mesmo turno): 10;
 * - tokens: o turno para de consultar ao passar de 400 mil tokens.
 * Ao atingir o teto, o modelo ainda tem uma rodada só de texto para responder.
 */
export const LIMITE_RODADAS_COMUM = 6;
export const LIMITE_RODADAS_LISTA = 10;
export const LIMITE_TOKENS_TURNO = 400_000;
/** Itens distintos do catálogo que caracterizam uma lista (pedido médico etc.). */
export const ITENS_PARA_LISTA = 4;
/** Trava final de chamadas ao modelo: rodadas com ferramentas, síntese, correções e uma nova tentativa. */
export const LIMITE_CHAMADAS_MODELO = LIMITE_RODADAS_LISTA + 5;

const BUSCAS_DE_ITEM = new Set(["consultar_cadastro", "buscar_procedimentos"]);

export type EstouroLimiteTurno = "rodadas" | "tokens";

export function criarLimiteTurno() {
  let rodadas = 0;
  let tokens = 0;
  let itens = 0;
  const limite = () => (itens >= ITENS_PARA_LISTA ? LIMITE_RODADAS_LISTA : LIMITE_RODADAS_COMUM);
  return {
    /** Soma os tokens de cada chamada ao modelo (entrada + saída). */
    registrarUso(uso: { entrada?: number | null; saida?: number | null } | null | undefined) {
      tokens += (uso?.entrada ?? 0) + (uso?.saida ?? 0);
    },
    /** Uma busca do catálogo que trouxe fato novo conta como um item pedido. */
    registrarResultadoNovo(nome: string) {
      if (BUSCAS_DE_ITEM.has(nome)) itens++;
    },
    registrarRodadaComFerramentas() {
      rodadas++;
    },
    estouro(): EstouroLimiteTurno | null {
      if (tokens >= LIMITE_TOKENS_TURNO) return "tokens";
      if (rodadas >= limite()) return "rodadas";
      return null;
    },
    resumo() {
      return {
        rodadas_com_ferramentas: rodadas,
        limite_rodadas: limite(),
        itens_catalogo: itens,
        tokens,
        limite_tokens: LIMITE_TOKENS_TURNO,
      };
    },
  };
}

export const INSTRUCAO_LIMITE_TURNO =
  "O limite de consultas desta mensagem foi atingido. Responda agora somente com os resultados já confirmados nas ferramentas deste turno, preservando todas as perguntas do paciente. Para itens que ainda não foram consultados, diga apenas que ainda não foram verificados e ofereça continuar na próxima mensagem; não diga que não existem nem que estão indisponíveis. Não faça novas consultas, não anuncie reserva e não invente fatos ausentes.";
export const INSTRUCAO_RESPOSTA_EM_TEXTO =
  "Ferramentas não estão disponíveis nesta etapa. Responda agora ao paciente somente em texto, com os resultados já confirmados neste turno, sem anunciar novas consultas.";

/** Remove somente orientações idênticas já presentes no histórico deste turno. */
export function criarCompactadorRetornos() {
  const vistos = new Set<string>();
  return (retorno: unknown): unknown => {
    if (!retorno || typeof retorno !== "object" || Array.isArray(retorno)) return retorno;
    const saida = { ...(retorno as Record<string, unknown>) };
    const reutilizados: string[] = [];
    for (const campo of ["instrucao", "mapa_campos"]) {
      if (saida[campo] == null) continue;
      const chave = `${campo}:${serializar(saida[campo])}`;
      if (vistos.has(chave)) {
        delete saida[campo];
        reutilizados.push(campo);
      } else vistos.add(chave);
    }
    if (reutilizados.length) saida.orientacoes_identicas_em_retornos_anteriores = reutilizados;
    return saida;
  };
}

export const REGRA_EFICIENCIA_CONSULTAS =
  "Use os vínculos de agenda confirmados no retorno de consultar_cadastro. Quando o profissional e seu medico_id já estiverem identificados, não repita buscar_medicos apenas para obter esse mesmo vínculo. Preserve atendimento, profissional, idade, dia e período solicitados; referências anteriores orientam a busca, mas vagas devem ser consultadas na agenda atual. Vínculo não confirma escolha, disponibilidade nem reserva.";
export const REGRA_MODALIDADES_PAGAMENTO =
  "Regra de negócio confirmada: Pix e cartão têm sempre o mesmo valor. Quando houver preço confirmado de cartão ou Pix para o atendimento, esse mesmo valor pode ser informado como Pix/cartão, preservando as condições do atendimento. Ausência de um campo Pix separado não invalida essa equivalência. Não use o preço de dinheiro como preço de Pix/cartão; se nenhum valor de Pix ou cartão estiver confirmado, não invente. Preserve as regras publicadas de pagamento antecipado e não crie descontos.";
export const RESPOSTA_SEM_PROGRESSO =
  "Não consegui concluir esta consulta agora. Você prefere que eu tente novamente ou encaminhe para nossa equipe?";
