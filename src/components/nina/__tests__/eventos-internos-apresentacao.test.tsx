import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ConversationSystemEvent, type ConversaEvento } from "../ConversationSystemEvent";
import { HandoffGroupCard } from "../ConversationEventGroup";
import {
  motivoParaAtendimento,
  textoOperacional,
} from "@/lib/atendimento/texto-interno-apresentacao";
import { textoMarcadorSistema } from "@/lib/atendimento/marcador-handoff";
import { marcadorInternoSistema } from "@/lib/nina/inspecao-mensagem";
import { agruparTimeline, type GrupoHandoff } from "@/lib/atendimento/timeline-grupos";
import { blocosVisiveis, normalizarResumo } from "@/lib/atendimento/handoff-resumo";

const erroOriginal =
  'MISSING_REQUIRED_SOURCE: informação exige fonte oficial — Confiabilidade insuficiente (bloqueio UNGROUNDED_CLAIM): ENTIDADE_AMBIGUA — {"ambiguos":[{"campo":"procedimento","opcoes":["Consulta Clínico Geral"]}]}';
type EventoTeste = Omit<ConversaEvento, "detalhes"> & { detalhes: Record<string, unknown> | null };
const evento = (p: Partial<EventoTeste> = {}): EventoTeste => ({
  id: "evento-1",
  evento: "HANDOFF_SOLICITADO",
  user_id: null,
  motivo: erroOriginal,
  detalhes: null,
  created_at: "2026-09-16T14:33:00Z",
  ...p,
});
const renderizar = (ev: ConversaEvento) =>
  renderToStaticMarkup(<ConversationSystemEvent evento={ev} />);

describe("Apresentação dos registros internos para atendimento real e homologação", () => {
  test("caso da imagem: mantém encaminhamento, oculta códigos e JSON sem mudar registro", () => {
    const ev = evento();
    const antes = structuredClone(ev);
    const html = renderizar(ev);
    expect(html).toContain("Nina solicitou atendimento humano");
    expect(html).toContain("A equipe precisa conferir as informações solicitadas pelo paciente.");
    expect(html).not.toMatch(/MISSING|UNGROUNDED|AMBIGUA|ambiguos|campo|opcoes|Confiabilidade/);
    expect(ev).toEqual(antes);
  });
  test("grupo de atendimento real não revela auditoria, campos faltantes nem motivo bruto", () => {
    const ev = evento();
    const agrupado = agruparTimeline({
      eventos: [
        ev,
        evento({
          id: "auditoria",
          evento: "HANDOFF_AUDITORIA",
          created_at: "2026-09-16T14:33:01Z",
          detalhes: {
            handoff_event_id: ev.id,
            auditoria_completa: false,
            auditoria_faltando: ["trace_id", "prompt_hash"],
          },
        }),
      ],
    });
    const grupo = agrupado.itens[0] as GrupoHandoff;
    const html = renderToStaticMarkup(<HandoffGroupCard grupo={grupo} />);
    expect(html).toContain("Encaminhamento para atendimento humano");
    expect(html).not.toMatch(/MISSING|Auditoria|trace_id|prompt_hash|Handoff/);
    expect(grupo.motivo).toBe(erroOriginal);
    expect(grupo.auditoria.faltando).toEqual(["trace_id", "prompt_hash"]);
  });
  test.each(["HANDOFF_AUDITORIA", "LLM_RETRY", "NOVO_EVENTO_TECNICO"])(
    "evento técnico %s não cria banner vazio",
    (nome) => {
      expect(renderizar(evento({ evento: nome }))).toBe("");
    },
  );
  test("código desconhecido não vaza e não inventa causa específica", () => {
    expect(motivoParaAtendimento("INTERNAL_FAILURE_XYZ: new_detail=42")).toBe(
      "A equipe dará continuidade à solicitação do paciente.",
    );
  });
  test("texto operacional preserva motivos manuais e informações de contato", () => {
    for (const texto of [
      "Paciente prefere atendimento amanhã.",
      "Paciente enviará o exame para joao_silva@clinica.com.br.",
      "Endereço: https://clinica.com.br/local",
      "Aguardando resultado de cardiologia.",
    ])
      expect(textoOperacional(texto)).toBe(texto);
    const html = renderizar(
      evento({
        evento: "FINALIZADA",
        user_nome: "Ana",
        motivo: "Paciente confirmou que não precisa de mais informações.",
      }),
    );
    expect(html).toContain("Conversa encerrada e resolvida por Ana");
    expect(html).toContain("Paciente confirmou");
  });
  test("envio de protocolo não aparece como atribuição ao Sistema de Automação", () => {
    const html = renderizar(
      evento({
        evento: "ASSUMIDA",
        motivo: "Protocolo MJ-92 informado ao paciente",
        detalhes: { protocol_number: "MJ-92", protocolo_informado: true, message_id: "interno" },
      }),
    );
    expect(html).toContain("Protocolo MJ-92 informado ao paciente");
    expect(html).not.toMatch(/atribuída|Sistema de Automação|message_id/);
  });
  test("paciente sem retorno tem motivo operacional sem o termo timeout", () => {
    expect(motivoParaAtendimento("patient_response_timeout")).toContain("30 minutos");
    expect(
      renderizar(evento({ evento: "TIMEOUT_NINA", motivo: "patient_response_timeout" })),
    ).not.toMatch(/timeout/i);
  });
  test("marcadores antigos com erro são ocultos, texto real enviado não é filtrado", () => {
    const interno = {
      enviada_por: "sistema",
      direction: "out",
      status: "system",
      body: erroOriginal,
    };
    const real = { ...interno, status: "sent" };
    expect(marcadorInternoSistema(interno)).toBe(true);
    expect(textoMarcadorSistema(interno.body)).toBe("");
    expect(marcadorInternoSistema(real)).toBe(false);
    expect(marcadorInternoSistema({ ...interno, enviada_por: "paciente", direction: "in" })).toBe(
      false,
    );
    expect(textoMarcadorSistema("👤 Atribuída automaticamente a Ana (online).")).toContain("Ana");
  });
  test("resumo da equipe filtra registros técnicos sem alterar o payload", () => {
    const r = normalizarResumo({
      intencao: "consulta",
      motivo_contato: "Deseja consultar um clínico geral.",
      situacao: erroOriginal,
      pendencias: ["Confirmar a unidade.", "trace_id: 123"],
      informacoes: [],
      ja_informado: [],
      proxima_acao: "Conferir a disponibilidade.",
    });
    const original = structuredClone(r);
    const texto = JSON.stringify(blocosVisiveis(r));
    expect(texto).toContain("Confirmar a unidade.");
    expect(texto).not.toMatch(/MISSING|UNGROUNDED|trace_id/);
    expect(r).toEqual(original);
  });
});
