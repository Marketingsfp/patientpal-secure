const url = process.env["SUPABASE_URL"]!;
const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;
const r = await fetch(`${url}/rest/v1/rpc/nina_instrucoes_publicar`, {
  method: "POST",
  headers: { apikey: key, "Content-Type": "application/json" },
  body: JSON.stringify({ p_escopo: "whatsapp", p_conteudo: "tentativa sem sessao", p_comentario: null }),
});
console.log("sem sessão ->", r.status, (await r.text()).slice(0, 200));
