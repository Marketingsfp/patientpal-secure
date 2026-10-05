import type { ResultadoBroker } from "./tool-broker";

function serializar(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(serializar).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.entries(v).sort(([a], [b]) => a.localeCompare(b))
    .map(([k, valor]) => `${JSON.stringify(k)}:${serializar(valor)}`).join(",")}}`;
  return JSON.stringify(v) ?? "null";
}

/** Sem teto de rodadas: mede novidade dos retornos, não a quantidade de chamadas. */
export function criarProgressoTurno() {
  const vistos = new Set<string>();
  return {
    registrar(nome: string, resultado: ResultadoBroker): boolean {
      if (resultado.reused) return false;
      const dados = resultado.dados && typeof resultado.dados === "object" && !Array.isArray(resultado.dados)
        ? { ...resultado.dados as Record<string, unknown> } : resultado.dados;
      if (dados && typeof dados === "object" && !Array.isArray(dados)) {
        // Orientação e identificação da pesquisa não são fatos novos.
        for (const chave of ["instrucao", "mapa_campos", "trace", "pedido_interpretado", "consulta_agenda"])
          delete (dados as Record<string, unknown>)[chave];
      }
      const chave = serializar({ nome, sucesso: resultado.success, erro: resultado.erro, dados });
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    },
  };
}

/** Remove somente orientações idênticas já presentes no histórico deste turno. */
export function criarCompactadorRetornos() {
  const vistos = new Set<string>();
  return (retorno: unknown): unknown => {
    if (!retorno || typeof retorno !== "object" || Array.isArray(retorno)) return retorno;
    const saida = { ...retorno as Record<string, unknown> };
    const reutilizados: string[] = [];
    for (const campo of ["instrucao", "mapa_campos"]) {
      if (saida[campo] == null) continue;
      const chave = `${campo}:${serializar(saida[campo])}`;
      if (vistos.has(chave)) { delete saida[campo]; reutilizados.push(campo); }
      else vistos.add(chave);
    }
    if (reutilizados.length) saida.orientacoes_identicas_em_retornos_anteriores = reutilizados;
    return saida;
  };
}

export const REGRA_EFICIENCIA_CONSULTAS = "Use os vínculos de agenda confirmados no retorno de consultar_cadastro. Quando o profissional e seu medico_id já estiverem identificados, não repita buscar_medicos apenas para obter esse mesmo vínculo. Preserve atendimento, profissional, idade, dia e período solicitados; referências anteriores orientam a busca, mas vagas devem ser consultadas na agenda atual. Vínculo não confirma escolha, disponibilidade nem reserva.";
export const REGRA_MODALIDADES_PAGAMENTO = "Regra de negócio confirmada: Pix e cartão têm sempre o mesmo valor. Quando houver preço confirmado de cartão ou Pix para o atendimento, esse mesmo valor pode ser informado como Pix/cartão, preservando as condições do atendimento. Ausência de um campo Pix separado não invalida essa equivalência. Não use o preço de dinheiro como preço de Pix/cartão; se nenhum valor de Pix ou cartão estiver confirmado, não invente. Preserve as regras publicadas de pagamento antecipado e não crie descontos.";
export const RESPOSTA_SEM_PROGRESSO = "Não consegui concluir esta consulta agora. Você prefere que eu tente novamente ou encaminhe para nossa equipe?";
