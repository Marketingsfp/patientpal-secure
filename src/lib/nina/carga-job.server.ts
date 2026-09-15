import { EXECUTOR_CARGA_POR_ITEM } from "./carga-itens.server";
import { estadoControleCarga } from "./carga-controle";
import { recuperarCargaSemAtividade } from "./carga-controle.server";
import { executarCargaControlada } from "./carga-execucao.server";

/** Continuação independente do navegador, dentro do job autenticado já existente. */
export async function continuarCargaPendenteNina(
  admin: any,
  processar: Parameters<typeof executarCargaControlada>[0]["processar"],
) {
  const { data: cfg, error: ec } = await admin
    .from("nina_watchdog_config")
    .select("homologacao_ativa")
    .eq("id", true)
    .maybeSingle();
  if (ec) throw new Error("CARGA_JOB_CONFIG_INDISPONIVEL");
  if (!cfg?.homologacao_ativa) return { cargas: 0 };
  const { data: cargas, error } = await admin
    .from("nina_teste_carga")
    .select("*")
    .eq("status", "executando")
    .eq("cancelar", false)
    .eq("config->>executor", EXECUTOR_CARGA_POR_ITEM)
    .order("updated_at")
    .limit(20);
  if (error) throw new Error("CARGA_JOB_FILA_INDISPONIVEL");
  for (const original of cargas ?? []) {
    const carga = await recuperarCargaSemAtividade(admin, original);
    const estado = estadoControleCarga(carga);
    if (!estado.podeRetomar || estado.aguardarMs > 0) continue;
    // A autoria persistida é revalidada; o job não amplia acesso nem revive testes antigos.
    const { data: membro, error: em } = await admin
      .from("clinica_memberships")
      .select("id")
      .eq("clinica_id", carga.clinica_id)
      .eq("user_id", carga.criado_por)
      .eq("ativo", true)
      .maybeSingle();
    if (em) throw new Error("CARGA_JOB_AUTORIZACAO_INDISPONIVEL");
    if (!membro) continue;
    return {
      cargas: 1,
      resultado: await executarCargaControlada({
        admin,
        clinicaId: carga.clinica_id,
        cargaId: carga.id,
        userId: carga.criado_por,
        processar,
      }),
    };
  }
  return { cargas: 0 };
}
