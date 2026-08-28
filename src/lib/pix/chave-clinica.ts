import { supabase } from "@/integrations/supabase/client";

/**
 * Dados de recebimento PIX da clínica, usados para montar o QR Code.
 *
 * Ficam em `clinicas` porque são dados de cadastro da própria clínica, do
 * mesmo naipe de CNPJ e endereço — e são públicos por natureza: a chave PIX
 * existe justamente para ser mostrada a quem vai pagar. Não é segredo e não
 * entra em `integration_secrets`.
 */
export interface PixClinica {
  chave: string;
  /** Nome que aparece no aplicativo de quem paga. Cai no nome da clínica. */
  beneficiario: string;
  /** Cidade exigida pelo padrão do Banco Central. Cai na cidade da clínica. */
  cidade: string;
}

/** Por que não deu para montar a cobrança — cada caso tem um texto próprio na tela. */
export type MotivoPixIndisponivel =
  /** As colunas de PIX ainda não foram criadas no banco (migration pendente). */
  | "coluna-ausente"
  /** As colunas existem, mas ninguém cadastrou a chave ainda. */
  | "nao-configurado"
  /** Falha de rede ou permissão ao consultar. */
  | "erro";

export interface ResultadoPixClinica {
  pix: PixClinica | null;
  motivo: MotivoPixIndisponivel | null;
}

/**
 * Códigos que o banco devolve quando a coluna não existe. Enquanto a
 * migration não for aplicada em produção, a tela precisa continuar
 * funcionando — o PIX apenas segue o caminho antigo (sem QR Code), em vez de
 * quebrar o pagamento inteiro da mensalidade.
 */
export function colunaNaoExiste(erro: { code?: string; message?: string } | null): boolean {
  if (!erro) return false;
  if (erro.code === "42703" || erro.code === "PGRST204") return true;
  return /column .* does not exist|does not exist.*column/i.test(erro.message ?? "");
}

/**
 * Lê os dados de PIX da clínica. Nunca lança: devolve o motivo para a tela
 * explicar em português o que fazer.
 */
export async function buscarPixDaClinica(clinicaId: string): Promise<ResultadoPixClinica> {
  if (!clinicaId) return { pix: null, motivo: "erro" };
  // As colunas de PIX ainda não estão nos tipos gerados do Supabase (são
  // criadas pela migration que acompanha esta funcionalidade). Por isso a
  // consulta é montada sem o tipo gerado — e o retorno é conferido campo a
  // campo logo abaixo, que é o que de fato protege contra dado faltando.
  const { data, error } = (await supabase
    .from("clinicas")
    .select("nome, cidade, pix_chave, pix_beneficiario" as never)
    .eq("id", clinicaId)
    .maybeSingle()) as unknown as {
    data: {
      nome: string | null;
      cidade: string | null;
      pix_chave?: string | null;
      pix_beneficiario?: string | null;
    } | null;
    error: { code?: string; message?: string } | null;
  };

  if (error) {
    return { pix: null, motivo: colunaNaoExiste(error) ? "coluna-ausente" : "erro" };
  }
  if (!data) return { pix: null, motivo: "erro" };

  const linha = data;
  const chave = (linha.pix_chave ?? "").trim();
  if (!chave) return { pix: null, motivo: "nao-configurado" };

  return {
    pix: {
      chave,
      beneficiario: (linha.pix_beneficiario ?? "").trim() || (linha.nome ?? "").trim(),
      cidade: (linha.cidade ?? "").trim(),
    },
    motivo: null,
  };
}
