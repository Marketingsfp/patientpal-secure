import { describe, expect, it } from "bun:test";
import {
  avisosOficiaisDaMensagem,
  execucaoOficialDaMensagem,
  mensagemNinaInspecionavel,
} from "../inspecao-mensagem";
import { validarMensagemNina } from "../erro-rapido";
import { carregarSaidasDasMensagens } from "../saida-mensagem.server";
import { hashDoTexto } from "../confidence/hash";

const mensagem = {
  id: "m1",
  clinica_id: "c1",
  conversa_id: "v1",
  direction: "out",
  enviada_por: "sistema",
  status: "sent",
  execucao_id: null,
  body: "A equipe vai continuar por aqui.",
  tipo: "text",
  is_teste: false,
};
const aviso = {
  clinica_id: "c1",
  conversa_id: "v1",
  mensagem_id: "m1",
  execucao_id: "e1",
  turno_id: "t1",
  protocolo: "MJ-67",
  estado: "enviado_confirmado",
};

export function bancoInspecao(tabelas: Record<string, Record<string, unknown>[]>, falha?: string) {
  const consultas: { tabela: string; filtros: [string, unknown][] }[] = [];
  const cliente = {
    from(tabela: string) {
      const registro = { tabela, filtros: [] as [string, unknown][] };
      consultas.push(registro);
      let unica = false;
      const q = {
        select: () => q,
        eq: (campo: string, valor: unknown) => {
          registro.filtros.push([campo, valor]);
          return q;
        },
        in: (campo: string, valor: unknown[]) => {
          registro.filtros.push([campo, valor]);
          return q;
        },
        order: () => q,
        limit: () => q,
        maybeSingle: () => {
          unica = true;
          return q;
        },
        then(resolve: (r: unknown) => unknown) {
          const linhas = (tabelas[tabela] ?? []).filter((r) =>
            registro.filtros.every(([k, v]) => (Array.isArray(v) ? v.includes(r[k]) : r[k] === v)),
          );
          return Promise.resolve(
            resolve({
              data: unica ? (linhas[0] ?? null) : linhas,
              error: falha === tabela ? { message: "indisponível" } : null,
            }),
          );
        },
      };
      return q;
    },
  } as unknown as Parameters<typeof carregarSaidasDasMensagens>[0];
  return { cliente, consultas };
}

describe("autoria comprovada da inspeção e reporte", () => {
  it("aceita aviso legado sem execução na mensagem pelo vínculo oficial", () => {
    expect(mensagemNinaInspecionavel(mensagem, [aviso], "c1")).toBe(true);
    expect(execucaoOficialDaMensagem(mensagem, [aviso], "c1")).toBe("e1");
    expect(validarMensagemNina(mensagem, "v1", { clinicaId: "c1", avisos: [aviso] })).toEqual({
      ok: true,
      snapshot: mensagem.body,
    });
  });
  it("um execucao_id isolado não transforma mensagem do sistema em resposta da Nina", () => {
    expect(mensagemNinaInspecionavel({ ...mensagem, execucao_id: "e1" }, [], "c1")).toBe(false);
  });
  for (const adulteracao of [
    { clinica_id: "c2" },
    { conversa_id: "v2" },
    { mensagem_id: "m2" },
    { conversa_id: null },
  ]) {
    it(`recusa vínculo fora do escopo ${JSON.stringify(adulteracao)}`, () => {
      const prova = [{ ...aviso, ...adulteracao }];
      expect(avisosOficiaisDaMensagem(mensagem, prova, "c1")).toHaveLength(0);
      expect(validarMensagemNina(mensagem, "v1", { clinicaId: "c1", avisos: prova }).ok).toBe(
        false,
      );
    });
  }
  for (const adulteracao of [
    { direction: "in" },
    { enviada_por: "humano" },
    { status: "system" },
  ]) {
    it(`não libera paciente, humano ou evento interno ${JSON.stringify(adulteracao)}`, () => {
      expect(mensagemNinaInspecionavel({ ...mensagem, ...adulteracao }, [aviso], "c1")).toBe(false);
    });
  }
  it("não escolhe uma execução quando os vínculos oficiais divergem", () => {
    expect(execucaoOficialDaMensagem({ ...mensagem, execucao_id: "e2" }, [aviso], "c1")).toBeNull();
  });
  it("reporte de áudio preserva a transcrição e não usa o marcador visual", () => {
    expect(
      validarMensagemNina(
        {
          ...mensagem,
          enviada_por: "nina",
          tipo: "audio",
          body: "[áudio]",
          transcricao: "Olá!\nComo posso ajudar?",
        },
        "v1",
      ),
    ).toEqual({ ok: true, snapshot: "Olá!\nComo posso ajudar?" });
  });
});

describe("leitura compartilhada das saídas", () => {
  const dados = { clinicaId: "c1", conversaId: "v1", mensagemIds: ["m1"] };
  function preparar(falha?: string, isTeste = false) {
    const tabelas = {
      whatsapp_mensagens: [{ ...mensagem, is_teste: isTeste }],
      atend_aviso_encaminhamento: [aviso],
      nina_confianca_vinculos: [],
      nina_confianca_decisoes: [
        {
          id: "d1",
          clinica_id: "c1",
          conversation_id: "v1",
          execucao_id: "e1",
          outgoing_message_id: null,
          avaliacao: "answer_confidence",
          score: 0,
          nivel: "LOW",
          representacao: "texto_completo",
          texto_final_hash: hashDoTexto("Olá! Como posso ajudar?"),
        },
      ],
    };
    return { tabelas, ...bancoInspecao(tabelas, falha) };
  }
  for (const isTeste of [false, true]) {
    it(`MJ67 ${isTeste ? "homologação" : "real"}: aviso tem detalhes e não carrega notas do motor`, async () => {
      const { cliente } = preparar(undefined, isTeste);
      const [saida] = await carregarSaidasDasMensagens(cliente, dados);
      expect(saida).toMatchObject({
        inspecionavel: true,
        execucaoId: "e1",
        classe: "aviso_operacional",
        score: null,
        nivel: null,
      });
      expect(saida!.avaliacoes).toEqual([]);
    });
  }
  for (const tabela of [
    "whatsapp_mensagens",
    "atend_aviso_encaminhamento",
    "nina_confianca_vinculos",
  ]) {
    it(`falha em ${tabela} não vira Não avaliada`, async () => {
      await expect(carregarSaidasDasMensagens(preparar(tabela).cliente, dados)).rejects.toThrow();
    });
  }
  it("indisponibilidade do motor não interfere na leitura de saídas", async () => {
    const { cliente, consultas } = preparar("nina_confianca_decisoes");
    const [saida] = await carregarSaidasDasMensagens(cliente, dados);
    expect(saida?.inspecionavel).toBe(true);
    expect(saida?.avaliacoes).toEqual([]);
    expect(consultas.some((c) => c.tabela === "nina_confianca_decisoes")).toBe(false);
  });
  it("não devolve mensagem de outra conversa/clínica solicitada pelo cliente", async () => {
    const { cliente } = preparar();
    expect(await carregarSaidasDasMensagens(cliente, { ...dados, conversaId: "v2" })).toEqual([]);
    expect(await carregarSaidasDasMensagens(cliente, { ...dados, clinicaId: "c2" })).toEqual([]);
  });
  it("nota do texto não é reutilizada no áudio com outra representação", async () => {
    const texto = "Olá! Como posso ajudar?";
    const { cliente } = bancoInspecao({
      whatsapp_mensagens: [
        {
          ...mensagem,
          enviada_por: "nina",
          execucao_id: "e1",
          tipo: "audio",
          body: "[áudio]",
          transcricao: texto,
        },
      ],
      nina_confianca_decisoes: [
        {
          id: "d1",
          clinica_id: "c1",
          conversation_id: "v1",
          execucao_id: "e1",
          outgoing_message_id: "m1",
          avaliacao: "answer_confidence",
          score: 96,
          nivel: "HIGH",
          representacao: "texto_completo",
          texto_final_hash: hashDoTexto(texto),
        },
      ],
    });
    const [saida] = await carregarSaidasDasMensagens(cliente, dados);
    expect(saida?.score).toBeNull();
    expect(saida?.avaliacoes).toEqual([]);
  });
  it("mensagem antiga continua acessível sem importar sua avaliação", async () => {
    const { cliente } = bancoInspecao({
      whatsapp_mensagens: [{ ...mensagem, enviada_por: "nina" }],
      nina_confianca_decisoes: [
        {
          id: "d1",
          clinica_id: "c1",
          conversation_id: "v1",
          execucao_id: null,
          outgoing_message_id: "m1",
          avaliacao: "answer_confidence",
          score: 96,
          nivel: "HIGH",
          representacao: "texto_completo",
          texto_final_hash: hashDoTexto(mensagem.body),
        },
      ],
    });
    const [saida] = await carregarSaidasDasMensagens(cliente, dados);
    expect(saida).toMatchObject({ score: null, classe: "sem_avaliacao", execucaoId: null });
  });
  it("não mistura avaliações de outro atendimento quando falta execução", async () => {
    const { tabelas, cliente } = preparar();
    tabelas.atend_aviso_encaminhamento.length = 0;
    const [saida] = await carregarSaidasDasMensagens(cliente, dados);
    expect(saida).toMatchObject({
      inspecionavel: false,
      execucaoId: null,
      score: null,
      avaliacoes: [],
    });
  });
});
