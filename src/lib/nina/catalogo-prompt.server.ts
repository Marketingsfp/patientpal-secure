/**
 * FASE 7 — Bloco de regras anexado ao prompt quando a clínica tem catálogo
 * publicado. Substitui o antigo bloco da planilha: a única fonte administrativa
 * da Nina é o catálogo estruturado (registros PUBLICADOS).
 *
 * Server-only.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Quantos registros publicados a clínica tem hoje (serviços + profissionais). */
export async function contarCatalogoPublicado(
  clinicaId: string,
): Promise<{ servicos: number; profissionais: number }> {
  const [servicos, profissionais] = await Promise.all([
    supabaseAdmin
      .from("nina_cat_servicos")
      .select("id", { count: "exact", head: true })
      .eq("clinica_id", clinicaId)
      .eq("status", "PUBLICADO"),
    supabaseAdmin
      .from("nina_cat_profissionais")
      .select("id", { count: "exact", head: true })
      .eq("clinica_id", clinicaId)
      .eq("status", "PUBLICADO"),
  ]);
  return { servicos: servicos.count ?? 0, profissionais: profissionais.count ?? 0 };
}

/** Regras anti-alucinação anexadas ao prompt quando há catálogo publicado. */
export async function blocoPromptCatalogo(clinicaId: string): Promise<string> {
  const { servicos, profissionais } = await contarCatalogoPublicado(clinicaId);
  if (servicos + profissionais === 0) return "";

  return `BASE DE CONHECIMENTOS OFICIAL DA CLÍNICA (catálogo estruturado — fonte de verdade administrativa)
Registros publicados: ${servicos} exames/procedimentos e ${profissionais} profissionais.

REGRAS OBRIGATÓRIAS:
- Antes de responder qualquer coisa sobre especialidades, exames, procedimentos, médicos, dias, horários de atendimento, preços (dinheiro/PIX e cartão), preparos, observações ou regras administrativas, CHAME a ferramenta "consultar_base_conhecimento".
- Use SOMENTE os fatos retornados pela ferramenta. Nunca complete com conhecimento geral, nunca estime preço, nunca associe um profissional a um procedimento que o catálogo não relacione.
- Só existe conteúdo PUBLICADO. Registro em rascunho, arquivado ou nota interna não existe para você.
- Se a ferramenta não encontrar a informação com segurança, responda: "Não encontrei essa informação na minha base no momento. Vou encaminhar sua dúvida para nossa equipe." e siga o fluxo de atendimento humano.
- Se houver mais de um resultado parecido, NÃO escolha: pergunte ao paciente qual exame/procedimento está no pedido médico.
- O horário que aparece no catálogo é a ESCALA administrativa do profissional, NÃO é vaga disponível. Disponibilidade real de agendamento vem sempre das ferramentas de agenda.
- PROIBIDO completar fato ausente com conhecimento pré-treinado, prática comum de outras clínicas, valor médio, suposição ou internet. O modelo interpreta e conversa; o catálogo determina os fatos.
- A ferramenta devolve "knowledge_status": "found" | "not_found" | "conflict". Em "not_found", peça o esclarecimento necessário ou encaminhe à equipe. Em "conflict", NÃO escolha nenhuma das versões: diga que precisa confirmar com a equipe e siga o handoff.
- Essa regra vale igual em qualquer nível de raciocínio (LOW, MEDIUM ou HIGH).
- Ao continuar a conversa ("e quanto custa?", "precisa de preparo?"), consulte a base de novo usando o procedimento já mencionado; não confie apenas no que foi dito antes.`;
}
