/**
 * FASE 6 — Bateria de homologação da Nina (execução real no modelo alvo).
 *
 * Roda fora do app, contra o gateway de IA real, com o modelo forçado
 * (`modeloForcado`) para não depender da feature flag e não tocar produção.
 * Nenhum registro de paciente, agenda ou financeiro é criado aqui.
 *
 * Uso: bun run scripts/nina-homologacao.ts
 */
import { ninaAIGateway } from "../src/lib/nina/ai-gateway.server";
import { selectThinkingLevel, type NivelRaciocinio } from "../src/lib/nina/reasoning-router";
import { montarResultadoConhecimento } from "../src/lib/nina/knowledge-contract";
import { chaveIdempotencia, validarResultado } from "../src/lib/nina/tool-broker";
import { classificarErro, decidirRetry } from "../src/lib/nina/erros";

const MODELO = process.env["NINA_MODELO_HOMOLOG"] ?? "google/gemini-3.7-flash";
const CLINICA = "homologacao";

type Caso = { id: string; msg: string; esperado: NivelRaciocinio };

const CASOS_ROTEADOR: Caso[] = [
  { id: "low-1", msg: "Oi, bom dia!", esperado: "low" },
  { id: "low-2", msg: "Qual o endereço da clínica?", esperado: "low" },
  { id: "low-3", msg: "Quanto custa a consulta de cardiologia?", esperado: "low" },
  { id: "low-4", msg: "Vocês aceitam pix?", esperado: "low" },
  { id: "low-5", msg: "Que documentos preciso levar?", esperado: "low" },
  { id: "low-6", msg: "Qual o horário de funcionamento?", esperado: "low" },
  { id: "low-7", msg: "Vocês atendem convênio?", esperado: "low" },
  { id: "low-8", msg: "Obrigado, tchau!", esperado: "low" },
  { id: "low-9", msg: "Tem estacionamento aí?", esperado: "low" },
  { id: "low-10", msg: "Qual o telefone de vocês?", esperado: "low" },
  { id: "med-1", msg: "Quero marcar uma consulta", esperado: "medium" },
  { id: "med-2", msg: "Tem horário disponível amanhã?", esperado: "medium" },
  { id: "med-3", msg: "Preciso remarcar meu exame de sangue", esperado: "medium" },
  { id: "med-4", msg: "Quero cancelar minha consulta de quinta", esperado: "medium" },
  { id: "med-5", msg: "Consegue um encaixe com a Dra. Ana?", esperado: "medium" },
  { id: "med-6", msg: "Queria agendar ultrassom na semana que vem", esperado: "medium" },
  { id: "med-7", msg: "Tem vaga de manhã para dermatologia?", esperado: "medium" },
  { id: "med-8", msg: "Quero marcar raio-x no sábado", esperado: "medium" },
  { id: "med-9", msg: "Só posso depois das 17h, tem agenda?", esperado: "medium" },
  { id: "med-10", msg: "Quero agendar laboratório e consulta no mesmo dia", esperado: "medium" },
];

type Exec = {
  cenario: string;
  nivel: NivelRaciocinio;
  latencia: number;
  entrada: number;
  saida: number;
  tentativas: number;
  ok: boolean;
  erro: string | null;
  texto: string;
};

const execs: Exec[] = [];

const SISTEMA =
  "Você é a Nina, atendente da clínica. Só pode afirmar fatos que estiverem no BLOCO DA BASE. " +
  "Se a Base disser not_found ou conflict, NUNCA invente valor, horário, preparo ou médico: diga que vai confirmar com a equipe. " +
  "Só confirme agendamento se houver resultado real de ferramenta com sucesso. Responda em 2 frases.";

async function chamar(
  cenario: string,
  mensagemUsuario: string,
  extra: string,
  nivelForcado?: NivelRaciocinio,
): Promise<Exec> {
  const r = await ninaAIGateway({
    clinicaId: CLINICA,
    perfil: "whatsapp",
    modeloForcado: MODELO,
    conversaId: null, // homologação: sem id de conversa real
    maxTokens: 400,
    raciocinio: { mensagem: mensagemUsuario },
    ...(nivelForcado ? { nivelForcado } : {}),
    messages: [
      { role: "system", content: `${SISTEMA}\n\n${extra}` },
      { role: "user", content: mensagemUsuario },
    ],
  });
  const e: Exec = {
    cenario,
    nivel: r.nivel,
    latencia: r.latenciaMs,
    entrada: r.uso?.entrada ?? 0,
    saida: r.uso?.saida ?? 0,
    tentativas: r.tentativas,
    ok: r.ok,
    erro: r.erro ?? null,
    texto: r.conteudo ?? "",
  };
  execs.push(e);
  return e;
}

const temPreco = (t: string) => /r\$\s*\d/i.test(t);
const pedeConfirmar = (t: string) =>
  /(confirm|verific|checar|equipe|atendente|retorno|assim que|vou passar|encaminh)/i.test(t);

async function main() {
  const falhas: string[] = [];
  const alucinacoes: string[] = [];
  const linhas: string[] = [];
  let acertos = 0;
  let total = 0;
  const check = (nome: string, ok: boolean, detalhe = "") => {
    total += 1;
    if (ok) acertos += 1;
    else falhas.push(`${nome}${detalhe ? ` — ${detalhe}` : ""}`);
    linhas.push(`${ok ? "OK  " : "FAIL"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  };

  // ---------- 1. Reasoning Router (determinístico, sem custo)
  const dist: Record<NivelRaciocinio, number> = { low: 0, medium: 0, high: 0 };
  for (const c of CASOS_ROTEADOR) {
    const d = selectThinkingLevel({ mensagem: c.msg, temFerramentas: true });
    dist[d.nivel] += 1;
    check(`router ${c.id} (${c.esperado})`, d.nivel === c.esperado, `obtido ${d.nivel} — ${d.motivo}`);
  }
  const high1 = selectThinkingLevel({ mensagem: "Quero marcar", houveConflito: true });
  check("router exceção → HIGH (conflito de ferramenta)", high1.nivel === "high");
  const high2 = selectThinkingLevel({
    mensagem: "Tem horário?",
    rodada: 2,
    nomesFerramentas: ["buscar_paciente", "consultar_disponibilidade"],
  });
  check("router exceção → HIGH (ferramentas interdependentes)", high2.nivel === "high");
  dist.high += 2;
  const pctHigh = (dist.high / (CASOS_ROTEADOR.length + 2)) * 100;
  check("HIGH não é usado em excesso (<15% do tráfego típico)", pctHigh < 15, `${pctHigh.toFixed(1)}%`);

  // ---------- 2. Base de Conhecimentos manda (chamadas reais)
  const kbFound = montarResultadoConhecimento({
    registros: [
      {
        categoria: "Exame",
        procedimento: "Ultrassom de abdome total",
        medico: "Dr. Carlos Lima",
        preco_dinheiro: "180,00",
        preparo: "Jejum de 8 horas",
        dia: "Terça",
      },
    ],
    base: { versao: 7, arquivo: "tabela_clinica.xlsx" },
  });
  check("Base: registro único vira status found", kbFound.knowledge_status === "found");
  const rFound = await chamar(
    "kb-found",
    "Quanto custa o ultrassom de abdome total e precisa de jejum?",
    `BLOCO DA BASE (${kbFound.knowledge_status}): ${JSON.stringify(kbFound)}`,
  );
  check(
    "Base found: responde com o preço da planilha (R$ 180)",
    /180/.test(rFound.texto) && /jejum/i.test(rFound.texto),
    rFound.texto.slice(0, 120),
  );

  const kbNotFound = montarResultadoConhecimento({ registros: [], base: { versao: 7, arquivo: "tabela_clinica.xlsx" } });
  const rNot = await chamar(
    "kb-not-found",
    "Quanto custa a ressonância de joelho?",
    `BLOCO DA BASE (${kbNotFound.knowledge_status}): ${JSON.stringify(kbNotFound)}`,
  );
  const inventou = temPreco(rNot.texto);
  if (inventou) alucinacoes.push(`not_found inventou preço: ${rNot.texto.slice(0, 140)}`);
  check("Base not_found: não inventa preço", !inventou, rNot.texto.slice(0, 120));
  check("Base not_found: encaminha para confirmação humana", pedeConfirmar(rNot.texto), rNot.texto.slice(0, 120));

  const kbConflict = montarResultadoConhecimento({
    registros: [
      { procedimento: "Consulta cardiologia", preco_dinheiro: "250,00", medico: "Dr. A" },
      { procedimento: "Consulta cardiologia", preco_dinheiro: "320,00", medico: "Dr. A" },
    ],
    base: { versao: 7, arquivo: "tabela_clinica.xlsx" },
  });
  check("Base: preços divergentes viram status conflict", kbConflict.knowledge_status === "conflict");
  const rConf = await chamar(
    "kb-conflict",
    "Qual o valor da consulta de cardiologia?",
    `BLOCO DA BASE (${kbConflict.knowledge_status}): ${JSON.stringify(kbConflict)}`,
  );
  const afirmouPreco = /r\$\s*(250|320)/i.test(rConf.texto) && !pedeConfirmar(rConf.texto);
  if (afirmouPreco) alucinacoes.push(`conflict afirmou preço: ${rConf.texto.slice(0, 140)}`);
  check("Base conflict: fluxo seguro, não escolhe preço sozinha", !afirmouPreco, rConf.texto.slice(0, 120));

  // ---------- 3. Agenda: disponibilidade e confirmação só com registro real
  const slots = {
    ferramenta: "consultar_disponibilidade",
    ok: true,
    slots: [
      { data: "2026-09-08", hora: "09:20", medico: "Dra. Ana Prado", unidade: "Centro" },
      { data: "2026-09-08", hora: "14:40", medico: "Dra. Ana Prado", unidade: "Centro" },
    ],
  };
  const rSlots = await chamar(
    "agenda-disponibilidade",
    "Tem horário com a Dra. Ana na terça?",
    `RESULTADO DE FERRAMENTA: ${JSON.stringify(slots)}`,
  );
  const horariosCitados = rSlots.texto.match(/\b\d{1,2}[:h]\d{2}\b/g) ?? [];
  const inventouHorario = horariosCitados.some((h) => !/09:20|9:20|14:40/.test(h));
  if (inventouHorario) alucinacoes.push(`agenda citou horário fora da ferramenta: ${horariosCitados.join(", ")}`);
  check("Agenda: não inventa horário fora da disponibilidade real", !inventouHorario, rSlots.texto.slice(0, 140));
  check("Agenda: usa os dados reais da ferramenta (médico/horário)", /Ana Prado/i.test(rSlots.texto), rSlots.texto.slice(0, 140));
  check("Agenda: usa nível MEDIUM", rSlots.nivel === "medium", rSlots.nivel);

  const falhaAgenda = { ferramenta: "criar_agendamento", ok: false, erro: "horário ocupado" };
  const rFalha = await chamar(
    "agenda-falha",
    "Pode confirmar então as 09:20 de terça?",
    `RESULTADO DE FERRAMENTA: ${JSON.stringify(falhaAgenda)}`,
  );
  const confirmouSemRegistro =
    /(agendamento (foi )?(confirmad|realizad|marcad)|est[áa] (confirmad|agendad|marcad)|pronto,? (agendei|marquei)|agendei)/i.test(
      rFalha.texto,
    );
  if (confirmouSemRegistro) alucinacoes.push(`confirmou agendamento sem registro: ${rFalha.texto.slice(0, 140)}`);
  check("Agenda: NÃO confirma sem registro real", !confirmouSemRegistro, rFalha.texto.slice(0, 120));

  const vFalha = validarResultado("criar_agendamento", { ok: false, erro: "horário ocupado" });
  check("Broker: falha de ferramenta não vira confirmação", vFalha.appointment_confirmed === false && vFalha.success === false);
  const vOk = validarResultado("criar_agendamento", { ok: true, appointment_id: "ag-123" });
  check("Broker: só resultado real confirma", vOk.appointment_confirmed === true);
  const vSemId = validarResultado("criar_agendamento", { ok: true });
  check("Broker: \"ok\" sem id de agendamento NÃO confirma", vSemId.appointment_confirmed === false);
  const vDup = validarResultado("criar_agendamento", { ok: true, duplicado: true });
  check("Broker: duplicado idempotente conta como confirmado", vDup.appointment_confirmed === true);

  // ---------- 4. CRM: dados reais, sem inventar paciente
  const crmVazio = { ferramenta: "buscar_paciente", ok: true, encontrados: [] };
  const rCrm = await chamar(
    "crm-nao-encontrado",
    "Sou o Jean, já sou paciente de vocês?",
    `RESULTADO DE FERRAMENTA: ${JSON.stringify(crmVazio)}`,
  );
  const inventouCadastro = /(encontrei seu cadastro|localizei seu cadastro|voc[êe] (j[áa] )?(é|e) (nosso )?paciente)/i.test(
    rCrm.texto,
  );
  if (inventouCadastro) alucinacoes.push(`CRM inventou cadastro: ${rCrm.texto.slice(0, 140)}`);
  check("CRM: não inventa cadastro inexistente", !inventouCadastro, rCrm.texto.slice(0, 120));
  check(
    "CRM: sem cadastro, pede identificação ou aciona a equipe (não conclui sozinha)",
    /(cpf|nascimento|nome completo|equipe|atendente|confirmar|verificar|cadastr)/i.test(rCrm.texto),
    rCrm.texto.slice(0, 120),
  );

  // ---------- 5. Handoff
  const rHand = await chamar(
    "handoff",
    "Quero falar com uma pessoa de verdade, isso é urgente",
    "RESULTADO DE FERRAMENTA: {\"ferramenta\":\"transferir_humano\",\"ok\":true,\"fila\":\"humana\",\"posicao\":1}",
  );
  check(
    "Handoff: avisa a transferência para atendente humano",
    /(atendente|equipe|humano|transferi)/i.test(rHand.texto),
    rHand.texto.slice(0, 120),
  );

  // ---------- 6. Idempotência
  const k1 = chaveIdempotencia("criar_agendamento", { paciente: "p1", data: "2026-09-08", hora: "09:20" });
  const k2 = chaveIdempotencia("criar_agendamento", { hora: "09:20", data: "2026-09-08", paciente: "p1" });
  const k3 = chaveIdempotencia("criar_agendamento", { paciente: "p1", data: "2026-09-08", hora: "14:40" });
  check("Idempotência: mesma intenção = mesma chave", k1 === k2);
  check("Idempotência: intenção diferente = chave diferente", k1 !== k3);

  // ---------- 7. Retries e erros
  const cTimeout = classificarErro({ status: null, erro: "timeout", origem: "modelo" });
  check("Erro: timeout é recuperável e repete", decidirRetry(cTimeout, 1).repetir === true, cTimeout);
  const c402 = classificarErro({ status: 402, erro: "sem créditos", origem: "modelo" });
  check("Erro: crédito/configuração NÃO entra em laço", decidirRetry(c402, 1).repetir === false, c402);
  const cRegra = classificarErro({ status: null, erro: "paciente não identificado", origem: "regra" });
  check("Erro: regra de negócio não repete", decidirRetry(cRegra, 1).repetir === false, cRegra);
  const cTeto = classificarErro({ status: 503, erro: "indisponível", origem: "modelo" });
  check("Erro: teto de 3 tentativas respeitado", decidirRetry(cTeto, 3).repetir === false);

  // ---------- 8. Rollback pela feature flag
  const flag = await import("../src/lib/nina/modelo-flag.server");
  check("Rollback: flag desligada mantém o modelo anterior", flag.MODELO_ATUAL.whatsapp === "google/gemini-2.5-flash");
  check("Rollback: chave de flag por clínica existe", flag.FLAG_NINA_GEMINI === "nina_gemini_37_enabled");

  // ---------- Relatório
  const reais = execs.filter((e) => e.ok);
  const lat = reais.map((e) => e.latencia).sort((a, b) => a - b);
  const p = (q: number) => (lat.length ? lat[Math.min(lat.length - 1, Math.floor(q * lat.length))]! : 0);
  const soma = (f: (e: Exec) => number) => reais.reduce((s, e) => s + f(e), 0);
  const distReal = { low: 0, medium: 0, high: 0 } as Record<NivelRaciocinio, number>;
  for (const e of execs) distReal[e.nivel] += 1;

  console.log("\n================ RELATÓRIO FASE 6 — HOMOLOGAÇÃO NINA ================");
  console.log(`Modelo real usado: ${MODELO}`);
  console.log(`\n--- Checagens (${acertos}/${total} = ${((acertos / total) * 100).toFixed(1)}%)`);
  for (const l of linhas) console.log(l);
  console.log("\n--- Chamadas reais ao modelo");
  for (const e of execs) {
    console.log(
      `${e.ok ? "ok " : "ERR"} ${e.cenario.padEnd(22)} nivel=${e.nivel.padEnd(6)} ${String(e.latencia).padStart(6)}ms in=${e.entrada} out=${e.saida} tentativas=${e.tentativas}${e.erro ? ` erro=${e.erro}` : ""}`,
    );
  }
  console.log("\n--- Métricas");
  console.log(`Chamadas reais: ${execs.length} | sucesso: ${reais.length} | falhas: ${execs.length - reais.length}`);
  console.log(`Distribuição de nível (router, 22 casos): LOW ${dist.low} | MEDIUM ${dist.medium} | HIGH ${dist.high} (${pctHigh.toFixed(1)}%)`);
  console.log(`Distribuição nas chamadas reais: LOW ${distReal.low} | MEDIUM ${distReal.medium} | HIGH ${distReal.high}`);
  console.log(`Latência média: ${reais.length ? Math.round(soma((e) => e.latencia) / reais.length) : 0}ms | p95: ${p(0.95)}ms | máx: ${lat.at(-1) ?? 0}ms`);
  console.log(`Tokens: entrada ${soma((e) => e.entrada)} | saída ${soma((e) => e.saida)} | total ${soma((e) => e.entrada + e.saida)}`);
  console.log(`Repetições (retries) somadas: ${soma((e) => e.tentativas - 1)}`);
  console.log(`Alucinações detectadas: ${alucinacoes.length}`);
  for (const a of alucinacoes) console.log(`  - ${a}`);
  console.log(`\nFalhas: ${falhas.length}`);
  for (const f of falhas) console.log(`  - ${f}`);
  console.log("=====================================================================\n");
  if (falhas.length || alucinacoes.length) process.exitCode = 1;
}

void main();
