import { mock } from "bun:test";

const cenario = process.argv[2];
const clinica = "11111111-1111-4111-8111-111111111111";
const medico = "22222222-2222-4222-8222-222222222222";
const registroId = "33333333-3333-4333-8333-333333333333";
const cardio = { id: "44444444-4444-4444-8444-444444444444", nome: "Cardiologia" };
const pediatria = { id: "55555555-5555-4555-8555-555555555555", nome: "Pediatria" };
const antiga = { id: "66666666-6666-4666-8666-666666666666", nome: "Especialidade antiga" };
const outroMedico = "77777777-7777-4777-8777-777777777777";
const outraClinica = "88888888-8888-4888-8888-888888888888";
let falhar = false;
let escritas = 0;
const leituras: { tabela: string; filtros: Record<string, unknown>; de: number }[] = [];
const linha = (id: string, especialidade: typeof cardio | null, clinicaId = clinica) => ({
  medico_id: id,
  especialidade_id: especialidade?.id,
  especialidade,
  medicos: { clinica_id: clinicaId },
});
let especialidades = [
  linha(medico, cardio),
  linha(medico, pediatria),
  linha(outroMedico, antiga),
  linha("outro-tenant", antiga, outraClinica),
];
if (cenario === "vazio") especialidades = especialidades.filter((e) => e.medico_id !== medico);
if (cenario === "paginacao")
  especialidades = [
    ...Array.from({ length: 1000 }, (_, i) => linha(`inativo-${i}`, antiga)),
    linha(medico, cardio),
  ];
if (cenario === "referencia_ausente") especialidades = [linha(medico, null)];
let destino: any = {
  id: registroId,
  clinica_id: clinica,
  nome: "Médico teste",
  medico_id: medico,
  status: "PUBLICADO",
  updated_at: "2026-10-05T12:00:00Z",
  rascunho: null,
  especialidades: [antiga],
  estrutura: { versao: 1, aliases: ["Médico conhecido"] },
  nota_interna: "Conferido",
  horarios: [],
};
const banco: Record<string, any[]> = {
  medicos: [
    {
      id: medico,
      clinica_id: clinica,
      ativo: true,
      nome: "Médico teste",
      especialidade_id: antiga.id,
      visivel_agendamento_online: true,
    },
  ],
  especialidades: [cardio, pediatria, antiga],
  medico_disponibilidades: [
    {
      id: "horario",
      clinica_id: clinica,
      ativo: true,
      medico_id: medico,
      dia_semana: 6,
      hora_inicio: "08:00:00",
      hora_fim: "12:00:00",
    },
  ],
  medico_agendas: [],
  cb_convenios: [],
  cb_convenio_regras: [],
  procedimento_cb_convenio_valores: [],
  procedimento_especialidades: [],
  procedimentos: [],
  medico_procedimentos: [],
};
if (cenario === "legado_vazio") banco.medicos![0].especialidade_id = null;
const sb = {
  from(tabela: string) {
    const filtros: Record<string, unknown> = {};
    let dados: any;
    const q: any = {
      select: () => q,
      order: () => q,
      eq: (campo: string, valor: unknown) => {
        filtros[campo] = valor;
        return q;
      },
      update: (valor: unknown) => {
        dados = valor;
        return q;
      },
      range: async (de: number, ate: number) => {
        leituras.push({ tabela, filtros: { ...filtros }, de });
        if (tabela === "medico_especialidades" && falhar)
          return { data: null, error: { message: "Falha ao ler especialidades" } };
        const linhas = tabela === "medico_especialidades" ? especialidades : banco[tabela];
        if (!linhas) throw Error(`Leitura inesperada: ${tabela}`);
        return {
          data: structuredClone(
            linhas
              .filter((l) =>
                Object.entries(filtros).every(
                  ([k, v]) => k.split(".").reduce((obj: any, chave) => obj?.[chave], l) === v,
                ),
              )
              .slice(de, ate + 1),
          ),
          error: null,
        };
      },
      maybeSingle: async () => {
        if (tabela === "clinica_memberships") return { data: { role: "admin" }, error: null };
        if (tabela === "clinica_feature_flags") return { data: { ativo: true }, error: null };
        if (tabela !== "nina_cat_profissionais") throw Error(`Escrita inesperada: ${tabela}`);
        if (!Object.entries(filtros).every(([k, v]) => destino[k] === v))
          return { data: null, error: null };
        if (dados) {
          escritas++;
          destino = { ...destino, ...dados, updated_at: "2026-10-05T13:00:00Z" };
        }
        return { data: structuredClone(destino), error: null };
      },
    };
    return q;
  },
};
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: sb }));
globalThis.fetch = Object.assign(
  async () => {
    throw Error("Rede proibida neste teste");
  },
  { preconnect: () => {} },
);
const { lerFonteParaSincronizacao, lerFonteOperacional } =
  await import("../../fonte-operacional.server");
const { sincronizacaoManual } = await import("../../catalogo-sincronizacao.server");
const api = sincronizacaoManual(
  { supabase: sb, userId: "operador" },
  {
    lerFonte: lerFonteParaSincronizacao,
    perguntar: async () => {
      throw Error("Sincronizar não deve chamar IA");
    },
  },
);
let previa: any,
  opcoes: any,
  erro: string | null = null;
let escritasAposPrevia = 0;
try {
  opcoes = await api.opcoes(clinica, "profissional");
  previa = await api.prever(clinica, "profissional", registroId, medico);
  escritasAposPrevia = escritas;
  if (cenario === "mudanca") especialidades = [linha(medico, pediatria)];
  if (cenario === "erro") falhar = true;
  await api.aplicar(clinica, "profissional", previa);
} catch (e) {
  erro = (e as Error).message;
}
// A mudança pedida é editorial: a leitura direta do atendimento continua independente.
const operacional = await lerFonteOperacional(clinica);
console.log(
  "SINCRONIZACAO=" +
    JSON.stringify({
      destino,
      opcoes,
      previa,
      erro,
      escritas,
      escritasAposPrevia,
      leituras,
      operacional: operacional.profissionais[0]?.especialidades,
    }),
);
