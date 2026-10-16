/**
 * Faz `/api/nina-ligacao` (conexão contínua da ligação da Nina) funcionar no
 * servidor de desenvolvimento e na pré-visualização. Publicado, quem atende é
 * `src/server.ts` (Cloudflare).
 */
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { TLSSocket } from "node:tls";
import type { Plugin } from "vite";
import WebSocket, { WebSocketServer } from "ws";
import type {
  ConectorGateway,
  SocketLigacao,
} from "../src/lib/nina/ligacao/sessao-live.server";

function socketNode(s: WebSocket): SocketLigacao {
  return {
    get readyState() {
      return s.readyState;
    },
    send(d) {
      if (s.bufferedAmount > 256 * 1024) throw new Error("Conexão lenta demais");
      s.send(d);
    },
    close(code = 1000, reason) {
      if (s.readyState !== WebSocket.OPEN) return s.terminate();
      s.close(code, reason);
      const t = setTimeout(() => s.terminate(), 1000);
      t.unref();
      s.once("close", () => clearTimeout(t));
    },
    onMessage: (h) => s.on("message", (d, bin) => h(bin ? d : d.toString())),
    onClose: (h) => s.on("close", h),
    onError: (h) => s.on("error", h),
  };
}

const conectarGateway: ConectorGateway = (endereco, headers, signal) =>
  new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const url = new URL(endereco);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const s = new WebSocket(url, {
      headers,
      handshakeTimeout: 10_000,
      maxPayload: 2 * 1024 * 1024,
      followRedirects: false,
      perMessageDeflate: false,
    });
    const abortar = () => {
      s.terminate();
      reject(new Error("Ligação cancelada"));
    };
    signal.addEventListener("abort", abortar, { once: true });
    s.once("close", () => signal.removeEventListener("abort", abortar));
    s.on("error", () => reject(new Error("Falha na conexão de voz.")));
    s.once("unexpected-response", (_req, res) => {
      let corpo = "";
      const recusar = () => {
        s.terminate();
        let msg = "";
        try {
          const p = JSON.parse(corpo) as { message?: unknown };
          if (typeof p.message === "string") msg = p.message.slice(0, 300);
        } catch {
          msg = "";
        }
        reject(new Error(msg || `O serviço de voz recusou a conexão (${res.statusCode}).`));
      };
      res.setEncoding("utf8");
      res.on("data", (c: string) => {
        if (corpo.length < 16 * 1024) corpo += c;
      });
      res.once("end", recusar);
      res.once("error", recusar);
    });
    s.once("open", () => {
      if (signal.aborted) return abortar();
      resolve(socketNode(s));
    });
  });

function requestDoUpgrade(req: IncomingMessage): Request {
  const headers = new Headers();
  for (const [n, v] of Object.entries(req.headers))
    for (const i of Array.isArray(v) ? v : v === undefined ? [] : [v]) headers.append(n, i);
  const host = req.headers.host;
  if (!host) throw new Error("Sem host");
  const proto = (req.socket as TLSSocket).encrypted ? "https:" : "http:";
  const origem = new URL(`${proto}//${host}`).origin;
  const url = new URL(req.url ?? "/", origem);
  if (url.origin !== origem) throw new Error("URL inválida");
  return new Request(url, { method: req.method ?? "GET", headers });
}

function recusar(s: Duplex, status: number) {
  if (!s.destroyed)
    s.end(`HTTP/1.1 ${status} Recusado\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

export function ninaLigacaoDev(): Plugin {
  let descartar = () => {};
  return {
    name: "nina-ligacao-dev",
    apply: "serve",
    configureServer(server) {
      const http = server.httpServer;
      if (!http) return;
      const sockets = new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 * 1024 });
      let descartado = false;
      const upgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        if (req.url?.split("?", 1)[0] !== "/api/nina-ligacao") return;
        socket.on("error", () => {});
        const t = setTimeout(() => socket.destroy(), 10_000);
        t.unref();
        void (async () => {
          try {
            const relay = (await server.ssrLoadModule(
              "/src/lib/nina/ligacao/sessao-live.server.ts",
            )) as typeof import("../src/lib/nina/ligacao/sessao-live.server");
            const r = relay.validarUpgrade(requestDoUpgrade(req), { aceitarSemOrigem: true });
            if (r) return recusar(socket, r.status);
            if (socket.destroyed) return;
            sockets.handleUpgrade(req, socket, head, (conexao) => {
              const navegador = socketNode(conexao);
              relay.ligarSessao(
                navegador,
                {
                  waitUntil(tarefa) {
                    void tarefa.catch(() => navegador.close(1011, "Falha"));
                  },
                },
                conectarGateway,
              );
            });
          } catch {
            recusar(socket, 503);
          } finally {
            clearTimeout(t);
          }
        })();
      };
      http.on("upgrade", upgrade);
      descartar = () => {
        if (descartado) return;
        descartado = true;
        http.off("upgrade", upgrade);
        for (const c of sockets.clients) c.terminate();
        sockets.close();
      };
      http.once("close", descartar);
    },
    closeBundle() {
      descartar();
    },
  };
}
