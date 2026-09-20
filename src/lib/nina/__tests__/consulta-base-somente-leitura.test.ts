import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

// Executa a ferramenta real com retrieval e auditoria simulados em processo
// isolado. Nenhuma chamada de IA/banco ocorre; mocks não vazam para outras suítes.
const codigo = `
import { mock } from "bun:test";
const entrada = await Bun.stdin.json();
const chamadas = [];
const auditoria = [];
mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from(tabela) {
    if (tabela !== "audit_log") throw new Error("Acesso inesperado: " + tabela);
    return { insert: async (registro) => { auditoria.push(registro); return { error: null }; } };
  } }
}));
mock.module("@/lib/nina/knowledge.server", () => ({
  searchKnowledgeBase: async (args) => {
    chamadas.push(args);
    if (entrada.falhar) throw new Error("Falha simulada no catálogo");
    return entrada.fonte;
  }
}));
const { executarFerramentaPaciente } = await import("@/lib/nina/paciente-tools.server");
const { estadoVazio } = await import("@/lib/nina/fluxo-estado-normalizar");
const { textoResumo } = await import("@/lib/nina/atendimento-fase4");
const estado = estadoVazio();
Object.assign(estado.appointment, entrada.appointment);
const antes = structuredClone(estado);
const resultado = await executarFerramentaPaciente({
  clinicaId: "clinica-simulada", telefone: null, pacienteId: null,
  pacienteNome: null, conversaId: "conversa-simulada",
  origem: "homologacao", teste: true, podeAgendar: false, estado
}, "consultar_base_conhecimento", entrada.args);
console.log(JSON.stringify({ antes, depois: estado, resultado, chamadas, auditoria,
  resumo: textoResumo(estado, "Unidade de teste") }));
`;

type ResultadoLeitura = {
  antes: { appointment: { price: string | null } };
  depois: { appointment: { price: string | null } };
  resultado: Record<string, unknown>;
  chamadas: unknown[];
  auditoria: Array<{ dados_depois: { entrada: { resposta: unknown }; ok: boolean } }>;
  resumo: string;
};

async function consultar(entrada: {
  args: { termo: string; medico?: string; dia?: string };
  appointment?: { procedure: string; doctor_name: string; price: string };
  fonte?: Record<string, unknown>;
  falhar?: boolean;
}): Promise<ResultadoLeitura> {
  const processo = Bun.spawn([process.execPath, "--eval", codigo], {
    cwd: fileURLToPath(new URL("../../../../", import.meta.url)),
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  processo.stdin.write(JSON.stringify(entrada));
  processo.stdin.end();
  const [stdout, stderr, exit] = await Promise.all([
    new Response(processo.stdout).text(),
    new Response(processo.stderr).text(),
    processo.exited,
  ]);
  if (exit !== 0) throw new Error(`Executor isolado falhou (${exit}): ${stderr}`);
  return JSON.parse(stdout.trim()) as ResultadoLeitura;
}

const fonteGeral = {
  knowledge_status: "found",
  procedure: "Consulta Cardiologia",
  price: "R$ 120,00",
  resultados: [
    { procedimento: "Consulta Cardiologia", medico_nome: "Marina Costa", preco: "R$ 120,00" },
    {
      procedimento: "Consulta Cardiologia Infantil",
      medico_nome: "Alex Almeida",
      preco: "R$ 160,00",
    },
  ],
};

describe("consulta da base da Nina preserva o atendimento selecionado", () => {
  test("pesquisa geral não troca o preço infantil pelo primeiro preço geral", async () => {
    const r = await consultar({
      args: { termo: "cardiologia" },
      appointment: {
        procedure: "Consulta Cardiologia Infantil",
        doctor_name: "Alex Almeida",
        price: "R$ 160,00",
      },
      fonte: fonteGeral,
    });
    expect(r.depois).toEqual(r.antes);
    expect(r.depois.appointment.price).toBe("R$ 160,00");
    expect(r.resultado).toEqual({ ok: true, ...fonteGeral, pedido_interpretado: { atendimento: "cardiologia", objetivos: ["informacoes_gerais"], tipo_atendimento: "nao_identificado" } });
    expect(r.resumo).toContain("Valor: R$ 160,00");
    expect(r.auditoria).toHaveLength(1);
    expect(r.auditoria[0]?.dados_depois.entrada.resposta).toEqual(r.resultado);
  });

  test("sem serviço selecionado, consulta não transforma referência em preço contratado", async () => {
    const r = await consultar({ args: { termo: "cardiologia" }, fonte: fonteGeral });
    expect(r.depois).toEqual(r.antes);
    expect(r.depois.appointment.price).toBeNull();
    expect(r.resumo).not.toContain("Valor:");
    expect(r.resultado.price).toBe("R$ 120,00");
  });

  test("mesmo com médico filtrado, referência em dinheiro não sobrescreve preço selecionado no cartão", async () => {
    const r = await consultar({
      args: { termo: "cardiologia infantil", medico: "Alex Almeida", dia: "quarta" },
      appointment: {
        procedure: "Consulta Cardiologia Infantil",
        doctor_name: "Alex Almeida",
        price: "R$ 190,00",
      },
      fonte: { ...fonteGeral, procedure: "Consulta Cardiologia Infantil", price: "R$ 160,00" },
    });
    expect(r.depois).toEqual(r.antes);
    expect(r.depois.appointment.price).toBe("R$ 190,00");
    expect(r.chamadas).toEqual([
      {
        clinicaId: "clinica-simulada",
        query: "cardiologia infantil",
        medico: "Alex Almeida",
        dia: "quarta",
        canal: "whatsapp",
      },
    ]);
  });

  test("falha na leitura preserva o estado e retorna erro auditado", async () => {
    const r = await consultar({
      args: { termo: "cardiologia" },
      appointment: {
        procedure: "Consulta Cardiologia Infantil",
        doctor_name: "Alex Almeida",
        price: "R$ 190,00",
      },
      falhar: true,
    });
    expect(r.depois).toEqual(r.antes);
    expect(r.resultado.ok).toBe(false);
    expect(r.resultado.erro).toBe("INTERNAL_ERROR");
    expect(r.auditoria[0]?.dados_depois.ok).toBe(false);
  });
});
