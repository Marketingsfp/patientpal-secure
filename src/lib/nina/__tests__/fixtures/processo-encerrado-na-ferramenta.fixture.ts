/**
 * Processo filho: usa o Tool Broker e a renovação de reserva REAIS; a ferramenta ainda está
 * consultando quando o processo é encerrado à força pelo teste (equivale ao término do worker).
 * Cada evento vai para o arquivo informado em argv[2].
 */
import { appendFileSync } from "node:fs";
import { criarToolBroker } from "../../tool-broker.server";
import { criarRenovacaoReserva } from "../../renovacao-reserva";
import { contextoWatchdog } from "../../watchdog-contexto.server";

const saida = process.argv[2]!;
const registrar = (evento: string) => appendFileSync(saida, `${evento}\n`);

criarRenovacaoReserva(
  async () => {
    registrar("HEARTBEAT");
    return true;
  },
  { intervaloMs: 50 },
);

const controle = {
  batchId: "lote-teste",
  lock: { chave: "c", token: "t" },
  snapshot: null,
  checkpoint: async () => {},
  evento: async (nome: string) => registrar(nome),
  finalizar: async () => {},
};
const broker = criarToolBroker({
  ctxPaciente: {} as never,
  ctxHandoff: { clinicaId: "clinica-teste", conversaId: null },
  executarPaciente: () =>
    new Promise((resolve) =>
      setTimeout(() => resolve({ ok: true, proxima: null, seguintes: [] }), 30_000),
    ),
});
void contextoWatchdog.run(controle as never, async () => {
  try {
    await broker.executar("proxima_vaga", { medico_id: "Profissional Teste", dia_semana: 4 });
  } finally {
    registrar("FINALLY");
  }
});
