/** Executa o código compilado dentro do runtime de Workers, sem DOM e sem rede. */
import { expect, test } from "bun:test";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { fileURLToPath } from "node:url";

test("cadastro e etapas da Nina carregam no worker sem biblioteca de HTML", async () => {
  const raiz = fileURLToPath(new URL("../../../../", import.meta.url));
  const compilado = await build({
    absWorkingDir: raiz,
    stdin: {
      contents: `
        import { cadastroMinimoSchema, camposCadastroFaltantes } from './src/lib/nina/cadastro-paciente';
        import { avaliarIntencaoAgendar } from './src/lib/nina/atendimento-fase3';
        import { derivarEtapa } from './src/lib/nina/atendimento-fase6';
        import { estadoVazio } from './src/lib/nina/fluxo-estado-normalizar';
        export default { fetch() {
          const estado = estadoVazio();
          const cadastro = cadastroMinimoSchema.parse({nome:'  Ana\\u200b   Silva ', data_nascimento:'1990-01-02', telefone:'(21) 99999-0000'});
          return Response.json({cadastro, faltantes:camposCadastroFaltantes({telefone:'21999990000'}),
            invalida:cadastroMinimoSchema.safeParse({...cadastro,data_nascimento:'1990-02-31'}).success,
            agendar:avaliarIntencaoAgendar('quero agendar uma consulta',estado).confirmado,
            etapa:derivarEtapa({mensagem:'Oi boa tarde',estado,primeiraMensagem:true,intencoes:[]})});
        }};
      `,
      resolveDir: raiz,
      loader: "ts",
      sourcefile: "cadastro-worker.ts",
    },
    bundle: true,
    platform: "browser",
    conditions: ["workerd", "worker", "browser"],
    format: "esm",
    write: false,
    metafile: true,
  });
  // Garante que não basta contornar a exceção: HTML/DOM não pertence a esta dependência.
  expect(Object.keys(compilado.metafile!.inputs).some((p) => /dompurify|jsdom/.test(p))).toBe(
    false,
  );
  const worker = new Miniflare({
    modules: true,
    script: compilado.outputFiles[0]!.text,
    compatibilityDate: "2025-09-24",
    compatibilityFlags: ["nodejs_compat"],
  });
  try {
    const resposta = await worker.dispatchFetch("http://localhost/cadastro");
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({
      cadastro: { nome: "ANA SILVA", data_nascimento: "1990-01-02", telefone: "21999990000" },
      faltantes: ["nome", "data_nascimento"],
      invalida: false,
      agendar: true,
      etapa: "GREETING",
    });
  } finally {
    await worker.dispose();
  }
}, 30000);
