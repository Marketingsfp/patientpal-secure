/**
 * FASE 5 — Leitura somente leitura do código-fonte para o painel de detalhes.
 *
 * Os arquivos são embutidos no bundle do servidor pelo Vite (`?raw`), então
 * não há leitura de disco em produção nem execução de código: o conteúdo é
 * apenas texto. A liberação por arquivo e a remoção de valores sensíveis
 * ficam em `codigo.ts`.
 */
import { arquivoPermitido, extrairTrecho, type TrechoCodigo } from "./codigo";

const FONTES = import.meta.glob("/src/**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
}) as Record<string, () => Promise<string>>;

export async function lerTrechoDoArquivo(
  arquivo: string,
  funcao?: string,
): Promise<TrechoCodigo | null> {
  if (!arquivoPermitido(arquivo)) return null;
  const chave = arquivo.startsWith("/") ? arquivo : `/${arquivo}`;
  const carregar = FONTES[chave];
  if (!carregar) return null;
  const conteudo = await carregar();
  return extrairTrecho(arquivo, conteudo, funcao);
}
