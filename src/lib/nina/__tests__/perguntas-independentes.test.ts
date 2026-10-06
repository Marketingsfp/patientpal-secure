import { expect, it } from "bun:test";
import { criarPerguntasDoTurno, comporRespostaParcial } from "../perguntas-independentes";
import {
  conhecimentoDaMesmaSessao,
  normalizarConhecimentoSessao,
  type ConhecimentoSessao,
} from "../confidence/conhecimento-sessao";
import { confirmarItemDaPergunta } from "../identificacao-catalogo";
import type { ResultadoBroker } from "../tool-broker";
import type { ResultadoConhecimento } from "../knowledge-contract";
const pendente = (termo: string): ConhecimentoSessao => ({
  versao: 1,
  clinicaId: "c",
  sessionId: "s",
  consulta: { termo, medico: termo },
  referencias: [{ registro: termo, procedimento: termo, medicoNome: termo, versao: null }],
  esclarecimento: {
    tipo: "procedimento",
    opcoes: [{ id: termo, nome: termo }],
    pergunta: "Você quis dizer " + termo + "?",
  },
  esclarecimentoTentativas: 1,
});
it("mantém perguntas pendentes separadas entre turnos, sem carregar outra clínica ou sessão", () => {
  const turno = criarPerguntasDoTurno(null);
  for (const nome of ["Urologia", "Psiquiatria"])
    turno.registrar({ termo: nome, medico: nome }, pendente(nome), null, false);
  const estado = normalizarConhecimentoSessao(turno.estado(null))!;
  expect(estado.pendenciasIdentificacao).toHaveLength(2);
  expect(conhecimentoDaMesmaSessao(estado, "outra", "s")).toBeNull();
  expect(conhecimentoDaMesmaSessao(estado, "c", "outra")).toBeNull();
  expect(
    confirmarItemDaPergunta(estado, {
      mensagem: "sim",
      historico: [{ role: "assistant", content: estado.esclarecimento!.pergunta }],
    }),
  ).toBeNull();
  const retomada = criarPerguntasDoTurno(estado);
  const args = { termo: "Psiquiatria", medico: "Nome corrigido" };
  const origem = retomada.referencia(args);
  expect(origem?.consulta.termo).toBe("Psiquiatria");
  retomada.registrar(args, { ...pendente("Psiquiatria"), esclarecimento: undefined }, origem, true);
  expect(retomada.estado(null)?.consulta.termo).toBe("Urologia");
  expect(retomada.pendentes).toHaveLength(1);
  expect(retomada.temConfirmadas).toBe(true);
});
it("outra pergunta não consome a tentativa nem apaga a pendência anterior", () => {
  const turno = criarPerguntasDoTurno(pendente("Urologia"));
  const args = { termo: "Psiquiatria", medico: "Antonio", nova_solicitacao: true };
  expect(turno.referencia(args)).toBeNull();
  turno.registrar(args, null, null, true);
  expect(turno.estado(null)?.esclarecimentoTentativas).toBe(1);
  expect(turno.estado(null)?.consulta.termo).toBe("Urologia");
});
it("repetir consulta no mesmo turno não multiplica perguntas", () => {
  const turno = criarPerguntasDoTurno(null);
  for (let i = 0; i < 3; i++) turno.registrar({ termo: "ECG" }, pendente("ECG"), null, false);
  expect(turno.pendentes).toHaveLength(1);
  const resposta = comporRespostaParcial("Consulta confirmada.", turno.pendentes);
  expect(resposta).toContain("Consulta confirmada.");
  expect(resposta.match(/Você quis dizer/g)).toHaveLength(1);
});

it("esclarecimentos com o mesmo texto aparecem uma vez, preservando a resposta independente", () => {
  const p = pendente("ECG");
  const texto = comporRespostaParcial("A consulta de Psiquiatria está confirmada no catálogo.", [p, { ...p, consulta: { termo: "eletrocardiograma" } }]);
  expect(texto.match(/Você quis dizer ECG/g)).toHaveLength(1);
  expect(texto).toContain("Psiquiatria");
});
it("normalização descarta pendências de outra sessão e limita profundidade", () => {
  const p = pendente("ECG");
  const r = normalizarConhecimentoSessao({
    ...p,
    pendenciasIdentificacao: [
      { ...p, sessionId: "outra" },
      { ...p, pendenciasIdentificacao: [p] },
    ],
  })!;
  expect(r.pendenciasIdentificacao).toHaveLength(1);
  expect(r.pendenciasIdentificacao![0]!.pendenciasIdentificacao).toBeUndefined();
});

it("correção explícita não reinicia a tentativa como novo assunto", () => {
  const a = pendente("ECG");
  const turno = criarPerguntasDoTurno(a, "não, é hemograma");
  expect(turno.referencia({ termo: "hemograma", nova_solicitacao: true })).toBe(a);
});

const resultadoExame = (): ResultadoBroker => ({
  ferramenta: "consultar_cadastro", capacidade: "searchKnowledgeBase", fonte: "base_conhecimento",
  success: true, reused: false, appointment_confirmed: false,
  dados: { found: true, knowledge_status: "found", tipo_atendimento: "exame_procedimento",
    records: [{ id: "duo", procedimento: "Densitometria duo energética", preco_cartao: 180 }] },
});
const duvidaExame = (): ConhecimentoSessao => ({ ...pendente("Densitometria coluna lombar e colo de fêmur"),
  consulta: { termo: "Densitometria coluna lombar e colo de fêmur", tipo_atendimento: "exame_procedimento" },
});

it("preserva o exame identificado em reformulações encadeadas, sem copiar fatos", () => {
  const turno = criarPerguntasDoTurno(null);
  const nome = "ULTRASSONOGRAFIA DE RINS E VIAS URINARIAS";
  const estado: ConhecimentoSessao = { ...pendente(nome), esclarecimento: undefined,
    consulta: { termo: nome, tipo_atendimento: "exame_procedimento" },
    referencias: [{ registro: "rins", procedimento: nome, medicoNome: null, versao: "atual" }] };
  turno.registrar(estado.consulta, estado, null, true);
  const ampla = { termo: "rins e vias urinarias", reformula_de: nome };
  const args = JSON.parse(turno.prepararContinuidade("buscar_procedimentos", JSON.stringify(ampla))!);
  expect(args.termo).toBe(nome);
  expect(args).not.toHaveProperty("price");
  expect(JSON.parse(turno.prepararContinuidade("consultar_cadastro", JSON.stringify({
    termo: "ultrassom renal", reformula_de: ampla.termo,
  }))!).termo).toBe(nome);
  // Uma releitura que perdeu o registro não pode reaproveitar a referência.
  turno.registrar(args, null, null, false);
  const novamente = JSON.stringify(ampla);
  expect(turno.prepararContinuidade("buscar_procedimentos", novamente)).toBe(novamente);
});

it("continuidade não substitui pedido independente, tipo diferente, outro médico ou ambiguidade", () => {
  const turno = criarPerguntasDoTurno(null), estado = duvidaExame();
  turno.registrar(estado.consulta, { ...estado, esclarecimento: undefined }, null, true);
  for (const extra of [ { nova_solicitacao: true }, { medico: "Ana" },
    { reformula_de: "inexistente" }, { tipo_atendimento: "consulta" } ]) {
    const args = JSON.stringify({ termo: "outro", reformula_de: estado.consulta.termo, ...extra });
    expect(turno.prepararContinuidade("consultar_cadastro", args)).toBe(args);
  }
  turno.registrar(estado.consulta, estado, null, false);
  const args = JSON.stringify({ termo: "duo", reformula_de: estado.consulta.termo });
  expect(turno.prepararContinuidade("consultar_cadastro", args)).toBe(args);
});

it("reformulação preserva qualificadores, não confirma preço e permite confirmação no próximo turno", () => {
  const turno = criarPerguntasDoTurno(null), original = duvidaExame();
  turno.registrar(original.consulta, original, null, false);
  const args = { termo: "Densitometria duo energética", reformula_de: original.consulta.termo };
  expect(turno.referencia(args)).toBeNull(); // não é outra tentativa do paciente
  const dados = turno.reconciliar(args, resultadoExame()).dados as ResultadoConhecimento;
  expect(dados.price).toBeNull();
  expect(dados.esclarecimento?.pergunta).toContain("coluna lombar e colo de fêmur");
  turno.registrar(args, { ...original, consulta: { termo: args.termo },
    referencias: [{ registro: "duo", versao: null, procedimento: "Densitometria duo energética", medicoNome: null }],
    esclarecimento: dados.esclarecimento }, null, false);
  const salvo = normalizarConhecimentoSessao(turno.estado(null))!;
  expect(turno.pendentes).toHaveLength(1);
  expect(turno.temConfirmadas).toBe(false);
  expect(confirmarItemDaPergunta(salvo, { mensagem: "sim", historico: [{ role: "assistant", content: salvo.esclarecimento!.pergunta }] })?.id).toBe("duo");
  const proximo = criarPerguntasDoTurno(salvo, "sim");
  const r = resultadoExame();
  expect(proximo.reconciliar({ termo: args.termo }, r)).toBe(r);
  proximo.registrar({ termo: args.termo }, { ...salvo, esclarecimento: undefined }, proximo.referencia({ termo: args.termo }), true);
  expect(proximo.pendentes).toHaveLength(0);
});

it("não associa por semelhança de nomes, referência inexistente, outro médico ou pedido independente", () => {
  for (const args of [
    { termo: "Densitometria corpo inteiro" },
    { termo: "Densitometria duo energética", reformula_de: "inexistente" },
    { termo: "Densitometria duo energética", reformula_de: duvidaExame().consulta.termo, medico: "Outro médico" },
    { termo: "Densitometria duo energética", reformula_de: duvidaExame().consulta.termo, nova_solicitacao: true },
  ]) {
    const turno = criarPerguntasDoTurno(null), original = duvidaExame(), r = resultadoExame();
    turno.registrar(original.consulta, original, null, false);
    expect(turno.reconciliar(args, r)).toBe(r);
    turno.registrar(args, null, null, true);
    expect(turno.pendentes).toHaveLength(1);
    expect(turno.temConfirmadas).toBe(true);
  }
});

it("conflito oficial e falha técnica não viram hipótese de equivalência", () => {
  const turno = criarPerguntasDoTurno(null), original = duvidaExame();
  turno.registrar(original.consulta, original, null, false);
  const args = { termo: "Densitometria duo energética", reformula_de: original.consulta.termo };
  for (const r of [{ ...resultadoExame(), dados: { knowledge_status: "conflict" } },
    { ...resultadoExame(), success: false, erro: "TIMEOUT" }]) expect(turno.reconciliar(args, r)).toBe(r);
});

// Homologação 06/10/2026 — perguntas coladas no fim da resposta.
const comOpcoes = (termo: string, nomes: string[], tipo: "consulta" | "exame_procedimento" = "exame_procedimento"): ConhecimentoSessao => ({
  ...pendente(termo),
  consulta: { termo, tipo_atendimento: tipo },
  esclarecimento: { tipo: "procedimento", opcoes: nomes.map((nome) => ({ id: nome, nome })),
    pergunta: `Para o pedido “${termo}”, pode conferir qual nome corresponde ao pedido médico?\n${nomes.join("\n")}` },
});
const resultadoMedicos = (): ResultadoBroker => ({
  ferramenta: "buscar_medicos", capacidade: "listCatalog", fonte: "base_conhecimento",
  success: true, reused: false, appointment_confirmed: false,
  dados: { found: true, knowledge_status: "found", records: [{ id: "aline", procedimento: "FONOAUDIOLOGIA" }] },
});

it("profissionais da especialidade não viram pergunta sobre o nome do pedido médico", () => {
  // Ordem do caso da odontologia: procedimento ambíguo antes da busca de médicos.
  const turno = criarPerguntasDoTurno(null, "tem fonoaudiologa pra crianca de 5 anos?");
  turno.registrar({ termo: "fonoaudiologia" }, comOpcoes("fonoaudiologia", ["TESTE DA ORELHINHA", "AUDIOMETRIA"]), null, false);
  expect(turno.pendentes).toHaveLength(1);
  const args = { especialidade: "fonoaudiologia" }, r = resultadoMedicos();
  expect(turno.reconciliar(args, r, "buscar_medicos")).toBe(r);
  turno.registrar(args, null, null, false);
  expect(turno.pendentes).toHaveLength(0);
});

it("reformulação de procedimento pela busca de procedimentos continua virando pergunta", () => {
  const turno = criarPerguntasDoTurno(null), original = duvidaExame();
  turno.registrar(original.consulta, original, null, false);
  const args = { termo: "Densitometria duo energética", reformula_de: original.consulta.termo };
  const r = { ...resultadoExame(), ferramenta: "buscar_procedimentos", capacidade: "listCatalog" as const,
    dados: { ...(resultadoExame().dados as object), tipo_atendimento: undefined } };
  expect((turno.reconciliar(args, r, "buscar_procedimentos").dados as ResultadoConhecimento).esclarecimento).toBeTruthy();
});

const FISIO = ["FISIOTERAPIA PELVICA", "FISIOTERAPIA RESPIRATORIA (5 SESSOES)", "FISIOTERAPIA INFANTIL (5 SESSOES)", "FISIOTERAPIA OCULAR", "FISIOTERAPIA (5 SESSOES)"];
const pendenciasFisio = () => [
  comOpcoes("fisioterapia", FISIO), comOpcoes("FISIOTERAPIA (5 SESSOES)", FISIO), comOpcoes("sessao de fisioterapia", ["FISIOTERAPIA (5 SESSOES)"]),
];

it("não repete a lista que o texto da Nina já apresentou", () => {
  const texto = "Qual destas opções corresponde ao seu pedido médico?\n• " + FISIO.join("\n• ");
  expect(comporRespostaParcial(texto, pendenciasFisio())).toBe(texto);
});

it("reformulações com as mesmas opções geram uma única pergunta", () => {
  const resposta = comporRespostaParcial("Fazemos fisioterapia na clínica.", pendenciasFisio());
  expect(resposta.match(/FISIOTERAPIA PELVICA/g)).toHaveLength(1);
  expect(resposta).not.toContain("sessao de fisioterapia");
  expect(resposta).toContain("Fazemos fisioterapia na clínica.");
});

it("pedidos diferentes continuam com uma pergunta cada", () => {
  const resposta = comporRespostaParcial("Glicose: R$ 10,00.", [
    comOpcoes("hemograma", ["HEMOGRAMA COMPLETO", "HEMOGRAMA COM PLAQUETAS"]),
    comOpcoes("tsh", ["TSH", "TSH ULTRASSENSIVEL"]),
  ]);
  expect(resposta).toContain("“hemograma”");
  expect(resposta).toContain("“tsh”");
});

it("consulta já confirmada no turno não vira pergunta pela busca de procedimentos com o mesmo nome", () => {
  const turno = criarPerguntasDoTurno(null, "tem fonoaudiologa pra crianca de 5 anos?");
  const consultaFono = { ...comOpcoes("fonoaudiologia", [], "consulta"), esclarecimento: undefined };
  turno.registrar({ termo: "fonoaudiologia", tipo_atendimento: "consulta" }, consultaFono, null, true);
  turno.registrar({ termo: "fonoaudiologia" }, comOpcoes("fonoaudiologia", ["TESTE DA ORELHINHA", "AUDIOMETRIA"]), null, false);
  expect(turno.pendentes).toHaveLength(0);
  expect(turno.temConfirmadas).toBe(true);
  // Outro assunto do mesmo turno continua podendo virar pergunta.
  turno.registrar({ termo: "audiometria" }, comOpcoes("audiometria", ["AUDIOMETRIA TONAL", "AUDIOMETRIA VOCAL"]), null, false);
  expect(turno.pendentes).toHaveLength(1);
});

// Regra confirmada 06/10/2026 (opção B): a Nina não escolhe a variante pelo paciente.
// Formato real de buscar_procedimentos (registros/procedimento/preco), como em produção.
const resultadoProcedimento = (nome: string): ResultadoBroker => ({
  ferramenta: "buscar_procedimentos", capacidade: "listCatalog", fonte: "base_conhecimento",
  success: true, reused: false, appointment_confirmed: false,
  dados: { ok: true, fonte: "catalogo_publicado", knowledge_status: "found", procedimento: nome, preco: 200,
    registros: [{ id: nome, procedimento: nome, preco_dinheiro: 200, preco_cartao: 220 }] },
});
// Formato de consultar_cadastro (records/procedure/price).
const resultadoCadastro = (nome: string): ResultadoBroker => ({
  ferramenta: "consultar_cadastro", capacidade: "searchKnowledgeBase", fonte: "base_conhecimento",
  success: true, reused: false, appointment_confirmed: false,
  dados: { found: true, knowledge_status: "found", procedure: nome, price: 200,
    records: [{ id: nome, procedimento: nome, preco_dinheiro: 200, preco_cartao: 220 }] },
});

it("opção escolhida pela Nina dentro da dúvida não libera preço e mantém a pergunta", () => {
  const turno = criarPerguntasDoTurno(null, "o ortopedista passou 10 sessoes de fisioterapia pro meu joelho, quanto fica?");
  turno.registrar({ termo: "fisioterapia", tipo_atendimento: "exame_procedimento" }, comOpcoes("fisioterapia", FISIO), null, false);
  const dados = turno.reconciliar({ termo: "FISIOTERAPIA (5 SESSOES)" }, resultadoProcedimento("FISIOTERAPIA (5 SESSOES)"), "buscar_procedimentos")
    .dados as ResultadoConhecimento & Record<string, unknown>;
  expect(dados.preco).toBeNull();
  expect(dados.procedimento).toBeNull();
  expect(dados.registros).toEqual([]);
  expect(dados.esclarecimento?.opcoes.map((o) => o.nome)).toEqual(FISIO);
  expect(String(dados.instrucao)).toContain("ainda não escolheu");
  // O mesmo vale quando a Nina relê pelo consultar_cadastro.
  const turno2 = criarPerguntasDoTurno(null, "o ortopedista passou 10 sessoes de fisioterapia pro meu joelho");
  turno2.registrar({ termo: "fisioterapia", tipo_atendimento: "exame_procedimento" }, comOpcoes("fisioterapia", FISIO), null, false);
  const cadastro = turno2.reconciliar({ termo: "FISIOTERAPIA (5 SESSOES)" }, resultadoCadastro("FISIOTERAPIA (5 SESSOES)"), "consultar_cadastro")
    .dados as ResultadoConhecimento;
  expect(cadastro.price).toBeNull();
  expect(cadastro.records).toEqual([]);
});

it("opção escrita pelo paciente vale normalmente", () => {
  const turno = criarPerguntasDoTurno(null, "quero saber da fisioterapia ocular");
  turno.registrar({ termo: "fisioterapia", tipo_atendimento: "exame_procedimento" }, comOpcoes("fisioterapia", FISIO), null, false);
  const r = resultadoProcedimento("FISIOTERAPIA OCULAR");
  expect(turno.reconciliar({ termo: "FISIOTERAPIA OCULAR" }, r, "buscar_procedimentos")).toBe(r);
});

it("dúvida de mensagem anterior e dúvida de consulta não bloqueiam a busca", () => {
  const anterior = criarPerguntasDoTurno(comOpcoes("fisioterapia", FISIO), "a de 5 sessoes");
  const r = resultadoProcedimento("FISIOTERAPIA (5 SESSOES)");
  expect(anterior.reconciliar({ termo: "FISIOTERAPIA (5 SESSOES)" }, r, "buscar_procedimentos")).toBe(r);
  const consulta = criarPerguntasDoTurno(null, "quero clinico geral");
  consulta.registrar({ termo: "clinico", tipo_atendimento: "consulta" }, comOpcoes("clinico", ["CLINICO GERAL", "CLINICA MEDICA"], "consulta"), null, false);
  const c = resultadoProcedimento("CLINICO GERAL");
  expect(consulta.reconciliar({ termo: "CLINICO GERAL" }, c, "buscar_medicos")).toBe(c);
});

it("procedimento 'CONSULTA X' ambíguo não vira pergunta quando a consulta de X já foi confirmada (nas duas ordens)", () => {
  const confirmar = (turno: ReturnType<typeof criarPerguntasDoTurno>, termo: string) =>
    turno.registrar({ especialidade: termo }, { ...comOpcoes(termo, [], "consulta"), esclarecimento: undefined }, null, true);
  const ambiguo = (turno: ReturnType<typeof criarPerguntasDoTurno>, termo: string, nomes: string[]) =>
    turno.registrar({ termo }, comOpcoes(termo, nomes), null, false);
  // Ordem real de 06/10 18:26: médicos confirmados e depois "CONSULTA ODONTOLOGIA" como procedimento.
  const depois = criarPerguntasDoTurno(null, "vcs tem dentista? e fonoaudiologa?");
  confirmar(depois, "ODONTOLOGIA");
  confirmar(depois, "FONOAUDIOLOGIA");
  ambiguo(depois, "CONSULTA ODONTOLOGIA", ["EXTRACAO", "PLACA DE BRUXISMO"]);
  ambiguo(depois, "CONSULTA FONOAUDIOLOGIA", ["TESTE DA ORELHINHA", "AUDIOMETRIA"]);
  expect(depois.pendentes).toHaveLength(0);
  // Ordem inversa: a consulta confirmada depois resolve a dúvida do mesmo assunto.
  const antes = criarPerguntasDoTurno(null, "vcs tem dentista?");
  ambiguo(antes, "CONSULTA ODONTOLOGIA", ["EXTRACAO", "PLACA DE BRUXISMO"]);
  expect(antes.pendentes).toHaveLength(1);
  confirmar(antes, "ODONTOLOGIA");
  expect(antes.pendentes).toHaveLength(0);
  // Outro assunto continua sendo perguntado.
  ambiguo(antes, "audiometria", ["AUDIOMETRIA TONAL", "AUDIOMETRIA VOCAL"]);
  expect(antes.pendentes).toHaveLength(1);
});
