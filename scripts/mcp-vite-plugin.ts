import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import { resolve } from "node:path";
import type { Plugin } from "vite";

/** O Vite usa barras / no Windows, mas o MCP compara caminhos com node:path.
 * Normaliza somente a cópia entregue ao plugin, mantendo a proteção que impede
 * gerar rotas fora do projeto e a configuração original dos demais plugins. */
export function mcpPluginComCaminhosNativos(options?: Parameters<typeof mcpPlugin>[0]): Plugin {
  const plugin = mcpPlugin(options);
  const original = plugin.configResolved;
  if (!original) return plugin;
  const handler = typeof original === "function" ? original : original.handler;
  const configResolved: typeof handler = function (config) {
    return handler.call(this, { ...config, root: resolve(config.root) });
  };
  return {
    ...plugin,
    configResolved:
      typeof original === "function" ? configResolved : { ...original, handler: configResolved },
  };
}
