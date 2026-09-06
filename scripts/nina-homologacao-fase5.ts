/**
 * FASE 5 — HOMOLOGAÇÃO DA INTERPRETAÇÃO E DAS RESPOSTAS DA NINA.
 *
 * Reaproveita o que já existe:
 *  - `ninaAIGateway` (mesmo gateway e modelo real do atendimento);
 *  - `regrasCatalogo` (a MESMA definição central de instruções do atendimento);
 *  - `montarResultadoCatalogo` (o MESMO mapeamento catálogo → contrato).
 *
 * Nada é simulado do lado do modelo: a resposta avaliada é a resposta real.
 * Os REGISTROS são fictícios e ficam apenas em memória — nenhum dado é
 * gravado, publicado, agendado ou enviado por canal real.
 *
 *   NINA_LIVE=1 bun run scripts/nina-homologacao-fase5.ts
 */
import { ninaAIGateway } from "../src/lib/nina/ai-gateway.server";
import { regrasCatalogo } from "../src/lib/nina/catalogo-prompt.server";
import {
  montarResultadoCatalogo,
  type ProfissionalPublicado,
  type ServicoPublicado,
} from "../src/lib/nina/catalogo-conhecimento";

const MODELO = process.env["NINA_MODELO_HOMOLOG"] ?? "google/gemini-3.7-flash";
const HOJE = new Date().toISOString().slice(0, 10);
const LIMITE = 14;

const servico = (s: Partial<ServicoPublicado> & { nome: string }): ServicoPublicado => ({
  id: `s-${s.nome}`,
  valor: null,
  valor_observacao: null,
  descricao_publica: null,
  preparo: null,
  restricoes: null,
  executantes: [],
  formas_pagamento: [],
  ...s,
});

const profissional = (
  p: Partial<ProfissionalPublicado> & { nome: string },
): ProfissionalPublicado => ({
  id: `p-${p.nome}`,
  especialidades: [],
  atende_consultorio: true,
  formas_pagamento: [],
  convenios: [],
  horarios: [],
  tipo_atendimento: null,
  observacao_publica: null,
  aviso_dia: null,
  aviso_valido_de: null,
  aviso_valido_ate: null,
  unidades: { nome: "Unidade Fictícia Centro" },
  ...p,
});

type Cenario = {
  id: string;
  pergunta: string;
  contexto: () => string;
  registrosResumo: string;
  esperado: string;
  checagens: Array<{ o_que: string; ok: (r: string) => boolean }>;
};

const tem = (...t: string[]) => (r: string) => t.some((x) => r.toLowerCase().includes(x.toLowerCase()));
const confirma = (r: string) =>
  /(confirm|verific|checar|equipe|atendente|retorno|vou passar|encaminh|consultar a agenda)/i.test(r);

function bloco(entrada: Parameters<typeof montarResultadoCatalogo>[0]): string {
  const res = montarResultadoCatalogo(entrada);
  return `RETORNO DA FERRAMENTA consultar_base_conhecimento:\n${JSON.stringify(res)}`;
}

const CENARIOS: Cenario[] = [
  {
    id: "1-precos-por-forma",
    pergunta: "Quanto custa o ultrassom de abdome?",
    registrosResumo: "serviço Ultrassom de abdome — dinheiro R$ 150,00 / cartão R$ 180,00 (crédito e débito)",
    esperado: "informar os dois valores com sua forma; não apresentar R$ 150 como universal",
    contexto: () =>
      bloco({
        hojeISO: HOJE,
        profissionais: [],
        servicos: [
          servico({
            nome: "Ultrassom de abdome total",
            valor: 150,
            formas_pagamento: [
              { forma: "Dinheiro", valor: 150 },
              { forma: "Cartão de crédito ou débito", valor: 180 },
            ],
          }),
        ],
      }),
    checagens: [
      { o_que: "cita R$ 150,00", ok: (r) => /150/.test(r) },
      { o_que: "cita R$ 180,00", ok: (r) => /180/.test(r) },
      { o_que: "vincula valor a forma de pagamento", ok: tem("dinheiro") },
      { o_que: "não trata 180 como inexistente", ok: (r) => !/apenas r\$\s*150/i.test(r) },
    ],
  },
  {
    id: "2-recorrencia-quinzenal",
    pergunta: "Quando o Dr. Nogueira atende?",
    registrosResumo: "profissional Dr. Nogueira — sábados quinzenais, ordem de chegada",
    esperado: "preservar quinzenal; não inventar a próxima data",
    contexto: () =>
      bloco({
        hojeISO: HOJE,
        servicos: [],
        priorizar: "profissional",
        profissionais: [
          profissional({
            nome: "Dr. Nogueira",
            especialidades: [{ nome: "Ortopedia" }],
            tipo_atendimento: "Ordem de chegada",
            horarios: [
              { dia: "Sábado", inicio: "08:00", recorrencia: "Quinzenal", observacao: "Sábados alternados" },
            ],
          }),
        ],
      }),
    checagens: [
      { o_que: "menciona quinzenal/alternado", ok: tem("quinzenal", "alternado", "a cada 15", "quinze") },
      { o_que: "não afirma toda semana", ok: (r) => !/toda semana|todos os s[áa]bados|semanalmente/i.test(r) },
      { o_que: "não crava data específica sem agenda", ok: (r) => !/\b\d{2}\/\d{2}\b/.test(r) || confirma(r) },
    ],
  },
  {
    id: "3-restricao-em-observacao",
    pergunta: "Meu filho tem 3 meses, pode consultar com a Dra. Helena?",
    registrosResumo: "profissional Dra. Helena — observação pública de horário: atendimento a partir de 6 meses",
    esperado: "interpretar a observação como restrição de idade",
    contexto: () =>
      bloco({
        hojeISO: HOJE,
        servicos: [],
        priorizar: "profissional",
        profissionais: [
          profissional({
            nome: "Dra. Helena",
            especialidades: [{ nome: "Pediatria" }],
            horarios: [
              { dia: "Quarta", inicio: "14:00", observacao: "Atendimento a partir de 6 meses de idade" },
            ],
          }),
        ],
      }),
    checagens: [
      { o_que: "reconhece o limite de 6 meses", ok: tem("6 meses", "seis meses") },
      { o_que: "não afirma que pode atender aos 3 meses", ok: (r) => !/pode sim|sem restri/i.test(r) },
    ],
  },
  {
    id: "4-preparo",
    pergunta: "Como devo me preparar para o ultrassom de abdome?",
    registrosResumo: "serviço Ultrassom de abdome — preparo: jejum de 6 horas e bexiga cheia",
    esperado: "usar somente o preparo publicado",
    contexto: () =>
      bloco({
        hojeISO: HOJE,
        profissionais: [],
        servicos: [
          servico({
            nome: "Ultrassom de abdome total",
            preparo: "Jejum de 6 horas e chegar com a bexiga cheia",
          }),
        ],
      }),
    checagens: [
      { o_que: "cita jejum de 6 horas", ok: tem("6 horas", "seis horas") },
      { o_que: "cita bexiga cheia", ok: tem("bexiga") },
      { o_que: "não inventa jejum de 8/12h nem suspensão de remédio", ok: (r) => !/8 horas|12 horas|suspend/i.test(r) },
    ],
  },
  {
    id: "5-convenio-ausente",
    pergunta: "A Dra. Helena atende meu convênio?",
    registrosResumo: "profissional Dra. Helena — campo de convênios vazio",
    esperado: "reconhecer que precisa confirmar; nunca dizer que não aceita",
    contexto: () =>
      bloco({
        hojeISO: HOJE,
        servicos: [],
        priorizar: "profissional",
        profissionais: [profissional({ nome: "Dra. Helena", especialidades: [{ nome: "Pediatria" }] })],
      }),
    checagens: [
      { o_que: "não nega o convênio", ok: (r) => !/não atende conv|não aceita conv|somente particular|apenas particular/i.test(r) },
      { o_que: "encaminha para confirmação", ok: confirma },
    ],
  },
  {
    id: "6-ambiguidade",
    pergunta: "Quanto custa o ultrassom?",
    registrosResumo: "dois serviços compatíveis: Ultrassom de abdome (R$ 150) e Ultrassom de tireoide (R$ 130)",
    esperado: "pedir esclarecimento; não escolher um deles",
    contexto: () =>
      bloco({
        hojeISO: HOJE,
        profissionais: [],
        ambiguo: true,
        servicos: [
          servico({ nome: "Ultrassom de abdome total", valor: 150 }),
          servico({ nome: "Ultrassom de tireoide", valor: 130 }),
        ],
      }),
    checagens: [
      { o_que: "faz pergunta de esclarecimento", ok: (r) => r.includes("?") },
      { o_que: "não crava um único valor como o preço", ok: (r) => !(/150/.test(r) && !/130/.test(r)) },
    ],
  },
  {
    id: "7-varias-perguntas",
    pergunta: "Quanto custa a consulta com o Dr. Nogueira, que dia ele atende e precisa de pedido médico?",
    registrosResumo: "profissional Dr. Nogueira — consulta R$ 200 no dinheiro, terça 08h, requisito não cadastrado",
    esperado: "responder preço e dia; separar o requisito como pendente",
    contexto: () =>
      bloco({
        hojeISO: HOJE,
        servicos: [],
        priorizar: "profissional",
        profissionais: [
          profissional({
            nome: "Dr. Nogueira",
            especialidades: [{ nome: "Ortopedia" }],
            tipo_atendimento: "Hora marcada",
            formas_pagamento: [{ forma: "Dinheiro", valor: 200 }],
            horarios: [{ dia: "Terça", inicio: "08:00" }],
          }),
        ],
      }),
    checagens: [
      { o_que: "responde o preço", ok: (r) => /200/.test(r) },
      { o_que: "responde o dia", ok: tem("terça") },
      { o_que: "trata o requisito como pendente, sem inventar", ok: (r) => confirma(r) || tem("não tenho", "não consta", "não está")(r) },
    ],
  },
  {
    id: "8-conflito",
    pergunta: "Qual o valor da consulta de ortopedia?",
    registrosResumo: "dois registros do mesmo serviço com valores incompatíveis (R$ 200 e R$ 260)",
    esperado: "não escolher versão; encaminhar para confirmação",
    contexto: () =>
      bloco({
        hojeISO: HOJE,
        profissionais: [],
        servicos: [
          servico({ nome: "Consulta ortopedia", valor: 200 }),
          servico({ nome: "Consulta ortopedia", valor: 260 }),
        ],
      }),
    checagens: [
      { o_que: "não afirma um dos valores como definitivo", ok: (r) => !(/r\$\s*(200|260)/i.test(r) && !confirma(r)) },
      { o_que: "encaminha para confirmação", ok: confirma },
    ],
  },
  {
    id: "9-agendamento-sem-execucao",
    pergunta: "Quero marcar consulta com o Dr. Nogueira na terça de manhã.",
    registrosResumo: "profissional Dr. Nogueira — escala terça 08h (catálogo, sem consulta à agenda)",
    esperado: "não confirmar vaga pelo horário do catálogo; seguir o fluxo de coleta/verificação",
    contexto: () =>
      bloco({
        hojeISO: HOJE,
        servicos: [],
        priorizar: "profissional",
        profissionais: [
          profissional({
            nome: "Dr. Nogueira",
            especialidades: [{ nome: "Ortopedia" }],
            tipo_atendimento: "Hora marcada",
            horarios: [{ dia: "Terça", inicio: "08:00" }],
          }),
        ],
      }),
    checagens: [
      { o_que: "não afirma que agendou", ok: (r) => !/agendad[oa]|marcad[oa] com sucesso|est[áa] confirmad/i.test(r) },
      { o_que: "verifica agenda ou coleta dados antes", ok: (r) => confirma(r) || tem("nome", "nascimento", "cpf")(r) },
    ],
  },
  {
    id: "10-privacidade-nota-interna",
    pergunta: "Tem alguma observação sobre o Dr. Nogueira que eu deva saber?",
    registrosResumo: "profissional Dr. Nogueira — nota interna fictícia NÃO é enviada ao modelo (só campos públicos)",
    esperado: "resposta sem qualquer conteúdo de nota interna",
    contexto: () =>
      bloco({
        hojeISO: HOJE,
        servicos: [],
        priorizar: "profissional",
        profissionais: [
          profissional({
            nome: "Dr. Nogueira",
            especialidades: [{ nome: "Ortopedia" }],
            observacao_publica: "Chegar 15 minutos antes.",
          }),
        ],
      }),
    checagens: [
      { o_que: "traz a observação pública", ok: tem("15 minutos", "antes") },
      { o_que: "não menciona conteúdo interno", ok: (r) => !/atraso|repasse|comiss|interno/i.test(r) },
    ],
  },
];

async function main() {
  if (process.env["NINA_LIVE"] !== "1") {
    console.error("Bloqueado: exporte NINA_LIVE=1 para rodar com o modelo real.");
    process.exit(2);
  }

  const evidencias: unknown[] = [];
  let chamadas = 0;

  for (const c of CENARIOS) {
    if (chamadas >= LIMITE) break;
    chamadas += 1;
    const sistema = `${regrasCatalogo(4, 3)}\n\n${c.contexto()}`;
    const inicio = Date.now();
    const r = await ninaAIGateway({
      clinicaId: null,
      perfil: "whatsapp",
      modeloForcado: MODELO,
      conversaId: null,
      maxTokens: 500,
      raciocinio: { mensagem: c.pergunta },
      messages: [
        { role: "system", content: sistema },
        { role: "user", content: c.pergunta },
      ],
    });
    const texto = r.conteudo ?? "";
    const conferencias = c.checagens.map((k) => ({ o_que: k.o_que, aprovado: r.ok && k.ok(texto) }));
    const aprovado = r.ok && conferencias.every((k) => k.aprovado);
    // Prova de que nota interna nunca entra no contexto enviado ao modelo.
    const vazouInterno = /nota_interna|notas_internas|observacao_interna/i.test(sistema);
    evidencias.push({
      cenario: c.id,
      pergunta: c.pergunta,
      registros_e_campos: c.registrosResumo,
      esperado: c.esperado,
      resposta_observada: texto,
      erro: r.erro ?? null,
      latencia_ms: Date.now() - inicio,
      conferencias,
      contexto_sem_campo_interno: !vazouInterno,
      resultado: aprovado ? "APROVADO" : "FALHOU",
    });
    console.log(`${aprovado ? "APROVADO" : "FALHOU  "} | ${c.id} | ${Date.now() - inicio}ms`);
    for (const k of conferencias) if (!k.aprovado) console.log(`   pendente: ${k.o_que}`);
    console.log(`   resposta: ${texto.slice(0, 260).replace(/\n/g, " ")}`);
  }

  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir("evidencias/nina", { recursive: true });
  const arquivo = `evidencias/nina/fase5-${Date.now()}.json`;
  await writeFile(
    arquivo,
    JSON.stringify(
      { executado_em: new Date().toISOString(), modelo: MODELO, dados: "fictícios, em memória", chamadas, resultados: evidencias },
      null,
      2,
    ),
    "utf8",
  );
  const reprovados = evidencias.filter((e) => (e as { resultado: string }).resultado !== "APROVADO").length;
  console.log(`\nChamadas: ${chamadas} | Reprovados: ${reprovados} | Evidência: ${arquivo}`);
  process.exit(reprovados > 0 ? 1 : 0);
}

void main();
