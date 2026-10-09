/** Finalidade do pedido é diferente da doença pesquisada. Sem chamadas de IA. */
const normal = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const diagnostico = /\b(?:teste|exame|pesquisa|pcr|antigeno|antigenos|igg|igm|swab|sorologia)\b/;
const doenca = /\b(?:gripe|influenza|gripal|antigripal)\b/;

export function pedidoVacinaGripe(texto: string): boolean {
  const t = normal(texto);
  return /\b(?:vacina(?:cao)?\s+(?:(?:da|de|contra|a)\s+)*(?:gripe|influenza)|vacina\s+antigripal|antigripal)\b/.test(
    t,
  );
}

/** Apenas equivalência de escrita do pedido; não comprova a oferta da clínica. */
export function escritaVacinaGripe(texto: string): string {
  return normal(texto)
    .replace(/\b(?:vacina\s+)?antigripal\b/g, "vacina gripe")
    .replace(/\binfluenza\b/g, "gripe")
    .replace(/\bvacinacao\b/g, "vacina");
}

export function registroVacinaGripe(nome: string, aliases: readonly string[]): boolean {
  // Um alias indevido num exame diagnóstico não pode trocar a sua finalidade.
  if (diagnostico.test(normal(nome))) return false;
  return [nome, ...aliases].some(pedidoVacinaGripe);
}

function fragmentoDoMesmoPedido(termo: string): boolean {
  const t = normal(termo).trim();
  return pedidoVacinaGripe(t) || /^(?:vacina|vacinacao|gripe|influenza)$/.test(t);
}

function haPedidoDiagnostico(mensagem: string): boolean {
  return normal(mensagem)
    .split(/[?!.;\n]|\s+e\s+/)
    .some((s) => diagnostico.test(s) && doenca.test(s) && !pedidoVacinaGripe(s));
}

/** Restaura o qualificador omitido pelo modelo. Outros pedidos permanecem separados. */
export function preservarFinalidadeVacina(
  ferramenta: string,
  args: string | undefined,
  mensagem: string,
): string | undefined {
  if (
    !["consultar_cadastro", "buscar_procedimentos"].includes(ferramenta) ||
    !pedidoVacinaGripe(mensagem)
  )
    return args;
  try {
    const p = JSON.parse(args ?? "{}"),
      termo = String(p.termo ?? "");
    if (!termo || pedidoVacinaGripe(termo)) return args;
    const t = normal(termo);
    // Um pedido explícito de teste na mesma mensagem autoriza a pesquisa diagnóstica.
    const diagnosticoPedido = haPedidoDiagnostico(mensagem);
    if (diagnosticoPedido && !/^vacina(?:cao)?$/.test(t.trim())) return args;
    if (!fragmentoDoMesmoPedido(termo) && !(diagnostico.test(t) && doenca.test(t))) return args;
    // Mantém qualificadores quando o paciente informou um nome mais específico.
    const pedido = mensagem
      .match(
        /\b(?:vacina(?:ção|cao)?\s+(?:(?:da|de|contra|a)\s+)*(?:gripe|influenza)|(?:vacina\s+)?antigripal)\b[^?!.;\n]*/i,
      )?.[0]
      .split(/\s+e\s+|\s+(?:tem|voces|vocês|vcs|quanto|qual|custa|existe|esta|está)\b/i)[0]
      ?.trim();
    if (!pedido) return args;
    return JSON.stringify({
      ...p,
      termo: pedido,
      tipo_atendimento: "exame_procedimento",
      reformula_de: pedido,
      nova_solicitacao: false,
    });
  } catch {
    return args;
  }
}

export function pendenciaAntigaDaVacina(termo: string, mensagem: string): boolean {
  return (
    pedidoVacinaGripe(mensagem) &&
    fragmentoDoMesmoPedido(termo) &&
    (!haPedidoDiagnostico(mensagem) ||
      pedidoVacinaGripe(termo) ||
      /^vacina(?:cao)?$/.test(normal(termo).trim()))
  );
}

export const REGRA_FINALIDADE_VACINA = `FINALIDADE DO PEDIDO — Preserve a finalidade em cada pesquisa e reformulação: vacina contra gripe/influenza é vacinação, não exame diagnóstico de influenza. Use um único pedido completo, com seus qualificadores; reformula_de vincula tentativas desse mesmo pedido. Um cadastro chamado apenas VACINA não confirma qual vacina a clínica oferece. Quando a ferramenta retornar limitacao_catalogo, o nome já foi compreendido: informe uma única vez que o cadastro não permite confirmar essa vacina. Não afirme ausência do serviço, não peça para repetir ou confirmar VACINA, não ofereça testes de influenza nem tente agendar esse registro genérico. Responda normalmente às outras perguntas independentes. Essa limitação de conteúdo não é uma falha de compreensão do paciente.`;
