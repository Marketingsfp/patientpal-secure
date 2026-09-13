/** Histórico confiável para interpretar aceite de consulta, separado do resumo enviado ao modelo. */
type MensagemDaConversa = {
  id?: string | null;
  conversa_id?: string | null;
  direction?: string | null;
  body?: string | null;
  status?: string | null;
  created_at?: string | null;
  is_teste?: boolean | null;
};

export function historicoParaConsultaAgenda(
  mensagens: ReadonlyArray<MensagemDaConversa>,
  contexto: {
    conversaId: string | null;
    inicioSessao: string | null;
    corteMemoria: number;
    teste: boolean;
    idsDoTurno: ReadonlySet<string>;
  },
): Array<{ role: string; content: string }> {
  const inicio = Date.parse(contexto.inicioSessao ?? "");
  if (!contexto.conversaId || !Number.isFinite(inicio)) return [];
  const corte = Math.max(inicio, contexto.corteMemoria);
  return mensagens
    .filter((m) => {
      if (m.conversa_id !== contexto.conversaId || (m.is_teste === true) !== contexto.teste)
        return false;
      if (m.id && contexto.idsDoTurno.has(m.id)) return false;
      const data = Date.parse(m.created_at ?? "");
      if (!Number.isFinite(data) || data < corte || !m.body?.trim()) return false;
      return m.direction === "out"
        ? ["sent", "delivered", "read"].includes(m.status ?? "")
        : m.direction === "in" && m.status === "received";
    })
    .slice()
    .sort((a, b) => Date.parse(a.created_at!) - Date.parse(b.created_at!))
    .map((m) => ({ role: m.direction === "out" ? "assistant" : "user", content: m.body! }));
}
