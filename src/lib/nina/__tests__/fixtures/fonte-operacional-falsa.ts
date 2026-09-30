/**
 * Substitui a leitura do cadastro (`fonte-operacional.server`) nos testes da Nina: entrega as
 * mesmas linhas "publicadas" que o banco falso de cada teste já simula. O acesso paginado ao banco
 * do catálogo não existe mais; a conversão do cadastro tem testes próprios (fonte-operacional.test).
 */
type Linha = Record<string, unknown>;

export function fonteOperacionalDoBanco(
  obter: () => Record<string, Linha[]>,
  /** Uma entrada por leitura (clínica), para os testes que contam leituras. */
  registro: string[] = [],
  /** Quando devolve true, a leitura falha (teste de falha de leitura). */
  falhar: () => boolean = () => false,
) {
  // Cópia sem campos internos, como o leitor real entrega (cada leitura devolve objetos novos).
  const publicados = (tabela: string, clinicaId: string) =>
    (obter()[tabela] ?? [])
      .filter((l) => l.clinica_id === clinicaId && l.status === "PUBLICADO")
      .map((l) => {
        const { nota_interna: _n, rascunho: _r, ...publico } = l;
        return structuredClone(publico);
      });
  return {
    FLAG_NINA_INFORMA_CADASTRO: "nina_informa_cadastro",
    VALIDADE_CACHE_MS: 0,
    limparCacheFonteOperacional: () => {},
    ninaInformaPeloCadastro: async () => true,
    lerFonteOperacional: async (clinicaId: string) => {
      registro.push(clinicaId);
      if (falhar()) throw new Error("Falha ao ler o cadastro");
      return {
      servicos: publicados("nina_cat_servicos", clinicaId),
      profissionais: publicados("nina_cat_profissionais", clinicaId),
      };
    },
  };
}
