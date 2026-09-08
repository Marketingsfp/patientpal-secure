
/* =========================================================
 *  FASE 3 — gate da distribuição automática
 * ======================================================= */
describe("FASE 3 — elegibilidade e atribuição automática", () => {
  const base = (userId: string, over: Partial<CandidatoDistribuicao> = {}): CandidatoDistribuicao => ({
    userId,
    temTelefonia: true,
    status: "ONLINE",
    aceitaNovas: true,
    presencaRecente: true,
    cargaAtiva: 0,
    ...over,
  });

  it("1 Telefonia Online recebe a conversa", () => {
    const r = simularAtribuicao([base("ana")]);
    expect(r.assignment_occurred).toBe(true);
    expect(r.atribuido_a).toBe("ana");
  });

  it("3 Telefonia Online: distribui equilibrado, sem repetir sempre o primeiro", () => {
    const { atribuicoes, naoAtribuidas } = simularFila(
      [base("ana"), base("bia"), base("caio")],
      6,
    );
    expect(naoAtribuidas).toBe(0);
    const contagem = new Map<string, number>();
    for (const u of atribuicoes) contagem.set(u!, (contagem.get(u!) ?? 0) + 1);
    expect([...contagem.values()].sort()).toEqual([2, 2, 2]);
  });

  it("empate de carga: recebe quem está há mais tempo sem conversa", () => {
    const r = simularAtribuicao([
      base("ana", { cargaAtiva: 2, ultimaAtribuicaoEm: "2026-09-08T12:00:00Z" }),
      base("bia", { cargaAtiva: 2, ultimaAtribuicaoEm: "2026-09-08T09:00:00Z" }),
    ]);
    expect(r.atribuido_a).toBe("bia");
  });

  it("entrou em Pausa durante a seleção: escolhe outra atendente", () => {
    const r = simularAtribuicao([base("ana"), base("bia", { cargaAtiva: 1 })], {
      revalidar: (id) => (id === "ana" ? base("ana", { emPausa: true }) : null),
    });
    expect(r.atribuido_a).toBe("bia");
  });

  it("duas conversas simultâneas não vão para a mesma pessoa por padrão", () => {
    const { atribuicoes } = simularFila([base("ana"), base("bia")], 2);
    expect(new Set(atribuicoes).size).toBe(2);
  });

  it("usuário sem Telefonia nunca recebe", () => {
    const r = simularAtribuicao([base("sem", { temTelefonia: false })]);
    expect(r.destino).toBe("nao_atribuidas");
  });

  it("Admin com Telefonia continua fora da distribuição", () => {
    const r = simularAtribuicao([base("chefe", { admin: true })]);
    expect(r.atribuido_a).toBeNull();
  });

  it("ninguém elegível: conversa fica em Não atribuídas", () => {
    const r = simularAtribuicao([
      base("ana", { status: "OFFLINE" }),
      base("bia", { emPausa: true }),
      base("caio", { temTelefonia: false }),
    ]);
    expect(r.destino).toBe("nao_atribuidas");
    expect(r.atribuido_a).toBeNull();
  });

  it("capacidade lotada tira do balanceamento em vez de sobrecarregar", () => {
    const r = simularAtribuicao([
      base("ana", { cargaAtiva: 5, capacidadeMaxima: 5 }),
      base("bia", { cargaAtiva: 4, capacidadeMaxima: 5 }),
    ]);
    expect(r.atribuido_a).toBe("bia");
    expect(
      simularAtribuicao([base("ana", { cargaAtiva: 5, capacidadeMaxima: 5 })]).destino,
    ).toBe("nao_atribuidas");
  });

  it("todos descartados na revalidação: fila, nunca alguém offline", () => {
    const r = simularAtribuicao([base("ana"), base("bia")], {
      revalidar: (id) => base(id, { status: "OFFLINE" }),
    });
    expect(r.atribuido_a).toBeNull();
  });
});
