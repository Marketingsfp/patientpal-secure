import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/focusnfe/debug")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const ref = url.searchParams.get("ref");
        if (!ref) return new Response("missing ref", { status: 400 });
        const token = process.env.FOCUS_NFE_TOKEN_PROD;
        if (!token) return new Response("no token", { status: 500 });
        const b64 = Buffer.from(`${token}:`).toString("base64");
        const resp = await fetch(`https://api.focusnfe.com.br/v2/nfse/${encodeURIComponent(ref)}`, {
          headers: { Authorization: `Basic ${b64}` },
        });
        const body = await resp.text();
        return new Response(body, { status: resp.status, headers: { "content-type": "application/json" } });
      },
    },
  },
});