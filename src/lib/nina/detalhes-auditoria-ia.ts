import type { PacoteDetalhesMensagem, RegistroDetalhes } from "./detalhes-mensagem";
import type { LeituraDetalhesMensagem } from "./detalhes-mensagem-contrato";
import type { ChamadaIA } from "./auditoria-ia";

const o = (v: unknown): RegistroDetalhes =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as RegistroDetalhes) : {};
const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const arr = (v: unknown): RegistroDetalhes[] => (Array.isArray(v) ? v.map(o) : []);
const n = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
const fingerprint = (v: unknown) =>
  typeof v === "string" && /^sha256:[a-f0-9]{64}$/.test(v) ? v : null;
const FASES: Record<string, string> = {
  fase1_intencao: "Intenção",
  fase2_encaminhamento: "Encaminhamento",
  fase3_especialidade: "Identificação no catálogo",
  fase4_cadastro: "Identificação do cadastro",
  fase6_conferencia: "Conferência da resposta",
  fase7_escolha: "Escolha do paciente",
  fase8_motivo: "Motivo da transferência",
};
const ROTULOS: Record<string, string> = {
  urgencia: "Urgência",
  irritacao: "Irritação",
  entendimento: "Entendimento",
  pedido_atendente: "Pedido de atendente",
  intencao: "Intenção",
};

export function complementarAuditoria(
  p: PacoteDetalhesMensagem,
  resumo: RegistroDetalhes,
  alertas: string[],
) {
  const versoes = [
    { valor: p.execucao?.prompt_versao, fonte: "Execução do modelo" },
    { valor: o(resumo.versao_prompt).versao, fonte: "Resumo do turno" },
    ...p.eventos
      .filter((e) => e.node_id === "instructions.published" && e.event_type === "completed")
      .map((e) => ({
        valor: o(e.metadata).versao,
        fonte: "Carregamento das instruções neste turno",
      })),
  ].filter((v) => v.valor != null && String(v.valor).trim() !== "");
  const conflito = new Set(versoes.map((v) => String(v.valor))).size > 1;
  if (conflito)
    alertas.push(
      "Há versões do prompt divergentes nos registros deste turno; nenhuma foi escolhida como definitiva.",
    );
  const chamadas = [
    ...p.eventos.filter((e) => e.node_id === "ai.auxiliary").map((e) => o(e.metadata)),
    ...p.entradas
      .filter(
        (e) =>
          e.clinica_id === p.clinicaId &&
          e.direction === "in" &&
          (!p.mensagem?.conversa_id || e.conversa_id === p.mensagem.conversa_id),
      )
      .flatMap((e) => arr(o(e.raw).nina_chamadas_ia)),
  ];
  const vistos = new Set<string>();
  const chamadasAuxiliares: ChamadaIA[] = [];
  for (const c of chamadas) {
    const id = s(c.id);
    if (
      !id ||
      vistos.has(id) ||
      !["jev", "leitura_imagem", "transcricao_audio", "sintese_voz"].includes(String(c.finalidade))
    )
      continue;
    vistos.add(id);
    chamadasAuxiliares.push({
      id,
      finalidade: c.finalidade as ChamadaIA["finalidade"],
      modelo: s(c.modelo) ?? "Não registrado",
      inicio: s(c.inicio) ?? "",
      duracaoMs: n(c.duracaoMs) ?? 0,
      estado: c.estado === "concluido" ? "concluido" : "falhou",
      erro: s(c.erro),
      consumoEntrada: n(c.consumoEntrada),
      consumoSaida: n(c.consumoSaida),
      caracteres: n(c.caracteres),
      formato: s(c.formato),
    });
  }
  const eventosJev = p.eventos
    .filter((e) => e.node_id === "jev.decision")
    .map((e) => o(e.metadata));
  const decisoes = eventosJev.length ? eventosJev : (p.decisoesJev ?? []);
  const decisoesJev = decisoes.map((d) => ({
    fase: FASES[String(d.fase)] ?? String(d.fase ?? "Fase não registrada"),
    aplicada: typeof d.aplicada === "boolean" ? d.aplicada : null,
    erro: s(d.erro),
    resumo:
      Object.entries(o(d.respostas))
        .filter(([k]) => !k.startsWith("_"))
        .map(([k, v]) => {
          const r = o(v),
            valor = s(r.choice) ?? n(r.noul) ?? n(r.score);
          return valor == null
            ? null
            : `${ROTULOS[k] ?? k}: ${valor}${n(r.confidence) == null ? "" : ` (confiança: ${r.confidence})`}`;
        })
        .filter(Boolean)
        .join(" · ") || "Pontuações não registradas.",
  }));
  if (decisoesJev.length && !chamadasAuxiliares.some((c) => c.finalidade === "jev"))
    alertas.push(
      "As decisões antigas do Jev estão vinculadas à mesma entrada, sem identificação exata de chamada ou turno. O consumo não foi registrado; duas decisões podem vir da mesma chamada.",
    );
  for (const tipo of ["audio", "image"]) {
    if (
      p.entradas.some((e) => e.tipo === tipo) &&
      !chamadasAuxiliares.some(
        (c) => c.finalidade === (tipo === "audio" ? "transcricao_audio" : "leitura_imagem"),
      )
    )
      alertas.push(
        `A entrada de ${tipo === "audio" ? "áudio" : "foto"} não tem consumo de IA registrado neste histórico.`,
      );
  }
  if (
    p.mensagem?.tipo === "audio" &&
    !chamadasAuxiliares.some((c) => c.finalidade === "sintese_voz")
  )
    alertas.push("A geração de voz não tem consumo registrado neste histórico.");
  const causas = [
    ...p.eventos
      .filter(
        (e) =>
          e.node_id === "handoff.reason" ||
          e.node_id === "catalog.rule" ||
          (e.node_id === "tool.execute" && o(e.metadata).motivo),
      )
      .map((e) => o(e.metadata)),
    ...p.etapas
      .filter((e) => ["encaminharRegraCatalogo", "jevFase2"].includes(String(o(e.codigo).funcao)))
      .map((e) => o(e.dados)),
  ];
  const encaminhamentos: NonNullable<LeituraDetalhesMensagem["encaminhamentos"]> = [];
  for (const c of causas) {
    const motivo = s(c.motivo);
    if (!motivo) continue;
    const registros = arr(c.registros).map((r) => ({
      id: s(r.id),
      nome: s(r.nome),
      campo: s(r.campo) ?? "extras.atendimento_humano_obrigatorio",
      valor: r.valor === true,
    }));
    const existente = encaminhamentos.find((e) => e.motivo === motivo);
    if (existente) {
      if (!existente.registros.length) existente.registros = registros;
      continue;
    }
    encaminhamentos.push({
      motivo,
      ferramenta: s(c.ferramenta_origem) ?? s(c.ferramenta),
      registros,
    });
  }
  return {
    versaoPrompt: conflito ? null : ((versoes[0]?.valor as number | string | undefined) ?? null),
    fonteVersaoPrompt: conflito ? "Registros divergentes" : (versoes[0]?.fonte ?? null),
    fingerprintTurno: fingerprint(resumo.runtime_fingerprint),
    fingerprintServidor: fingerprint(p.fingerprintServidor),
    chamadasAuxiliares,
    decisoesJev,
    encaminhamentos,
  };
}
