import { mock } from "bun:test";
const gravados: Record<string, unknown[]> = {};
mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from(tabela: string) {
      return {
        insert: async (linhas: unknown) => {
          (gravados[tabela] ??= []).push(...(Array.isArray(linhas) ? linhas : [linhas]));
          return { error: null };
        },
      };
    },
  },
}));
process.env.LOVABLE_API_KEY = "chave-ficticia";
globalThis.fetch = Object.assign(
  async (_url: unknown, init?: RequestInit) => {
    const p = JSON.parse(String(init?.body));
    await Promise.resolve();
    return Response.json({
      answers: { urgencia: { noul: p.state.indice / 10 } },
      usage: { input_tokens: 11, output_tokens: 3 },
    });
  },
  { preconnect() {} },
);
const { comRegistroTurno, gravarResumoTurno } = await import("../../rastreio/turno.server");
const { perguntarJev, registrarDecisaoJev } = await import("../../jev.server");
await Promise.all(
  ["producao", "homologacao"].flatMap((ambiente) =>
    [1, 2].map(async (indice) => {
      const id = `${ambiente}-${indice}`;
      const { registro } = await comRegistroTurno(
        {
          turnoId: id,
          clinicaId: `clinica-${indice}`,
          conversaId: `conversa-${indice}`,
          ambiente,
          teste: ambiente === "homologacao",
          mensagensEntrada: [`entrada-${id}`],
        },
        async () => {
          const perguntas = { urgencia: { type: "noul" as const, instructions: "teste" } };
          const resultado = await perguntarJev({ indice }, perguntas);
          // Fases 1 e 2 compartilham uma chamada, como no atendimento real.
          for (const fase of ["fase1_intencao", "fase2_encaminhamento"] as const)
            await registrarDecisaoJev({
              clinicaId: `clinica-${indice}`,
              conversationId: `conversa-${indice}`,
              fase,
              teste: ambiente === "homologacao",
              perguntas,
              resultado,
              aplicada: true,
            });
          if (gravados.nina_trace_eventos?.length)
            throw Error("Auditoria fez I/O dentro do timeout do Jev");
        },
      );
      return registro;
    }),
  ),
).then(async (registros) => {
  for (const registro of registros) await gravarResumoTurno(registro);
});
console.log("AUDITORIA=" + JSON.stringify(gravados));
