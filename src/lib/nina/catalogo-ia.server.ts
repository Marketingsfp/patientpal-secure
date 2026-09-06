/**
 * "Criar com IA" do catálogo — chamada ao modelo, somente no servidor.
 *
 * Usa a Responses API do gateway de IA da Lovable com saída estruturada
 * estrita, em streaming (modelos de raciocínio podem demorar; sem streaming a
 * requisição morreria por timeout da hospedagem).
 *
 * A LOVABLE_API_KEY é lida aqui dentro e nunca sai do servidor.
 * Esta rota é independente do modelo de atendimento da Nina: não altera nem
 * lê a configuração de modelo usada nas conversas com pacientes.
 */
import {
  MODELO_CATALOGO_IA,
  instrucoesCatalogoIA,
  schemaSaida,
  type TipoCatalogo,
} from "./catalogo-ia";

export type ResultadoIA = {
  servicos: any[];
  profissionais: any[];
  pendencias: string[];
  ambiguidades: string[];
};

function erroAmigavel(status: number, corpo: string): string {
  if (status === 402)
    return "Os créditos de IA do espaço de trabalho acabaram. O cadastro manual continua funcionando.";
  if (status === 403)
    return "A IA está bloqueada por configuração do espaço de trabalho. O cadastro manual continua funcionando.";
  if (status === 429)
    return "Muitas solicitações de IA agora. Tente novamente em alguns instantes.";
  if (status === 400)
    return `O texto não pôde ser processado pela IA (${corpo.slice(0, 200)}).`;
  return "A IA não respondeu agora. Seu texto foi preservado — tente novamente.";
}

/** Lê o SSE da Responses API e devolve o texto final acumulado. */
async function lerTextoDoStream(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("A IA não devolveu conteúdo.");
  const decoder = new TextDecoder();
  let buffer = "";
  let texto = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const linhas = buffer.split("\n");
    buffer = linhas.pop() ?? "";
    for (const linha of linhas) {
      if (!linha.startsWith("data:")) continue;
      const bruto = linha.slice(5).trim();
      if (!bruto || bruto === "[DONE]") continue;
      let evento: any;
      try {
        evento = JSON.parse(bruto);
      } catch {
        continue;
      }
      if (evento?.type === "response.output_text.delta" && typeof evento.delta === "string") {
        texto += evento.delta;
      } else if (evento?.type === "response.completed") {
        const saida = evento?.response?.output_text;
        if (typeof saida === "string" && saida) texto = saida;
        else if (Array.isArray(saida) && saida.length) texto = saida.join("");
      } else if (evento?.type === "error" || evento?.type === "response.failed") {
        throw new Error(evento?.error?.message ?? "A IA falhou ao processar o texto.");
      }
    }
  }
  return texto.trim();
}

export async function organizarTextoComIA(
  tipo: TipoCatalogo,
  texto: string,
): Promise<ResultadoIA> {
  const chave = process.env["LOVABLE_API_KEY"];
  if (!chave)
    throw new Error(
      "A IA não está configurada neste projeto. O cadastro manual continua funcionando.",
    );

  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": chave,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: MODELO_CATALOGO_IA,
      stream: true,
      store: false,
      instructions: instrucoesCatalogoIA(tipo),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              // Delimitado para deixar explícito que é conteúdo, não instrução.
              text: `Organize o conteúdo entre as marcas abaixo.\n<<<TEXTO_DA_CLINICA\n${texto}\nTEXTO_DA_CLINICA>>>`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "catalogo_nina",
          strict: true,
          schema: schemaSaida(),
        },
      },
    }),
  });

  if (!res.ok) {
    const corpo = await res.text().catch(() => "");
    console.error("[catalogo-ia] falha", res.status, corpo.slice(0, 500));
    throw new Error(erroAmigavel(res.status, corpo));
  }

  const bruto = await lerTextoDoStream(res);
  if (!bruto) throw new Error("A IA não devolveu campos preenchidos. Tente detalhar o texto.");

  let json: any;
  try {
    json = JSON.parse(bruto);
  } catch {
    throw new Error("A resposta da IA veio fora do formato esperado. Tente novamente.");
  }

  return {
    servicos: Array.isArray(json?.servicos) ? json.servicos : [],
    profissionais: Array.isArray(json?.profissionais) ? json.profissionais : [],
    pendencias: Array.isArray(json?.pendencias) ? json.pendencias.map(String) : [],
    ambiguidades: Array.isArray(json?.ambiguidades) ? json.ambiguidades.map(String) : [],
  };
}
