/**
 * FASE 4 — NINA COM O MODELO REAL (cenários 5, 6 e 7).
 *
 * Isto NÃO é teste unitário e não roda em `bun test`. É um executor explícito,
 * com lote pequeno, limite de chamadas e evidência gravada em disco.
 *
 *   bun run scripts/nina-modelo-real.ts --clinica <uuid> [--lote 3]
 *
 * Regras aplicadas (não são negociáveis pelo parâmetro):
 *  - Só roda com NINA_LIVE=1 declarado por quem executa.
 *  - Usa o MESMO pipeline do WhatsApp (`gerarRespostaNina`) com `teste: true`;
 *    nada é simulado, nenhuma resposta é inventada pelo script.
 *  - Não envia nada pelo canal real: o modo teste grava só no histórico interno.
 *  - Cenário de agendamento fica DESLIGADO por padrão. A agenda ainda é
 *    compartilhada com a operação (bloqueio registrado na Fase 2); para rodar
 *    mesmo assim é preciso NINA_LIVE_AGENDA=1 e assumir a limpeza manual.
 *  - Limite duro de chamadas por execução. Nada de repetição infinita.
 */

const LIMITE_MAXIMO = 8;

type Cenario = {
  nome: string;
  mensagem: string;
  /** Fatos esperados na resposta — comparados por fato, não por texto igual. */
  esperado: Array<{ descricao: string; verificar: (r: string) => boolean }>;
  exigeAgenda?: boolean;
};

function arg(nome: string, padrao?: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : padrao;
}

const contem = (...termos: string[]) => (r: string) => {
  const t = r.toLowerCase();
  return termos.some((x) => t.includes(x.toLowerCase()));
};

const CENARIOS: Cenario[] = [
  {
    nome: "saudação e intenção",
    mensagem: "Oi, bom dia!",
    esperado: [
      { descricao: "cumprimenta e se coloca à disposição", verificar: contem("bom dia", "olá", "oi", "posso ajudar") },
      { descricao: "não inventa preço sem ser perguntado", verificar: (r) => !/R\$\s*\d/.test(r) },
    ],
  },
  {
    nome: "preço fundamentado no catálogo",
    mensagem: "Quanto custa a consulta com cardiologista?",
    esperado: [
      {
        descricao: "ou informa valor do catálogo, ou diz que vai confirmar — nunca estima",
        verificar: (r) => /R\$\s*\d/.test(r) || contem("confirmar", "verificar", "equipe", "não tenho")(r),
      },
      { descricao: "não cita planilha nem fonte externa", verificar: (r) => !contem("planilha", "internet", "média de mercado")(r) },
    ],
  },
  {
    nome: "informação inexistente não é inventada",
    mensagem: "Vocês fazem transplante de córnea?",
    esperado: [
      {
        descricao: "admite não ter a informação ou encaminha para a equipe",
        verificar: contem("não", "verificar", "confirmar", "equipe"),
      },
    ],
  },
  {
    nome: "coleta de dados após confirmar a intenção",
    mensagem: "Quero marcar uma consulta de cardiologia para esta semana.",
    esperado: [
      { descricao: "pede dado de identificação antes de agendar", verificar: contem("nome", "nascimento", "cpf") },
      { descricao: "não afirma que já agendou", verificar: (r) => !contem("agendado com sucesso", "está agendado")(r) },
    ],
    exigeAgenda: false,
  },
];

async function main() {
  if (process.env["NINA_LIVE"] !== "1") {
    console.error("Bloqueado: exporte NINA_LIVE=1 para executar com o modelo real.");
    process.exit(2);
  }
  const clinicaId = arg("clinica");
  if (!clinicaId) {
    console.error("Informe --clinica <uuid>.");
    process.exit(2);
  }
  const telefone = arg("telefone", "+5500000000000")!;
  const lote = Math.min(Number(arg("lote", "3")), LIMITE_MAXIMO);
  const comAgenda = process.env["NINA_LIVE_AGENDA"] === "1";

  const { gerarRespostaNina } = await import("../src/lib/whatsapp.server");

  const selecionados = CENARIOS.filter((c) => comAgenda || !c.exigeAgenda).slice(0, lote);
  const evidencias: unknown[] = [];
  let chamadas = 0;
  const inicioTudo = Date.now();

  for (const cenario of selecionados) {
    if (chamadas >= LIMITE_MAXIMO) break;
    const inicio = Date.now();
    let resposta = "";
    let erro: string | null = null;
    try {
      chamadas += 1;
      resposta = await gerarRespostaNina(clinicaId, cenario.mensagem, telefone, { teste: true });
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
    }
    const duracao = Date.now() - inicio;
    const conferencias = cenario.esperado.map((e) => ({
      esperado: e.descricao,
      aprovado: erro ? false : e.verificar(resposta),
    }));
    evidencias.push({
      cenario: cenario.nome,
      mensagem_paciente: cenario.mensagem,
      resposta_da_nina: resposta,
      erro,
      duracao_ms: duracao,
      conferencias,
      aprovado: !erro && conferencias.every((c) => c.aprovado),
    });
    console.log(
      `${erro ? "FALHOU " : conferencias.every((c) => c.aprovado) ? "APROVADO" : "FALHOU "} | ${cenario.nome} | ${duracao}ms`,
    );
    if (erro) console.log(`   erro: ${erro}`);
    else console.log(`   resposta: ${resposta.slice(0, 240).replace(/\n/g, " ")}`);
  }

  const relatorio = {
    executado_em: new Date().toISOString(),
    clinica_id: clinicaId,
    telefone_sintetico: telefone,
    modelo_real: true,
    agenda_habilitada: comAgenda,
    chamadas,
    duracao_total_ms: Date.now() - inicioTudo,
    resultados: evidencias,
  };
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir("evidencias/nina", { recursive: true });
  const arquivo = `evidencias/nina/execucao-${Date.now()}.json`;
  await writeFile(arquivo, JSON.stringify(relatorio, null, 2), "utf8");
  console.log(`\nChamadas: ${chamadas} | Evidência: ${arquivo}`);
  const reprovados = evidencias.filter((e) => !(e as { aprovado: boolean }).aprovado).length;
  process.exit(reprovados > 0 ? 1 : 0);
}

void main();
