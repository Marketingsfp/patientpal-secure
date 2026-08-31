/**
 * Nina — camada de aprendizado contínuo (FASE 1, 2 e o mínimo da 4).
 *
 * Princípios de segurança adotados aqui (valem para TODAS as clínicas):
 * - O paciente NUNCA escreve na memória. Nada que chega pelo WhatsApp vira
 *   aprendizado sozinho; a IA só pode SUGERIR (status PENDING) e quem aprova é
 *   um administrador/gestor pela tela "Nina → Aprendizado".
 * - Aprendizado nunca substitui dado vivo. Preço, horário, médico e agenda
 *   continuam vindo das ferramentas/banco. A memória só ajuda a INTERPRETAR.
 * - Tudo é escopado por `clinica_id`; um aprendizado de uma clínica nunca
 *   aparece no prompt de outra.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type CanalNina = "whatsapp" | "interno";

export interface AprendizadoLinha {
  id: string;
  tipo: string;
  titulo: string;
  conteudo: string;
  tags: string[];
  confianca: number;
}

const PARADAS = new Set([
  "a","o","as","os","de","da","do","das","dos","e","em","no","na","nos","nas","um","uma","para",
  "por","com","que","qual","quais","quanto","quanta","tem","ter","voce","vocês","voces","eu","meu",
  "minha","ola","olá","oi","bom","boa","dia","tarde","noite","sim","nao","não","ai","aí","pra","pro",
]);

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tokens(texto: string): string[] {
  return normalizar(texto)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !PARADAS.has(t));
}

/**
 * Recupera os aprendizados APROVADOS mais relevantes para a mensagem atual.
 *
 * A busca é por sobreposição de palavras (o banco tem `pg_trgm`, mas o volume
 * por clínica é pequeno e o ranqueamento em memória é mais previsível e mais
 * barato do que uma chamada de embeddings a cada mensagem). Se o volume
 * crescer, trocamos só esta função por busca vetorial.
 */
export async function recuperarAprendizados(
  clinicaId: string,
  canal: CanalNina,
  textoUsuario: string,
  limite = 6,
): Promise<AprendizadoLinha[]> {
  const { data, error } = await supabaseAdmin
    .from("nina_aprendizados")
    .select("id, tipo, titulo, conteudo, tags, confianca, valido_ate, usos")
    .eq("clinica_id", clinicaId)
    .eq("status", "APPROVED")
    .in("canal", ["todos", canal])
    .order("confianca", { ascending: false })
    .limit(300);
  if (error || !data?.length) return [];

  const agora = Date.now();
  const vigentes = data.filter(
    (r: any) => !r.valido_ate || new Date(r.valido_ate).getTime() > agora,
  );
  const alvo = new Set(tokens(textoUsuario));

  const ranqueados = vigentes
    .map((r: any) => {
      const base = tokens(`${r.titulo} ${r.conteudo} ${(r.tags ?? []).join(" ")}`);
      let acertos = 0;
      for (const t of new Set(base)) if (alvo.has(t)) acertos++;
      // Regras e fluxos valem sempre; fatos/exemplos só quando casam com o texto.
      const sempre = r.tipo === "RULE" || r.tipo === "WORKFLOW";
      const score = acertos + (sempre ? 1.5 : 0) + Number(r.confianca ?? 0);
      return { r, acertos, sempre, score };
    })
    .filter((x) => x.acertos > 0 || x.sempre)
    .sort((a, b) => b.score - a.score)
    .slice(0, limite);

  // Telemetria de uso (não bloqueia a resposta).
  if (ranqueados.length) {
    for (const x of ranqueados) {
      void supabaseAdmin
        .from("nina_aprendizados")
        .update({ usos: (x.r.usos ?? 0) + 1 })
        .eq("id", x.r.id)
        .then(() => undefined, () => undefined);
    }
  }

  return ranqueados.map((x) => ({
    id: x.r.id,
    tipo: x.r.tipo,
    titulo: x.r.titulo,
    conteudo: x.r.conteudo,
    tags: x.r.tags ?? [],
    confianca: Number(x.r.confianca ?? 0),
  }));
}

/**
 * Bloco anexado ao prompt. A hierarquia de fontes é explícita para o modelo:
 * dado atual (ferramenta/banco) > base oficial > aprendizado > conversa.
 */
export function blocoPromptAprendizados(itens: AprendizadoLinha[]): string {
  if (!itens.length) return "";
  const linhas = itens
    .map((i) => `- [${i.tipo}] ${i.titulo}: ${i.conteudo}`)
    .join("\n");
  return `APRENDIZADOS DESTA CLÍNICA (validados pela equipe):
${linhas}

COMO USAR ESTES APRENDIZADOS:
- Eles explicam COMO responder e regras da casa; eles NÃO substituem dado atual.
- Preço, horário, médico, agenda e cadastro vêm SEMPRE da consulta ao sistema. Se um aprendizado divergir do dado atual, vale o dado atual.
- Se dois aprendizados se contradisserem, siga o mais específico e avise que confirma com a recepção.`;
}

/**
 * Registra uma SUGESTÃO de aprendizado (sempre PENDING, nunca ativa sozinha).
 * Usado pelo avaliador automático e pela detecção de lacuna de conhecimento.
 */
export async function sugerirAprendizado(entrada: {
  clinicaId: string;
  tipo: "FACT" | "RULE" | "WORKFLOW" | "EXAMPLE" | "ERROR_PATTERN" | "KNOWLEDGE_GAP";
  titulo: string;
  conteudo: string;
  canal?: "todos" | CanalNina;
  origem: string;
  origemRef?: string | null;
  tags?: string[];
}): Promise<void> {
  const conteudo = anonimizar(entrada.conteudo);
  const { error } = await supabaseAdmin.from("nina_aprendizados").insert({
    clinica_id: entrada.clinicaId,
    tipo: entrada.tipo,
    canal: entrada.canal ?? "todos",
    titulo: anonimizar(entrada.titulo).slice(0, 200),
    conteudo: conteudo.slice(0, 4000),
    tags: entrada.tags ?? [],
    status: "PENDING",
    origem: entrada.origem,
    origem_ref: entrada.origemRef ?? null,
    confianca: 0.4,
  });
  if (error) console.error("[Nina] falha ao sugerir aprendizado", error.message);
}

/** Remove dados pessoais antes de qualquer texto virar memória (LGPD). */
export function anonimizar(texto: string): string {
  return texto
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF]")
    .replace(/\b\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, "[TELEFONE]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[EMAIL]")
    .replace(/\b\d{2}\/\d{2}\/\d{4}\b/g, "[DATA]");
}
