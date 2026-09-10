/**
 * FASE 4 / FASE 3 — PRÉVIA COM CONTEXTO DE EXEMPLO.
 *
 * Isto NÃO é o registro de uma resposta real: é a versão publicada montada
 * com um atendimento fictício, para conferir o texto antes de usar. O que foi
 * usado em uma resposta específica só sai do snapshot daquela execução.
 *
 * Para a montagem ser fiel, ela usa exatamente:
 *   - o compositor compartilhado (`comporRequestNina`) — nada de concatenação
 *     própria fingindo ser o payload real;
 *   - o mesmo registro de ferramentas do atendimento, inclusive a de
 *     transferência para atendente e as de agenda quando estão habilitadas.
 *
 * Nada aqui grava, publica ou altera atendimento. Nenhum secret é exposto.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { capacidadesDoPapel } from "./arquitetura/permissoes";
import { ENVELOPE_TECNICO, comporRequestNina } from "./prompt-composer";
import { renderizarTemplateInstrucoes } from "./instrucoes-template";

export type ParteRequest = {
  /** Rótulo de origem, exibido no conteúdo final. */
  rotulo: string;
  origem: "codigo" | "arquitetura" | "runtime";
  conteudo: string;
};

export type PreviewRequestNina = {
  /** Escopo desta prévia. Hoje só a Nina do WhatsApp é montada aqui. */
  escopo: "whatsapp";
  /** As instruções do WhatsApp valem para todas as clínicas. */
  alcanceGlobal: boolean;
  /** Deixa explícito que o contexto é de exemplo, não de um atendimento real. */
  contexto: "exemplo";
  versao: number | null;
  publicadoEm: string | null;
  /** FASE 2 — de onde veio o texto exibido: versão publicada ou código. */
  origemTemplate: "publicada" | "codigo";
  /** Marcador que ficaria sem substituição, quando houver. */
  marcadorPendente: string | null;
  /** Template publicado, ainda com os placeholders de dados. */
  template: string;
  /** Behavior prompt já renderizado (placeholders substituídos). */
  behaviorPrompt: string;
  runtimeContextJson: string;
  ferramentas: Array<{ nome: string; descricao: string; parametros: string }>;
  envelope: string;
  partes: ParteRequest[];
  /**
   * System prompt montado pelo compositor compartilhado — o mesmo formato que
   * o atendimento envia, apenas com contexto de exemplo.
   */
  conteudoFinal: string;
};

export const previewRequestNina = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ clinicaId: z.string().uuid() }).parse(input))
  .handler(async ({ data: entrada, context }): Promise<PreviewRequestNina> => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { data: papeis } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("clinica_id", entrada.clinicaId);
    const podeVer = ((papeis ?? []) as Array<{ role: string }>).some((p) =>
      capacidadesDoPapel(String(p.role)).includes("nina.instrucoes.ver"),
    );
    if (!podeVer) throw new Error("Você não tem permissão para ver as Instruções da Nina.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: versao } = await (supabaseAdmin as any)
      .from("nina_instrucoes_versoes")
      .select("versao, conteudo, publicado_em")
      .is("clinica_id", null)
      .eq("escopo", "whatsapp")
      .eq("status", "publicada")
      .maybeSingle();

    const { data: clinica } = await (supabaseAdmin as any)
      .from("clinicas")
      .select("nome, endereco, cidade, estado, telefone, email")
      .eq("id", entrada.clinicaId)
      .maybeSingle();

    const nomeUnidade = clinica?.nome ?? "esta unidade";
    const nomeCurtoUnidade =
      String(nomeUnidade)
        .split(/\s+[—–-]\s+/)[0]
        ?.trim() || nomeUnidade;

    const { PROMPT_NINA_WHATSAPP_V4 } = await import("./prompt/behavior-v4");
    // FASE 2 — a prévia usa a MESMA renderização do runtime e da publicação.
    // Sem versão publicada, o texto exibido é o do código e isso é dito na
    // resposta (origem "codigo"), nunca apresentado como versão publicada.
    const publicado = versao?.conteudo as string | undefined;
    const template = publicado ?? PROMPT_NINA_WHATSAPP_V4;
    const origemTemplate: "publicada" | "codigo" = publicado ? "publicada" : "codigo";
    const render = renderizarTemplateInstrucoes(template, {
      "${nomeUnidade}": nomeUnidade,
      "${nomeCurtoUnidade}": nomeCurtoUnidade,
    });
    const marcadorPendente = render.ok ? null : render.restante;
    const behaviorPrompt = render.ok ? render.texto : template;

    // Catálogo publicado — só a contagem (fato), nunca conteúdo sensível.
    const catalogo = await (async () => {
      try {
        const { contarCatalogoPublicado } = await import("./catalogo-prompt.server");
        return await contarCatalogoPublicado(entrada.clinicaId);
      } catch {
        return { servicos: 0, profissionais: 0 };
      }
    })();

    const podeAgendar = await (async () => {
      try {
        const { ferramentasAgendaAtivas } = await import("./agenda-flag.server");
        return await ferramentasAgendaAtivas(entrada.clinicaId);
      } catch {
        return false;
      }
    })();

    const { agoraNaClinica } = await import("@/lib/nina-agora");

    // Exemplo REPRESENTATIVO do contexto dinâmico: mesma estrutura do runtime,
    // com um atendimento fictício. Nenhum dado de paciente real é lido aqui.
    const runtimeContext = {
      canal: "whatsapp",
      ambiente: "pre-visualizacao",
      unidade: {
        nome_oficial: nomeUnidade,
        nome_curto: nomeCurtoUnidade,
        endereco: clinica?.endereco ?? null,
        telefone: clinica?.telefone ?? null,
        email: clinica?.email ?? null,
      },
      data_hora_atual: agoraNaClinica(),
      intencoes: ["informacao"],
      intencao_ambigua: false,
      sessao: { nova_sessao: true, expirou: false, continuacao: false, saudacao_obrigatoria: true },
      identidade: { confirmada: false, ja_perguntada: false, primeiro_nome: null },
      paciente: { cadastro_encontrado: false, identificado: false, primeiro_nome: null },
      campos_faltantes: ["nome", "cpf"],
      etapa: "IDLE",
      agendamento: { intencao_confirmada: false, procedimento: null, data: null, hora: null },
      catalogo: {
        publicado: catalogo.servicos > 0 || catalogo.profissionais > 0,
        servicos: catalogo.servicos,
        profissionais: catalogo.profissionais,
      },
      ferramentas: { pode_agendar: podeAgendar },
      aprendizados: [],
    };

    const req = comporRequestNina({ behaviorPrompt, runtimeContext });

    // MESMO registro de ferramentas do atendimento: consulta sempre, agenda
    // conforme a habilitação da clínica e transferência para atendente
    // sempre — é assim que o runtime monta a lista.
    const { FERRAMENTAS_NINA_CONSULTA, FERRAMENTAS_NINA_AGENDAMENTO } = await import(
      "./paciente-tools.server"
    );
    const { FERRAMENTA_HANDOFF } = await import("./handoff-tool.server");
    const lista: any[] = [
      ...(FERRAMENTAS_NINA_CONSULTA as readonly any[]),
      ...(podeAgendar ? (FERRAMENTAS_NINA_AGENDAMENTO as readonly any[]) : []),
      FERRAMENTA_HANDOFF as any,
    ];

    const ferramentas = lista.map((f) => ({
      nome: String(f?.function?.name ?? f?.name ?? "—"),
      descricao: String(f?.function?.description ?? f?.description ?? ""),
      parametros: JSON.stringify(f?.function?.parameters ?? f?.parameters ?? {}, null, 2),
    }));

    const rotuloBehavior = `Behavior Prompt — Arquitetura v${versao?.versao ?? "—"}`;
    const partes: ParteRequest[] = [
      { rotulo: "Technical Safety Envelope", origem: "codigo", conteudo: req.envelope },
      { rotulo: rotuloBehavior, origem: "arquitetura", conteudo: req.behaviorPrompt },
      {
        rotulo: "Runtime Context (exemplo)",
        origem: "runtime",
        conteudo: JSON.stringify(runtimeContext, null, 2),
      },
      {
        rotulo: "Tools",
        origem: "codigo",
        conteudo: ferramentas.map((f) => `${f.nome} — ${f.descricao}`).join("\n") || "(nenhuma)",
      },
    ];

    return {
      escopo: "whatsapp",
      alcanceGlobal: true,
      contexto: "exemplo",
      versao: (versao?.versao as number | undefined) ?? null,
      publicadoEm: (versao?.publicado_em as string | undefined) ?? null,
      origemTemplate,
      marcadorPendente,
      template,
      behaviorPrompt: req.behaviorPrompt,
      runtimeContextJson: JSON.stringify(runtimeContext, null, 2),
      ferramentas,
      envelope: ENVELOPE_TECNICO,
      partes,
      // Saída do compositor compartilhado — não é uma colagem feita na tela.
      conteudoFinal: req.systemPrompt,
    };
  });
