import { createFileRoute } from "@tanstack/react-router";

/**
 * Download da Área do Paciente. Exige: link válido (≤5 min), a MESMA sessão
 * do paciente que gerou o link (cookie), e o arquivo ainda ser do paciente e
 * liberado no momento do download.
 */
const NEGADO = () =>
  new Response("Link expirado ou indisponível. Volte à Área do Paciente e tente de novo.", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });

function disposicao(nome: string, inline: boolean) {
  const ascii = nome.replace(/[^\w.\- ]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`;
}

export const Route = createFileRoute("/api/public/portal-arquivo")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("t") ?? "";
        if (token.length < 20 || token.length > 100) return NEGADO();
        const s = await import("@/lib/portal-paciente/portal.server");
        const { getCookie } = await import("@tanstack/react-start/server");
        const { linkValido } = await import("@/lib/portal-paciente/regras-fase2");
        const { sessaoValida } = await import("@/lib/portal-paciente/regras");
        const db = await s.admin();
        const { data: link } = await db
          .from("portal_links")
          .select("clinica_id, paciente_id, sessao_id, tipo, ref_id, expira_em")
          .eq("token_hash", await s.hmac("link", token))
          .maybeSingle();
        if (!link || !linkValido(link.expira_em, new Date())) return NEGADO();
        const cookie = getCookie(s.COOKIE_SESSAO);
        if (!cookie) return NEGADO();
        const { data: sessao } = await db
          .from("portal_sessoes")
          .select("id, clinica_id, paciente_id, token_hash, ultimo_uso_em, expira_max_em, encerrada_em")
          .eq("id", link.sessao_id)
          .maybeSingle();
        if (
          !sessao ||
          sessao.token_hash !== (await s.hmac("sessao", cookie)) ||
          !sessaoValida(sessao, new Date()) ||
          sessao.clinica_id !== link.clinica_id ||
          sessao.paciente_id !== link.paciente_id
        )
          return NEGADO();
        const { data: cfg } = await db
          .from("portal_paciente_config")
          .select("ativo")
          .eq("clinica_id", link.clinica_id)
          .maybeSingle();
        if (!cfg?.ativo) return NEGADO();

        const { carregarArquivo } = await import("@/lib/portal-paciente/arquivos.server");
        const dono = { clinica_id: link.clinica_id, paciente_id: link.paciente_id };
        const arq = await carregarArquivo(dono, link.tipo as never, link.ref_id, { conteudo: true });
        if (!arq) return NEGADO();
        const comum = {
          "cache-control": "no-store, private",
          "x-content-type-options": "nosniff",
          "referrer-policy": "no-referrer",
          "x-robots-tag": "noindex",
        };
        await s.auditar({
          clinica_id: link.clinica_id,
          paciente_id: link.paciente_id,
          evento: "baixou_arquivo",
          detalhe: { tipo: link.tipo, ref_id: link.ref_id },
        });
        if (arq.tipo === "html") {
          return new Response(arq.html, {
            headers: {
              ...comum,
              "content-type": "text/html; charset=utf-8",
              "content-disposition": disposicao(arq.nome, true),
              "content-security-policy":
                "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: https:; frame-ancestors 'none'",
            },
          });
        }
        const res = await fetch(arq.url);
        if (!res.ok) {
          console.error("[portal] nfse download", res.status);
          return new Response("Não foi possível obter o arquivo agora. Tente mais tarde.", {
            status: 502,
            headers: { ...comum, "content-type": "text/plain; charset=utf-8" },
          });
        }
        return new Response(res.body, {
          headers: {
            ...comum,
            "content-type": arq.mime,
            "content-disposition": disposicao(arq.nome, arq.mime === "application/pdf"),
          },
        });
      },
    },
  },
});
