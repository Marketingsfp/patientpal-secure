import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { REGRA_HORARIOS_HABITUAIS_PRIMEIRO } from "../prompt/consulta-agenda";

// Núcleo compartilhado real; modelo, catálogo e agenda simulados, sem rede.
// A comparação real das nove agendas é coberta pela suíte do executor.
const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));
type Mensagem = { role: string; content?: string };
type Resultado = {
  rede: number;
  requests: { messages: Mensagem[] }[];
  ferramentas: string[];
  encaminhamentos: { motivo: string }[];
  resposta: string;
};
for (const ambiente of ["producao", "homologacao"])
  for (const escolha of ["inicial", "primeiro", "primeiro_inicial", "escolher", "escolher_oito"])
    test(`${ambiente}: limite da lista respeita a escolha ${escolha}`, () => {
      const p = Bun.spawnSync([process.execPath, fixture, ambiente, `catalogo_lista_${escolha}`], {
        stdout: "pipe",
        stderr: "pipe",
        timeout: 15000,
      });
      expect(p.exitCode, p.stdout.toString() + p.stderr.toString()).toBe(0);
      const linha = p.stdout
        .toString()
        .split(/\r?\n/)
        .find((l) => l.startsWith("DIRETA_RESULTADO="))!;
      const r: Resultado = JSON.parse(linha.slice("DIRETA_RESULTADO=".length));
      expect(r.rede).toBe(0);
      expect(
        r.requests[0].messages
          .filter((m) => m.role === "system")
          .map((m) => m.content)
          .join("\n"),
      ).toContain(REGRA_HORARIOS_HABITUAIS_PRIMEIRO);
      expect(r.ferramentas).toContain("consultar_cadastro");
      expect(r.ferramentas).not.toContain("agendar");
      if (escolha === "escolher") {
        expect(r.requests).toHaveLength(1);
        expect(r.encaminhamentos).toHaveLength(1);
        expect(r.encaminhamentos[0].motivo).toContain(
          "LISTA_PROFISSIONAIS_EXTENSA: 9 profissionais",
        );
        expect(r.ferramentas).not.toContain("consultar_primeiro_disponivel");
      } else {
        expect(r.encaminhamentos).toHaveLength(0);
        if (escolha === "inicial") {
          expect(r.requests).toHaveLength(2);
          expect(r.resposta).toContain("Temos atendimento em Cardiologia");
          expect(r.resposta).toContain(
            "Você prefere o primeiro horário disponível ou deseja escolher entre os profissionais?",
          );
          expect(r.resposta).not.toContain("Amanda Souza");
          expect(r.ferramentas).not.toContain("consultar_primeiro_disponivel");
        } else if (escolha.startsWith("primeiro")) {
          expect(
            r.ferramentas.filter((n: string) => n === "consultar_primeiro_disponivel"),
          ).toHaveLength(1);
          expect(r.resposta).toContain("Isabel Martins");
          expect(r.resposta).not.toContain("Amanda Souza");
          expect(r.resposta).toContain("Esse horário serve?");
          const historico = r.requests[0].messages.filter((m) => m.role === "assistant");
          expect(
            historico.some((m) => m.content?.includes("deseja escolher entre os profissionais?")),
          ).toBe(escolha === "primeiro");
        } else {
          expect(r.resposta).toContain("Amanda Souza");
          expect(r.resposta).toContain("Hugo Moreira");
          expect(r.resposta).toContain("Com qual deseja agendar?");
        }
      }
    });
