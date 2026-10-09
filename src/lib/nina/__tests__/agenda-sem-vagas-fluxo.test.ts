import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));
function simular(ambiente: string, cenario: string) {
  const p = Bun.spawnSync([process.execPath, fixture, ambiente, cenario], {
    cwd: fileURLToPath(new URL("../../../../../", import.meta.url)),
    stdout: "pipe",
    stderr: "pipe",
    timeout: 15_000,
  });
  const output = p.stdout.toString();
  expect(p.exitCode, output + p.stderr.toString()).toBe(0);
  const linha = output.split(/\r?\n/).find((l) => l.startsWith("DIRETA_RESULTADO="));
  expect(linha).toBeDefined();
  return JSON.parse(linha!.slice("DIRETA_RESULTADO=".length));
}

describe("geração real interrompe o turno após agenda sem vagas (serviços externos simulados)", () => {
  for (const ambiente of ["producao", "homologacao"]) {
    test(`${ambiente}: consultas com fatos novos param no teto de seis e respondem com o que foi achado`, () => {
      const r = simular(ambiente, "progresso_longo");
      expect(r.requests).toHaveLength(7);
      expect(r.requests.slice(0, 6).every((req: any) => req.tools?.length > 0)).toBe(true);
      expect(r.requests.at(-1).tools).toBeUndefined();
      expect(r.ferramentas.filter((n: string) => n === "consultar_disponibilidade")).toHaveLength(
        6,
      );
      expect(
        r.etapas.some(
          (e: { titulo: string }) =>
            e.titulo === "Limite de consultas do turno atingido: concluir resposta",
        ),
      ).toBe(true);
      expect(r.encaminhamentos).toHaveLength(0);
      expect(r.resposta).toContain("Qual data você prefere?");
      expect(r.rede).toBe(0);
    });
    test(`${ambiente}: lista de itens do catálogo ganha o teto ampliado (oito consultas independentes)`, () => {
      const r = simular(ambiente, "progresso_longo_informativo");
      expect(r.requests).toHaveLength(9);
      expect(r.ferramentas.filter((n: string) => n === "consultar_cadastro")).toHaveLength(8);
      expect(r.encaminhamentos).toHaveLength(0);
    });
    for (const desfecho of ["aprovada", "reprovada"]) {
      test(`${ambiente}: Jev mantém uma correção e reconferência mesmo após o teto de consultas (${desfecho})`, () => {
        const r = simular(ambiente, `progresso_longo_jev_${desfecho}`);
        expect(r.requests).toHaveLength(8);
        expect(r.requests.at(-1).tools).toBeUndefined();
        expect(r.conferencias).toHaveLength(2);
        expect(r.conferencias.map((c: any) => c.jaCorrigida)).toEqual([false, true]);
        expect(r.ferramentas).toHaveLength(6);
        expect(r.encaminhamentos).toHaveLength(0);
        expect(r.resposta).toContain(
          desfecho === "aprovada" ? "Qual data você prefere?" : "preciso conferir essa informação",
        );
      });
    }
    for (const cenario of ["resposta_vazia_recuperada", "resposta_vazia_persistente"]) {
      test(`${ambiente}: resposta vazia tenta síntese sem ferramentas e sem transferência (${cenario})`, () => {
        const r = simular(ambiente, cenario);
        // Persistente: síntese vazia ganha uma nova tentativa só em texto antes da pergunta padrão.
        expect(r.requests).toHaveLength(cenario.endsWith("recuperada") ? 2 : 3);
        expect(r.requests.at(-1).tools).toBeUndefined();
        expect(r.encaminhamentos).toHaveLength(0);
        expect(r.resposta).toContain(
          cenario.endsWith("recuperada") ? "Posso ajudar" : "Você prefere que eu tente novamente",
        );
      });
    }
    test(`${ambiente}: reserva afirmada sem gravação é reescrita sem desculpas e sem parecer enviada`, () => {
      const r = simular(ambiente, "falso_sucesso_reserva");
      expect(r.requests).toHaveLength(2);
      const correcao = r.requests[1].messages;
      // O rascunho barrado não entra no histórico como resposta enviada.
      expect(
        correcao.some(
          (m: any) => m.role === "assistant" && String(m.content ?? "").includes("reservei"),
        ),
      ).toBe(false);
      const instrucao = correcao.filter((m: any) => m.role === "system").at(-1).content;
      expect(instrucao).toContain("NÃO foi enviado ao paciente");
      expect(instrucao).toContain("não peça desculpas");
      expect(r.resposta).toContain("Você escolheu quinta às 15:30");
      expect(r.resposta).not.toContain("reservei");
      expect(r.encaminhamentos).toHaveLength(0);
      expect(
        r.etapas.some(
          (e: { titulo: string }) =>
            e.titulo === "Afirmação de reserva sem gravação: resposta reescrita antes do envio",
        ),
      ).toBe(true);
    });
    test(`${ambiente}: encerra consultas repetidas com as alternativas confirmadas`, () => {
      const r = simular(ambiente, "loop_alternativas");
      expect(r.requests).toHaveLength(3);
      expect(r.requests.at(-1).tools).toBeUndefined();
      expect(r.requests.at(-1).raciocinio.temFerramentas).toBe(false);
      expect(r.resposta).toContain("22/01 às 14:00");
      expect(r.encaminhamentos).toHaveLength(0);
      expect(r.ferramentas).not.toContain("agendar");
      expect(r.rede).toBe(0);
    });
    for (const cenario of ["loop_alternativas_vazio", "loop_alternativas_ignora"]) {
      test(`${ambiente}: síntese que falha pede escolha sem encaminhar (${cenario})`, () => {
        const r = simular(ambiente, cenario);
        expect(r.requests).toHaveLength(4);
        expect(r.encaminhamentos).toHaveLength(0);
        expect(r.resposta).toContain("Você prefere que eu tente novamente ou encaminhe");
        expect(r.ferramentas).not.toContain("agendar");
      });
    }
    test(`${ambiente}: encaminha uma vez, informa o motivo e não espera seis rodadas`, () => {
      const r = simular(ambiente, "sem_vagas");
      expect(r.requests).toHaveLength(1);
      expect(r.encaminhamentos).toHaveLength(1);
      expect(r.encaminhamentos[0].motivo).toContain("AGENDA_SEM_VAGAS");
      expect(r.encaminhamentos[0].resumo).toContain("jorge");
      expect(r.resposta).toContain("Não encontrei vagas disponíveis");
      expect(r.resposta).toContain("Encaminhei sua conversa");
      expect(r.ferramentas).not.toContain("agendar");
      expect(r.motorChamado).toBe(0);
      expect(r.rede).toBe(0);
      const evento = r.etapas.find(
        (e: { titulo: string }) => e.titulo === "Encaminhamento por ausência de vagas",
      );
      expect(evento.dados).toMatchObject({
        origem_solicitacao: "servidor",
        handoff_confirmado: true,
      });
      expect(r.finalizacao.resultado.origem).toBe("handoff");
      expect(JSON.stringify(r.encaminhamentos)).not.toContain("LIMITE_RODADAS");
    });
    test(`${ambiente}: transferência que falhou não é anunciada como concluída`, () => {
      const r = simular(ambiente, "falha_handoff");
      expect(r.requests).toHaveLength(1);
      expect(r.encaminhamentos).toHaveLength(1);
      expect(r.resposta).toContain("não consegui transferir");
      expect(r.resposta).not.toContain("Transferido para atendimento humano");
      expect(r.ferramentas).not.toContain("agendar");
    });
    for (const cenario of ["alternativas"]) {
      test(`${ambiente}: ${cenario} não dispara transferência por agenda vazia`, () => {
        const r = simular(ambiente, cenario);
        expect(r.encaminhamentos).toHaveLength(0);
        expect(r.requests).toHaveLength(2);
      });
    }
    for (const cenario of ["falha_consulta", "falha_vinculo", "falha_selecao"]) {
      test(`${ambiente}: ${cenario} encaminha pela causa operacional, sem alegar ausência`, () => {
        const r = simular(ambiente, cenario);
        expect(r.encaminhamentos).toHaveLength(1);
        expect(r.encaminhamentos[0].motivo).toContain("FALHA_OPERACIONAL_AGENDAMENTO");
        expect(r.requests).toHaveLength(1);
        expect(r.resposta).toContain("Não consegui concluir seu agendamento");
        expect(r.resposta).not.toMatch(/Não encontrei|sem vagas|base de conhecimentos/);
        expect(r.ferramentas).not.toContain("agendar");
        expect(
          r.etapas.some(
            (e: { titulo: string }) =>
              e.titulo === "Encaminhamento por falha operacional no agendamento",
          ),
        ).toBe(true);
        expect(r.rede).toBe(0);
      });
    }
    test(`${ambiente}: mensagem nova durante a consulta impede transferência do turno antigo`, () => {
      const r = simular(ambiente, "obsoleto");
      expect(r.encaminhamentos).toHaveLength(0);
      expect(r.requests).toHaveLength(1);
    });
  }
});
