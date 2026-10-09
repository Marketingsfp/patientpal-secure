import type { Plugin } from "vite";
import { arquivosPermitidos } from "../src/lib/nina/arquitetura/codigo";

export const MODULO_FONTES_NINA = "virtual:nina-arquitetura-fontes";
const RESOLVIDO = `\0${MODULO_FONTES_NINA}`;

/** Somente os arquivos consultáveis entram como texto no pacote do servidor.
 * O glob anterior duplicava todo src, inclusive testes, fixtures e tipos gerados.
 * O manifesto continua sendo a lista única de autorização, conferida também
 * pelo endpoint em runtime. Imports continuam lazy, sem ler disco no worker. */
export function codigoFontesArquitetura(): string {
  const arquivos = [...arquivosPermitidos()]
    .filter((arquivo) => /^src\/.*\.tsx?$/.test(arquivo))
    .sort();
  return `export default {\n${arquivos
    .map((arquivo) => {
      const caminho = `/${arquivo}`;
      return `${JSON.stringify(caminho)}: () => import(${JSON.stringify(`${caminho}?raw`)}).then(m => m.default)`;
    })
    .join(",\n")}\n};`;
}

export function fontesArquiteturaNina(): Plugin {
  return {
    name: "nina-arquitetura-fontes-permitidas",
    resolveId(id) {
      if (id === MODULO_FONTES_NINA) return RESOLVIDO;
    },
    load(id) {
      if (id === RESOLVIDO) return codigoFontesArquitetura();
    },
  };
}
