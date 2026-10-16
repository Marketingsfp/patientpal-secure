// Funções públicas da Área do Paciente. Nenhuma recebe paciente_id do
// navegador: tudo sai da sessão própria validada no servidor.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isCPFValido } from "@/lib/cpf";
import {
  CAMPOS_SOLICITAVEIS,
  CODIGO_MAX_TENTATIVAS,
  CODIGO_VALIDADE_MIN,
  MSG_CODIGO_INVALIDO,
  MSG_PENDENCIA,
  apenasDigitos,
  diferencasCadastro,
  idadeEm,
  mascaraFalsa,
  mascararEmail,
  motivoNaoCancela,
  motivoRecusaPedido,
  podeConfirmar,
} from "./regras";

const clinicaParam = z.string().max(64).optional().nullable();
const MSG_INDISPONIVEL = "A Área do Paciente não está disponível neste endereço.";

async function srv() {
  return import("./portal.server");
}

type PacienteBusca = {
  id: string;
  email: string | null;
  data_nascimento: string | null;
  updated_at: string;
};

async function buscarPorCpf(clinicaId: string, cpf: string): Promise<PacienteBusca[]> {
  const { admin } = await srv();
  const db = await admin();
  const { data } = await db
    .from("pacientes")
    .select("id, email, data_nascimento, updated_at")
    .eq("clinica_id", clinicaId)
    .eq("cpf_digits", cpf)
    .eq("ativo", true)
    .is("unificado_para_id", null)
    .order("updated_at", { ascending: false })
    .limit(5);
  return (data ?? []) as PacienteBusca[];
}

/** Marca da clínica + se o portal está ligado. */
export const portalInfo = createServerFn({ method: "POST" })
  .inputValidator((d: { clinica?: string | null }) => z.object({ clinica: clinicaParam }).parse(d))
  .handler(async ({ data }) => {
    const { clinicaDoPortal, admin } = await srv();
    const clinicaId = await clinicaDoPortal(data.clinica);
    if (!clinicaId) return { ativo: false as const };
    const db = await admin();
    const { data: c } = await db.from("clinicas").select("nome, telefone").eq("id", clinicaId).maybeSingle();
    return { ativo: true as const, nome: c?.nome ?? "", telefone: c?.telefone ?? null };
  });

/** Passo 1. Resposta sempre igual, exista ou não o CPF. */
export const solicitarCodigo = createServerFn({ method: "POST" })
  .inputValidator((d: { clinica?: string | null; cpf: string }) =>
    z.object({ clinica: clinicaParam, cpf: z.string().max(20) }).parse(d),
  )
  .handler(async ({ data }) => {
    const s = await srv();
    const clinicaId = await s.clinicaDoPortal(data.clinica);
    if (!clinicaId) throw new Error(MSG_INDISPONIVEL);
    const cpf = apenasDigitos(data.cpf);
    if (!isCPFValido(cpf)) throw new Error("Confira o CPF digitado.");
    const cpfHash = await s.hmac("cpf", `${clinicaId}:${cpf}`);
    const ipH = await s.ipHash();
    const db = await s.admin();
    const agora = Date.now();
    const iso = (ms: number) => new Date(agora - ms).toISOString();
    const conta = async (col: "cpf_hash" | "ip_hash", v: string, desde: string, extra?: "invalidado") => {
      let q = db.from("portal_otps").select("id", { count: "exact", head: true }).eq(col, v).gte("criado_em", desde);
      if (col === "cpf_hash") q = q.eq("clinica_id", clinicaId);
      if (extra) q = q.eq("invalidado", true);
      const { count } = await q;
      return count ?? 0;
    };
    const [cpf15min, cpfDia, ip15min, bloqueiosRecentes] = await Promise.all([
      conta("cpf_hash", cpfHash, iso(15 * 60_000)),
      conta("cpf_hash", cpfHash, iso(24 * 3_600_000)),
      conta("ip_hash", ipH, iso(15 * 60_000)),
      conta("cpf_hash", cpfHash, iso(30 * 60_000), "invalidado"),
    ]);
    const recusa = motivoRecusaPedido({ cpf15min, cpfDia, ip15min, bloqueiosRecentes });

    const pacientes = recusa ? [] : await buscarPorCpf(clinicaId, cpf);
    const comEmail = pacientes.find((p) => (p.email ?? "").includes("@"));
    const mascara = comEmail ? mascararEmail(comEmail.email!) : mascaraFalsa(cpfHash);
    const resposta = {
      ok: true as const,
      destino: mascara,
      mensagem: `Se o CPF estiver cadastrado, enviamos um código para ${mascara}. Ele vale ${CODIGO_VALIDADE_MIN} minutos.`,
    };

    if (recusa) {
      await s.auditar({ clinica_id: clinicaId, evento: "codigo_recusado", cpf_hash: cpfHash, detalhe: { motivo: recusa } });
      return resposta;
    }

    // Todo pedido conta no limite, mesmo sem cadastro.
    const codigo = s.codigoAleatorio();
    const unico = pacientes.length === 1 ? pacientes[0] : null;
    const { data: otp } = await db
      .from("portal_otps")
      .insert({
        clinica_id: clinicaId,
        cpf_hash: cpfHash,
        paciente_id: unico?.id ?? null,
        codigo_hash: comEmail ? await s.hmac("otp", codigo) : null,
        expira_em: new Date(agora + CODIGO_VALIDADE_MIN * 60_000).toISOString(),
        ip_hash: ipH,
      })
      .select("id")
      .single();

    if (!comEmail) {
      await s.auditar({
        clinica_id: clinicaId,
        evento: pacientes.length ? "codigo_sem_email" : "codigo_cpf_nao_encontrado",
        cpf_hash: cpfHash,
        paciente_id: unico?.id ?? null,
      });
      return resposta;
    }
    // Invalida códigos anteriores deste CPF.
    await db
      .from("portal_otps")
      .update({ invalidado: true })
      .eq("clinica_id", clinicaId)
      .eq("cpf_hash", cpfHash)
      .is("usado_em", null)
      .neq("id", otp!.id)
      .lt("tentativas", CODIGO_MAX_TENTATIVAS);
    const { data: cl } = await db.from("clinicas").select("nome").eq("id", clinicaId).maybeSingle();
    const enviado = await s.enviarCodigoEmail({ clinicaNome: cl?.nome ?? "", email: comEmail.email!, codigo });
    if (enviado) await db.from("portal_otps").update({ enviado: true }).eq("id", otp!.id);
    await s.auditar({
      clinica_id: clinicaId,
      evento: enviado ? "codigo_enviado" : "codigo_envio_indisponivel",
      cpf_hash: cpfHash,
      paciente_id: unico?.id ?? null,
    });
    return resposta;
  });

/** Passo 2. Confere o código; cria a sessão. */
export const verificarCodigo = createServerFn({ method: "POST" })
  .inputValidator((d: { clinica?: string | null; cpf: string; codigo: string }) =>
    z.object({ clinica: clinicaParam, cpf: z.string().max(20), codigo: z.string().max(10) }).parse(d),
  )
  .handler(async ({ data }) => {
    const s = await srv();
    const clinicaId = await s.clinicaDoPortal(data.clinica);
    if (!clinicaId) throw new Error(MSG_INDISPONIVEL);
    const cpf = apenasDigitos(data.cpf);
    const codigo = apenasDigitos(data.codigo);
    const cpfHash = await s.hmac("cpf", `${clinicaId}:${cpf}`);
    const db = await s.admin();
    const { data: otp } = await db
      .from("portal_otps")
      .select("id, codigo_hash, tentativas, expira_em")
      .eq("clinica_id", clinicaId)
      .eq("cpf_hash", cpfHash)
      .is("usado_em", null)
      .eq("invalidado", false)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!otp || new Date(otp.expira_em).getTime() < Date.now()) {
      await s.auditar({ clinica_id: clinicaId, evento: "login_falhou", cpf_hash: cpfHash, detalhe: { motivo: "sem_codigo" } });
      return { status: "erro" as const, mensagem: MSG_CODIGO_INVALIDO };
    }
    const confere = !!otp.codigo_hash && codigo.length === 6 && (await s.hmac("otp", codigo)) === otp.codigo_hash;
    if (!confere) {
      const tentativas = otp.tentativas + 1;
      await db
        .from("portal_otps")
        .update({ tentativas, invalidado: tentativas >= CODIGO_MAX_TENTATIVAS })
        .eq("id", otp.id);
      await s.auditar({ clinica_id: clinicaId, evento: "login_falhou", cpf_hash: cpfHash, detalhe: { tentativas } });
      return { status: "erro" as const, mensagem: MSG_CODIGO_INVALIDO };
    }
    await db.from("portal_otps").update({ usado_em: new Date().toISOString() }).eq("id", otp.id);

    const pacientes = await buscarPorCpf(clinicaId, cpf);
    if (pacientes.length !== 1) {
      await s.auditar({
        clinica_id: clinicaId,
        evento: "pendencia_cpf_repetido",
        cpf_hash: cpfHash,
        detalhe: { cadastros: pacientes.map((p) => p.id) },
      });
      return { status: "pendencia" as const, mensagem: MSG_PENDENCIA };
    }
    const p = pacientes[0];
    const idade = idadeEm(p.data_nascimento, new Date());
    if (idade !== null && idade < 18) {
      await s.auditar({ clinica_id: clinicaId, evento: "pendencia_menor", cpf_hash: cpfHash, paciente_id: p.id });
      return { status: "pendencia" as const, mensagem: MSG_PENDENCIA };
    }
    await s.criarSessao(clinicaId, p.id);
    await s.auditar({ clinica_id: clinicaId, evento: "login_ok", cpf_hash: cpfHash, paciente_id: p.id });
    return { status: "ok" as const };
  });

export const minhaSessao = createServerFn({ method: "POST" })
  .inputValidator((d: { clinica?: string | null }) => z.object({ clinica: clinicaParam }).parse(d))
  .handler(async ({ data }) => {
    const s = await srv();
    const sessao = await s.sessaoAtual(data.clinica);
    if (!sessao) return { logado: false as const };
    const db = await s.admin();
    const { data: p } = await db
      .from("pacientes")
      .select("nome")
      .eq("id", sessao.paciente_id)
      .eq("clinica_id", sessao.clinica_id)
      .maybeSingle();
    const aceito = await s.aceitouTermoAtual(sessao);
    const termo = aceito ? null : await s.termoAtual(sessao.clinica_id);
    return {
      logado: true as const,
      primeiroNome: (p?.nome ?? "").split(" ")[0] ?? "",
      termo,
    };
  });

export const aceitarTermo = createServerFn({ method: "POST" })
  .inputValidator((d: { clinica?: string | null; termoId: string }) =>
    z.object({ clinica: clinicaParam, termoId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const s = await srv();
    const sessao = await s.sessaoAtual(data.clinica);
    if (!sessao) throw new Error("Sua sessão terminou. Entre novamente.");
    const termo = await s.termoAtual(sessao.clinica_id);
    if (!termo || termo.id !== data.termoId) throw new Error("O termo foi atualizado. Recarregue a página.");
    const db = await s.admin();
    await db.from("portal_termo_aceites").upsert(
      {
        clinica_id: sessao.clinica_id,
        paciente_id: sessao.paciente_id,
        termo_id: termo.id,
        ip_hash: await s.ipHash(),
      },
      { onConflict: "paciente_id,termo_id", ignoreDuplicates: true },
    );
    await s.auditar({
      clinica_id: sessao.clinica_id,
      paciente_id: sessao.paciente_id,
      evento: "termo_aceito",
      detalhe: { versao: termo.versao },
    });
    return { ok: true };
  });

export const sairPortal = createServerFn({ method: "POST" })
  .inputValidator((d: { clinica?: string | null }) => z.object({ clinica: clinicaParam }).parse(d))
  .handler(async ({ data }) => {
    const s = await srv();
    const sessao = await s.sessaoAtual(data.clinica);
    if (sessao) await s.auditar({ clinica_id: sessao.clinica_id, paciente_id: sessao.paciente_id, evento: "logout" });
    await s.encerrarSessao();
    return { ok: true };
  });

// ---------------- Agendamentos ----------------

type AgLinha = {
  id: string;
  inicio: string;
  status: string;
  procedimento: string | null;
  pacote_id: string | null;
  data_pagamento: string | null;
  medicos: { nome: string | null; especialidades: { nome: string | null } | null } | null;
};

async function lerAgendamentos(clinicaId: string, pacienteId: string, id?: string) {
  const { admin } = await srv();
  const db = await admin();
  let q = db
    .from("agendamentos")
    .select("id, inicio, status, procedimento, pacote_id, data_pagamento, medicos(nome, especialidades(nome))")
    .eq("clinica_id", clinicaId)
    .eq("paciente_id", pacienteId)
    .order("inicio", { ascending: false })
    .limit(60);
  if (id) q = q.eq("id", id);
  const { data, error } = await q;
  if (error) throw new Error("Não foi possível carregar seus agendamentos.");
  const linhas = (data ?? []) as unknown as AgLinha[];
  const ids = linhas.map((l) => l.id);
  const pagos = new Set<string>();
  if (ids.length) {
    const { data: fin } = await db
      .from("fin_atendimentos")
      .select("agendamento_id, status")
      .in("agendamento_id", ids);
    for (const f of fin ?? []) if (f.agendamento_id && f.status !== "cancelado") pagos.add(f.agendamento_id);
  }
  return linhas.map((l) => ({ ...l, pago: !!l.data_pagamento || pagos.has(l.id) }));
}

async function horasCancelar(clinicaId: string) {
  const { admin } = await srv();
  const db = await admin();
  const { data } = await db
    .from("portal_paciente_config")
    .select("cancelar_horas_min")
    .eq("clinica_id", clinicaId)
    .maybeSingle();
  return data?.cancelar_horas_min ?? 2;
}

export const meusAgendamentos = createServerFn({ method: "POST" })
  .inputValidator((d: { clinica?: string | null }) => z.object({ clinica: clinicaParam }).parse(d))
  .handler(async ({ data }) => {
    const s = await srv();
    const sessao = await s.exigirSessao(data.clinica);
    const [linhas, horas] = await Promise.all([
      lerAgendamentos(sessao.clinica_id, sessao.paciente_id),
      horasCancelar(sessao.clinica_id),
    ]);
    const agora = new Date();
    await s.auditar({ clinica_id: sessao.clinica_id, paciente_id: sessao.paciente_id, evento: "ver_agendamentos" });
    return {
      horasCancelar: horas,
      itens: linhas.map((l) => {
        const base = { inicio: l.inicio, status: l.status, pago: l.pago, pacote: !!l.pacote_id };
        return {
          id: l.id,
          inicio: l.inicio,
          status: l.status,
          procedimento: l.procedimento,
          profissional: l.medicos?.nome ?? null,
          especialidade: l.medicos?.especialidades?.nome ?? null,
          futuro: new Date(l.inicio).getTime() > agora.getTime(),
          podeConfirmar: podeConfirmar(base, agora),
          motivoNaoCancela: motivoNaoCancela(base, agora, horas),
        };
      }),
    };
  });

export const confirmarAgendamento = createServerFn({ method: "POST" })
  .inputValidator((d: { clinica?: string | null; id: string }) =>
    z.object({ clinica: clinicaParam, id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const s = await srv();
    const sessao = await s.exigirSessao(data.clinica);
    const [ag] = await lerAgendamentos(sessao.clinica_id, sessao.paciente_id, data.id);
    if (!ag) throw new Error("Agendamento não encontrado.");
    if (!podeConfirmar({ inicio: ag.inicio, status: ag.status, pago: ag.pago, pacote: !!ag.pacote_id }, new Date()))
      throw new Error("Este agendamento não pode ser confirmado.");
    const db = await s.admin();
    const { error } = await db
      .from("agendamentos")
      .update({ status: "confirmado" })
      .eq("id", ag.id)
      .eq("clinica_id", sessao.clinica_id)
      .eq("paciente_id", sessao.paciente_id)
      .eq("status", "agendado");
    if (error) throw new Error("Não foi possível confirmar agora.");
    await s.auditar({ clinica_id: sessao.clinica_id, paciente_id: sessao.paciente_id, evento: "confirmou_agendamento", detalhe: { agendamento_id: ag.id } });
    return { ok: true };
  });

export const cancelarAgendamento = createServerFn({ method: "POST" })
  .inputValidator((d: { clinica?: string | null; id: string }) =>
    z.object({ clinica: clinicaParam, id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const s = await srv();
    const sessao = await s.exigirSessao(data.clinica);
    const [ag] = await lerAgendamentos(sessao.clinica_id, sessao.paciente_id, data.id);
    if (!ag) throw new Error("Agendamento não encontrado.");
    const motivo = motivoNaoCancela(
      { inicio: ag.inicio, status: ag.status, pago: ag.pago, pacote: !!ag.pacote_id },
      new Date(),
      await horasCancelar(sessao.clinica_id),
    );
    if (motivo) throw new Error(motivo);
    // Mesmo núcleo da agenda (libera orçamento, desfaz atendimento externo, auditoria).
    const { atualizarStatusAgendamentoCore } = await import("@/lib/agenda/status-agendamento.core.server");
    await atualizarStatusAgendamentoCore(
      {
        db: (await s.admin()) as never,
        ator: {
          tipo: "integracao",
          api_key_id: "area-do-paciente",
          clinica_id: sessao.clinica_id,
          origem_integracao: "area_do_paciente",
          pode_gerenciar_todos: true,
        },
      },
      {
        agendamento_ids: [ag.id],
        novo_status: "cancelado",
        motivo: "Cancelado pelo paciente na Área do Paciente",
      },
    );
    await s.auditar({ clinica_id: sessao.clinica_id, paciente_id: sessao.paciente_id, evento: "cancelou_agendamento", detalhe: { agendamento_id: ag.id } });
    return { ok: true };
  });

// ---------------- Cadastro ----------------

const camposCadastro = "nome, cpf_digits, data_nascimento, " + CAMPOS_SOLICITAVEIS.join(", ");

export const meuCadastro = createServerFn({ method: "POST" })
  .inputValidator((d: { clinica?: string | null }) => z.object({ clinica: clinicaParam }).parse(d))
  .handler(async ({ data }) => {
    const s = await srv();
    const sessao = await s.exigirSessao(data.clinica);
    const db = await s.admin();
    const { data: p } = await db
      .from("pacientes")
      .select(camposCadastro)
      .eq("id", sessao.paciente_id)
      .eq("clinica_id", sessao.clinica_id)
      .maybeSingle();
    if (!p) throw new Error("Cadastro não encontrado.");
    const reg = p as unknown as Record<string, string | null>;
    const { data: pend } = await db
      .from("portal_solicitacoes_cadastro")
      .select("id, criado_em, dados_novos")
      .eq("paciente_id", sessao.paciente_id)
      .eq("clinica_id", sessao.clinica_id)
      .eq("status", "pendente")
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    await s.auditar({ clinica_id: sessao.clinica_id, paciente_id: sessao.paciente_id, evento: "ver_cadastro" });
    const cpf = reg.cpf_digits ?? "";
    const dados: Record<string, string | null> = {};
    for (const k of CAMPOS_SOLICITAVEIS) dados[k] = reg[k] ?? null;
    return {
      nome: reg.nome,
      cpfMascarado: cpf.length === 11 ? `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**` : "",
      dataNascimento: reg.data_nascimento,
      dados,
      pendente: pend ? { criado_em: pend.criado_em, dados_novos: pend.dados_novos as Record<string, string> } : null,
    };
  });

const schemaSolic = z.object(
  Object.fromEntries(CAMPOS_SOLICITAVEIS.map((k) => [k, z.string().max(200).optional()])) as Record<
    (typeof CAMPOS_SOLICITAVEIS)[number],
    z.ZodOptional<z.ZodString>
  >,
);

export const solicitarAlteracaoCadastro = createServerFn({ method: "POST" })
  .inputValidator((d: { clinica?: string | null; dados: Record<string, string> }) =>
    z.object({ clinica: clinicaParam, dados: schemaSolic }).parse(d),
  )
  .handler(async ({ data }) => {
    const s = await srv();
    const sessao = await s.exigirSessao(data.clinica);
    const db = await s.admin();
    const { data: p } = await db
      .from("pacientes")
      .select(CAMPOS_SOLICITAVEIS.join(", "))
      .eq("id", sessao.paciente_id)
      .eq("clinica_id", sessao.clinica_id)
      .maybeSingle();
    if (!p) throw new Error("Cadastro não encontrado.");
    const atual = p as unknown as Record<string, string | null>;
    const novos = diferencasCadastro(atual, data.dados);
    if (novos.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(novos.email)) throw new Error("Confira o e-mail.");
    if (novos.telefone && (novos.telefone.length < 10 || novos.telefone.length > 11))
      throw new Error("Confira o telefone com DDD.");
    const chaves = Object.keys(novos);
    if (!chaves.length) throw new Error("Nenhum dado foi alterado.");
    const anteriores: Record<string, string | null> = {};
    for (const k of chaves) anteriores[k] = atual[k] ?? null;
    // Uma solicitação aberta por vez: a nova substitui a anterior.
    await db
      .from("portal_solicitacoes_cadastro")
      .update({ status: "cancelada", decidido_em: new Date().toISOString(), observacao: "Substituída pelo paciente" })
      .eq("paciente_id", sessao.paciente_id)
      .eq("clinica_id", sessao.clinica_id)
      .eq("status", "pendente");
    const { error } = await db.from("portal_solicitacoes_cadastro").insert({
      clinica_id: sessao.clinica_id,
      paciente_id: sessao.paciente_id,
      dados_novos: novos as never,
      dados_anteriores: anteriores as never,
    });
    if (error) throw new Error("Não foi possível enviar agora.");
    await s.auditar({ clinica_id: sessao.clinica_id, paciente_id: sessao.paciente_id, evento: "solicitou_alteracao", detalhe: { campos: chaves } });
    return { ok: true };
  });
