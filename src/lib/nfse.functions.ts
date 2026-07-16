import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FOCUS_API = "https://api.focusnfe.com.br/v2";
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

function focusNfseBase(emitente: { usar_ambiente_nacional?: boolean | null } | null | undefined) {
  // Ambiente Nacional NFS-e usa o endpoint /v2/nfsen. Municípios que não
  // aderiram ainda usam o endpoint municipal /v2/nfse.
  return emitente?.usar_ambiente_nacional ? `${FOCUS_API}/nfsen` : `${FOCUS_API}/nfse`;
}

function authHeader(token: string) {
  // Focus NFe usa Basic Auth: base64(token + ":")
  const b64 = Buffer.from(`${token}:`).toString("base64");
  return `Basic ${b64}`;
}

/**
 * O Ambiente Nacional /v2/nfsen é assíncrono: o POST responde
 * `processando_autorizacao` e o resultado real (autorizado / erro_autorizacao
 * com códigos como E0014) só aparece via GET segundos depois. Esta função
 * faz polling até obter status terminal ou timeout.
 */
async function pollFocusTerminal(
  baseUrl: string,
  ref: string,
  token: string,
  maxAttempts = 8,
  intervalMs = 1500,
): Promise<{ status?: string; erros?: Array<{ codigo?: string; mensagem?: string }>; mensagem?: string } & Record<string, unknown>> {
  let last: Record<string, unknown> = {};
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    try {
      const r = await fetch(`${baseUrl}/${encodeURIComponent(ref)}`, {
        headers: { Authorization: authHeader(token) },
      });
      last = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      const s = (last as { status?: string }).status;
      if (s && s !== "processando_autorizacao" && s !== "processando") return last as never;
    } catch {
      // ignora — tenta de novo
    }
  }
  return last as never;
}

function only(s: string | null | undefined) {
  return (s ?? "").replace(/\D/g, "");
}

function normalizeCodigoTributarioMunicipio(value: string | null | undefined) {
  const digits = only(value);
  if (!digits) return undefined;
  if (!/^\d{3}$/.test(digits)) {
    throw new Error(
      `Cód. Tributário Município inválido (${digits}). Informe o código municipal do serviço com 3 dígitos (cTribMun); não use o código IBGE do município (7 dígitos) nesse campo.`,
    );
  }
  return digits;
}

async function buscarCodigoMunicipioPorCep(cep: string | null | undefined) {
  const digits = only(cep);
  if (!/^\d{8}$/.test(digits)) return undefined;

  try {
    const resp = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (!resp.ok) return undefined;
    const body = (await resp.json().catch(() => null)) as { erro?: boolean; ibge?: string } | null;
    const ibge = only(body?.ibge);
    return body?.erro || !/^\d{7}$/.test(ibge) ? undefined : ibge;
  } catch {
    return undefined;
  }
}

/**
 * Emite uma NFS-e via Focus NFe.
 * Cria um registro local em `nfse` e dispara o envio assíncrono ao Focus.
 */
export const emitirNfse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      emitenteId: z.string().uuid(),
      pacienteId: z.string().uuid().optional(),
      pagamentoId: z.string().uuid().optional(),
      agendamentoId: z.string().uuid().optional(),
      valorServicos: z.number().positive(),
      descricaoServicos: z.string().min(1).max(2000),
      tomador: z.object({
        nome: z.string().min(2),
        cpfCnpj: z.string().optional(),
        email: z.string().email().optional(),
        cep: z.string().optional(),
        logradouro: z.string().optional(),
        numero: z.string().optional(),
        bairro: z.string().optional(),
        municipio: z.string().optional(),
        codigoMunicipio: z.string().optional(),
        uf: z.string().optional(),
      }),
      aliquotaIssOverride: z.number().min(0).max(1).optional(),
      itemListaOverride: z.string().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    let { data: emitente, error: errEmit } = await supabase
      .from("nfse_emitentes")
      .select("*")
      .eq("id", data.emitenteId)
      .single();
    if (errEmit || !emitente) throw new Error("Emitente não encontrado");

    // Regra de negócio: toda NFS-e de CONSULTA deve ser emitida no CNPJ
    // 31.919.483/0003-18 (CASA DE SAUDE E MATERNIDADE), independente do
    // emitente escolhido pelo usuário. Detecta "consulta" na descrição.
    const CONSULTA_CNPJ = "31919483000318";
    const ehConsulta = /consulta/i.test(data.descricaoServicos ?? "");
    // Exames vão para MA IMAGENS (CNPJ 57.786.061/0001-43).
    const EXAME_CNPJ = "57786061000143";
    const desc = (data.descricaoServicos ?? "").toLowerCase();
    const ehExame = /\bexam|ultrassom|ultra-?som|raio.?x|raio x|radiograf|tomograf|ressonan|mamograf|densitometr|ecocardio|eletrocardio|\becg\b|\beeg\b|holter|endoscop|colonoscop|doppler|ecograf/i.test(desc);

    const alvoCnpj = ehExame ? EXAME_CNPJ : ehConsulta ? CONSULTA_CNPJ : null;
    const alvoCnpjFormatado = ehExame ? "57.786.061/0001-43" : "31.919.483/0003-18";
    const alvoNome = ehExame ? "MA IMAGENS" : "CASA DE SAUDE E MATERNIDADE";

    if (alvoCnpj && only(emitente.cnpj) !== alvoCnpj) {
      const { data: emitConsulta } = await supabase
        .from("nfse_emitentes")
        .select("*")
        .eq("clinica_id", emitente.clinica_id)
        .eq("ativo", true)
        .eq("cnpj", alvoCnpjFormatado)
        .maybeSingle();
      if (emitConsulta) {
        emitente = emitConsulta;
      } else {
        throw new Error(
          `Emitente ${alvoNome} (CNPJ ${alvoCnpjFormatado}) não cadastrado/ativo — necessário para esta NFS-e.`,
        );
      }
    }

    const token =
      emitente.focus_ambiente === "producao"
        ? process.env.FOCUS_NFE_TOKEN_PROD
        : process.env.FOCUS_NFE_TOKEN_HML ?? process.env.FOCUS_NFE_TOKEN_PROD;
    if (!token) throw new Error("Token Focus NFe não configurado");

    const aliquota = data.aliquotaIssOverride ?? Number(emitente.aliquota_iss ?? 0.02);
    const valorIss = +(data.valorServicos * aliquota).toFixed(2);
    const ref = `nfse-${emitente.id.slice(0, 8)}-${Date.now()}`;

    // Focus/Ambiente Nacional NFS-e interpreta o horário no fuso local.
    // Se enviarmos UTC (...Z) a nota fica ~3h no "futuro" e é rejeitada
    // com "data de emissão posterior à data de processamento".
    // Geramos a data já em horário de Brasília (UTC-3) com offset.
    const dataEmissaoBR = (() => {
      // -3h fuso de Brasília + 2 min de buffer (clock skew vs Focus/SEFAZ)
      const now = new Date(Date.now() - 3 * 60 * 60 * 1000 - 2 * 60 * 1000);
      return now.toISOString().replace(/\.\d{3}Z$/, "-03:00");
    })();

    const itemListaServico = only(data.itemListaOverride ?? emitente.item_lista_servico);
    if (!itemListaServico) throw new Error("Informe o código nacional do serviço para emissão da NFS-e.");
    const codigoTributarioMunicipio = normalizeCodigoTributarioMunicipio(emitente.codigo_tributario_municipio);

    const imRaw = only(emitente.inscricao_municipal ?? "");
    const imLower = (emitente.inscricao_municipal ?? "").trim().toLowerCase();
    const inscricaoMunicipal = imRaw && imLower !== "isento" && imLower !== "insento" ? imRaw : undefined;
    const tomadorCodigoMunicipio = data.tomador.logradouro
      ? (await buscarCodigoMunicipioPorCep(data.tomador.cep)) ?? data.tomador.codigoMunicipio ?? emitente.codigo_municipio
      : undefined;
    const regimeTributario = (emitente.regime_tributario ?? "").toLowerCase();
    const codigoOpcaoSimplesNacional = emitente.optante_simples ? (regimeTributario === "mei" ? 2 : 3) : 1;

    const payloadMunicipal = {
      data_emissao: dataEmissaoBR,
      prestador: {
        cnpj: only(emitente.cnpj),
        ...(inscricaoMunicipal ? { inscricao_municipal: inscricaoMunicipal } : {}),
        codigo_municipio: emitente.codigo_municipio,
      },
      tomador: {
        cpf: data.tomador.cpfCnpj && only(data.tomador.cpfCnpj).length === 11 ? only(data.tomador.cpfCnpj) : undefined,
        cnpj: data.tomador.cpfCnpj && only(data.tomador.cpfCnpj).length === 14 ? only(data.tomador.cpfCnpj) : undefined,
        razao_social: data.tomador.nome,
        email: data.tomador.email,
        endereco: data.tomador.logradouro
          ? {
              logradouro: data.tomador.logradouro,
              numero: data.tomador.numero ?? "S/N",
              bairro: data.tomador.bairro ?? "Centro",
              codigo_municipio: tomadorCodigoMunicipio,
              uf: data.tomador.uf ?? emitente.uf,
              cep: only(data.tomador.cep),
            }
          : undefined,
      },
      servico: {
        aliquota: aliquota * 100, // Focus espera percentual (ex: 2.00 = 2%)
        discriminacao: data.descricaoServicos,
        iss_retido: false,
        item_lista_servico: itemListaServico,
        codigo_tributario_municipio: codigoTributarioMunicipio,
        codigo_cnae: only(emitente.codigo_cnae) || undefined,
        valor_servicos: data.valorServicos,
        valor_iss: valorIss,
        exigibilidade_iss: 1,
        municipio_incidencia: emitente.codigo_municipio,
        // NFS-e Nacional (ambiente nacional) — evita E0539 ("ISSQN = 4 Não Incidência"),
        // que ocorre quando este campo não é enviado e assume o default 4.
        tributacao_iss: 1, // 1 = Operação tributável
      },
      optante_simples_nacional: codigoOpcaoSimplesNacional !== 1,
      // NFS-e Nacional: 1 = Não optante; 2 = MEI; 3 = ME/EPP optante.
      codigo_opcao_simples_nacional: codigoOpcaoSimplesNacional,
      regime_especial_tributacao: "0",
      // E0166: para optante SN ME/EPP é obrigatório o regime de apuração dos tributos do SN.
      // 1 = Competência. Sem isso a NFS-e Nacional rejeita.
      ...(codigoOpcaoSimplesNacional === 3 ? { regime_tributario_simples_nacional: 1 } : {}),
      // Bloco <trib> exige tribFed OU totTrib. Sem isto: erro_validacao_schema
      // "Element 'trib': Missing child element(s). Expected is one of (tribFed, totTrib)".
      ...(codigoOpcaoSimplesNacional !== 1
        ? { percentual_total_tributos_simples_nacional: +(aliquota * 100).toFixed(2) }
        : {}),
    };

    // NFS-e Nacional (endpoint /v2/nfsen) usa um payload FLAT diferente,
    // baseado no schema da DPS. Sem isto: "Parâmetro obrigatório
    // cnpj_prestador ou cpf_prestador não informado" (requisicao_invalida).
    const cpfCnpjTomador = only(data.tomador.cpfCnpj);
    const tomadorCodMun = tomadorCodigoMunicipio ?? emitente.codigo_municipio;
    // Endereço do tomador para o Ambiente Nacional (DPS). Sem estes campos a
    // NFS-e sai com o endereço que a Receita tem cadastrado para o CPF/CNPJ,
    // ignorando o cadastro do cliente na clínica. Só envia quando há
    // logradouro cadastrado — do contrário o schema rejeita campos vazios.
    const enderecoTomadorNacional = data.tomador.logradouro
      ? {
          logradouro_tomador: data.tomador.logradouro,
          numero_tomador: data.tomador.numero ?? "S/N",
          bairro_tomador: data.tomador.bairro ?? "Centro",
          cep_tomador: only(data.tomador.cep) || undefined,
          codigo_municipio_tomador: Number(tomadorCodMun),
          uf_tomador: data.tomador.uf ?? emitente.uf,
        }
      : {};
    const payloadNacional = {
      data_emissao: dataEmissaoBR,
      serie_dps: Number(emitente.rps_serie ?? 1) || 1,
      numero_dps: emitente.rps_proximo_numero ?? 1,
      // data_competencia tem que ser <= data_emissao. Usamos a data já em
      // horário de Brasília (mesmo fuso de dataEmissaoBR) para evitar que
      // o UTC "vire o dia" antes do horário local.
      data_competencia: dataEmissaoBR.slice(0, 10),
      emitente_dps: 1, // 1 = prestador
      codigo_municipio_emissora: Number(emitente.codigo_municipio),
      cnpj_prestador: only(emitente.cnpj),
      codigo_opcao_simples_nacional: codigoOpcaoSimplesNacional,
      regime_especial_tributacao: 0,
      ...(cpfCnpjTomador.length === 14 ? { cnpj_tomador: cpfCnpjTomador } : {}),
      ...(cpfCnpjTomador.length === 11 ? { cpf_tomador: cpfCnpjTomador } : {}),
      // <toma> exige um identificador além do CNPJ/CPF — sem xNome (razão social
      // do tomador) o schema rejeita: "Element 'toma': Missing child element(s).
      // Expected is one of (CAEPF, IM, xNome)".
      razao_social_tomador: data.tomador.nome,
      ...enderecoTomadorNacional,
      codigo_municipio_prestacao: Number(tomadorCodMun),
      codigo_tributacao_nacional_iss: itemListaServico,
      ...(codigoTributarioMunicipio ? { codigo_tributacao_municipio: codigoTributarioMunicipio } : {}),
      descricao_servico: data.descricaoServicos,
      valor_servico: data.valorServicos,
      tributacao_iss: 1,
      // <tribMun> exige um dos elementos do choice (tpRetISSQN, tpImunidade,
      // tpSusp, BM, cPaisResult). Como tribISSQN=1 (tributável), enviamos
      // tipo_retencao_iss=1 (Não Retido).
      tipo_retencao_iss: 1,
      // <tribFed> exige PIS/COFINS. Para Simples Nacional usamos CST=08
      // (Operação sem Incidência).
      situacao_tributaria_pis_cofins: "08",
      // <totTrib>: ME/EPP optante do SN -> usar pTotTribSN (E0712 proíbe indTotTrib).
      // Para Não Optante (cod=1) o schema exige o bloco vTotTrib com os
      // valores federais/estaduais/municipais (E0713 rejeita indTotTrib e
      // pTotTribSN). Enviamos zeros quando não há cálculo IBPT disponível.
      ...(codigoOpcaoSimplesNacional !== 1
        ? { percentual_total_tributos_simples_nacional: +(aliquota * 100).toFixed(2) }
        : {
            valor_total_tributos_federais: 0,
            valor_total_tributos_estaduais: 0,
            valor_total_tributos_municipais: 0,
          }),
      // E0166: para optante SN ME/EPP é obrigatório o regime de apuração SN.
      ...(codigoOpcaoSimplesNacional === 3 ? { regime_tributario_simples_nacional: 1 } : {}),
    };

    const payload = emitente.usar_ambiente_nacional ? payloadNacional : payloadMunicipal;

    // Reserva o próximo número de DPS/RPS antes do envio (evita duplicidade).
    if (emitente.usar_ambiente_nacional) {
      await supabase
        .from("nfse_emitentes")
        .update({ rps_proximo_numero: (emitente.rps_proximo_numero ?? 1) + 1 })
        .eq("id", emitente.id);
    }

    // Cria registro local antes do envio (para rastreio mesmo se Focus falhar)
    const { data: nota, error: errIns } = await supabase
      .from("nfse")
      .insert({
        clinica_id: emitente.clinica_id,
        emitente_id: emitente.id,
        paciente_id: data.pacienteId ?? null,
        pagamento_id: data.pagamentoId ?? null,
        agendamento_id: data.agendamentoId ?? null,
        data_emissao: new Date().toISOString().slice(0, 10),
        valor_servicos: data.valorServicos,
        valor_iss: valorIss,
        aliquota_iss: aliquota,
        descricao_servicos: data.descricaoServicos,
        tomador_nome: data.tomador.nome,
        tomador_documento: data.tomador.cpfCnpj ?? null,
        tomador_email: data.tomador.email ?? null,
        tomador_endereco: data.tomador.logradouro ? data.tomador : null,
        focus_ref: ref,
        focus_status: "enviando",
        status: "processando",
        payload_envio: payload,
        emitida_por: userId,
      })
      .select()
      .single();
    if (errIns) throw errIns;

    // Envia para o Focus. Para ambiente nacional, se a prefeitura recusar com
    // E0014 (DPS já existente), o contador local está atrás da realidade —
    // incrementamos numero_dps e reenviamos até achar um número livre.
    const baseUrl = focusNfseBase(emitente);
    const isNacional = !!emitente.usar_ambiente_nacional;
    const MAX_RPS_RETRIES = 10;

    let currentRef = ref;
    let currentNumero = (payloadNacional as { numero_dps?: number }).numero_dps ?? (emitente.rps_proximo_numero ?? 1);
    let resp: Response;
    let body: { status?: string; erros?: Array<{ codigo?: string; mensagem?: string }>; mensagem?: string } = {};
    let attempts = 0;
    let bumpedTo = currentNumero;

    while (true) {
      attempts++;
      resp = await fetch(`${baseUrl}?ref=${encodeURIComponent(currentRef)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader(token) },
        body: JSON.stringify(payload),
      });
      body = (await resp.json().catch(() => ({}))) as typeof body;

      // Endpoint Nacional é assíncrono — o POST retorna `processando_autorizacao`
      // e o E0014 só aparece depois via GET. Sem polling aqui o retry nunca
      // dispararia e a nota ficaria parada num número de DPS já usado.
      if (
        isNacional &&
        (body?.status === "processando_autorizacao" || body?.status === "processando")
      ) {
        body = (await pollFocusTerminal(baseUrl, currentRef, token)) as typeof body;
      }

      // Detecta E0014 — "DPS já existe" — vindo tanto em HTTP 4xx quanto em
      // resposta 2xx com status=erro_autorizacao.
      const erros = Array.isArray(body?.erros) ? body!.erros! : [];
      const e0014 = erros.some((e) => (e?.codigo ?? "").toUpperCase() === "E0014");

      if (!isNacional || !e0014 || attempts >= MAX_RPS_RETRIES) break;

      currentNumero += 1;
      bumpedTo = currentNumero;
      (payloadNacional as { numero_dps: number }).numero_dps = currentNumero;
      currentRef = `${ref}-r${currentNumero}`;
    }

    // Persiste o avanço do contador (mesmo em caso de falha final, para não
    // tentar de novo os mesmos números na próxima emissão).
    if (isNacional && bumpedTo !== (emitente.rps_proximo_numero ?? 1)) {
      await supabase
        .from("nfse_emitentes")
        .update({ rps_proximo_numero: bumpedTo + 1 })
        .eq("id", emitente.id);
    }

    const errosFinal = Array.isArray(body?.erros) ? body.erros! : [];
    const e0014Final = errosFinal.some((e) => (e?.codigo ?? "").toUpperCase() === "E0014");
    if (!resp.ok || (body?.status === "erro_autorizacao" && e0014Final)) {
      await supabase
        .from("nfse")
        .update({
          status: "erro",
          focus_ref: currentRef,
          focus_status: body?.status ?? "erro",
          erro_mensagem:
            (e0014Final
              ? `Após ${attempts} tentativas a prefeitura ainda recusou (E0014 — DPS já existente). Ajuste manualmente o "Próx. nº RPS" do emitente.`
              : body?.mensagem ?? body?.erros?.[0]?.mensagem ?? `HTTP ${resp.status}`),
          payload_envio: payload,
          payload_resposta: body,
        })
        .eq("id", nota.id);
      return { ok: false, id: nota.id, error: body?.mensagem ?? `HTTP ${resp.status}`, body, tentativas: attempts };
    }

    await supabase
      .from("nfse")
      .update({
        focus_ref: currentRef,
        focus_status: body?.status ?? "processando_autorizacao",
        payload_envio: payload,
        payload_resposta: body,
      })
      .eq("id", nota.id);

    return { ok: true, id: nota.id, ref: currentRef, focus: body, tentativas: attempts };
  });

/** Consulta o status atual da nota no Focus NFe e atualiza o registro local. */
export const consultarNfse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: nota, error } = await supabase
      .from("nfse")
      .select("id, focus_ref, emitente_id")
      .eq("id", data.id)
      .single();
    if (error || !nota?.focus_ref) throw new Error("Nota sem referência Focus");

    const { data: emitente } = await supabase
      .from("nfse_emitentes")
      .select("focus_ambiente, usar_ambiente_nacional")
      .eq("id", nota.emitente_id!)
      .single();
    const token =
      emitente?.focus_ambiente === "producao"
        ? process.env.FOCUS_NFE_TOKEN_PROD
        : process.env.FOCUS_NFE_TOKEN_HML ?? process.env.FOCUS_NFE_TOKEN_PROD;
    if (!token) throw new Error("Token Focus NFe não configurado");

    const resp = await fetch(`${focusNfseBase(emitente)}/${nota.focus_ref}`, {
      headers: { Authorization: authHeader(token) },
    });
    const body = await resp.json().catch(() => ({}));

    const updates: Record<string, unknown> = {
      focus_status: body?.status ?? null,
      payload_resposta: body,
    };
    if (body?.status === "autorizado") {
      updates.status = "emitida";
      updates.numero = body?.numero ?? null;
      updates.serie = body?.serie ?? null;
      updates.codigo_verificacao = body?.codigo_verificacao ?? null;
      // url_danfse já vem absoluta (S3). caminho_* é relativo ao host do Focus.
      updates.url_pdf =
        body?.url_danfse ??
        (body?.caminho_danfse ? `https://api.focusnfe.com.br${body?.caminho_danfse}` : null);
      updates.url_xml =
        body?.url_xml_nota_fiscal ??
        (body?.caminho_xml_nota_fiscal ? `https://api.focusnfe.com.br${body?.caminho_xml_nota_fiscal}` : null);
    } else if (body?.status === "cancelado") {
      updates.status = "cancelada";
    } else if (body?.status === "erro_autorizacao" || body?.status === "erro") {
      updates.status = "erro";
      updates.erro_mensagem = body?.mensagem_sefaz ?? body?.mensagem ?? body?.erros?.[0]?.mensagem ?? null;
    }

    await supabase.from("nfse").update(updates as never).eq("id", nota.id);
    return { ok: true, status: body?.status ?? null, body };
  });

/** Cancela uma NFS-e já emitida. */
export const cancelarNfse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), justificativa: z.string().min(15).max(255) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: nota } = await supabase
      .from("nfse")
      .select("focus_ref, emitente_id")
      .eq("id", data.id)
      .single();
    if (!nota?.focus_ref) throw new Error("Nota sem referência Focus");
    const { data: emitente } = await supabase
      .from("nfse_emitentes")
      .select("focus_ambiente, usar_ambiente_nacional")
      .eq("id", nota.emitente_id!)
      .single();
    const token =
      emitente?.focus_ambiente === "producao"
        ? process.env.FOCUS_NFE_TOKEN_PROD
        : process.env.FOCUS_NFE_TOKEN_HML ?? process.env.FOCUS_NFE_TOKEN_PROD;
    if (!token) throw new Error("Token Focus NFe não configurado");

    const resp = await fetch(`${focusNfseBase(emitente)}/${nota.focus_ref}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: authHeader(token) },
      body: JSON.stringify({ justificativa: data.justificativa }),
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, error: body?.mensagem ?? `HTTP ${resp.status}` };

    await supabase
      .from("nfse")
      .update({
        status: "cancelada",
        cancelada_em: new Date().toISOString(),
        cancelada_motivo: data.justificativa,
        payload_resposta: body,
      })
      .eq("id", data.id);
    return { ok: true };
  });

/**
 * Reenvia uma NFS-e a partir de um registro existente (status=erro).
 * Reusa emitente/tomador/valor/descrição da nota original.
 */
/**
 * Avança o contador rps_proximo_numero do emitente. Existe porque o UPDATE
 * direto pelo client pode ser bloqueado silenciosamente por RLS (só managers
 * podem alterar nfse_emitentes) — o usuário fica com a impressão de que
 * "advancei mas continua dando erro E0014" porque o UPDATE simplesmente
 * não afetou nenhuma linha. Aqui rodamos com service role após validar
 * autenticação, e devolvemos o novo valor efetivamente aplicado.
 */
export const avancarRpsProximoNumero = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      emitente_id: z.string().uuid(),
      novo_numero: z.number().int().positive(),
    }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; novo_numero: number; anterior: number } | { ok: false; motivo: string }> => {
    const { supabase } = context;
    // Validação de acesso: o usuário precisa enxergar o emitente (RLS SELECT
    // é liberado só para managers da clínica). Se não vê, não pode avançar.
    const { data: emit, error: selErr } = await supabase
      .from("nfse_emitentes")
      .select("id, rps_proximo_numero, clinica_id")
      .eq("id", data.emitente_id)
      .maybeSingle();
    if (selErr) return { ok: false, motivo: selErr.message };
    if (!emit) return { ok: false, motivo: "Emitente não encontrado ou sem permissão." };
    const anterior = Number(emit.rps_proximo_numero ?? 1);
    if (data.novo_numero <= anterior) {
      return { ok: false, motivo: `O novo número deve ser maior que o atual (${anterior}).` };
    }
    // Faz o UPDATE com service role para contornar RLS quando o usuário tem
    // permissão de módulo (nfse) mas não é manager da clínica.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin
      .from("nfse_emitentes")
      .update({ rps_proximo_numero: data.novo_numero })
      .eq("id", data.emitente_id);
    if (upErr) return { ok: false, motivo: upErr.message };
    return { ok: true, novo_numero: data.novo_numero, anterior };
  });

/**
 * Reenvia uma NFS-e a partir de um registro existente (status=erro).
 * Reusa emitente/tomador/valor/descrição da nota original.
 */
export const reenviarNfse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: nota, error } = await supabase
      .from("nfse")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error || !nota) throw new Error("Nota não encontrada");

    const tomadorEndereco = (nota.tomador_endereco ?? {}) as Record<string, unknown>;
    const emitenteRow = await supabase
      .from("nfse_emitentes")
      .select("*")
      .eq("id", nota.emitente_id!)
      .single();
    const emitente = emitenteRow.data;
    if (!emitente) throw new Error("Emitente não encontrado");

    const token =
      emitente.focus_ambiente === "producao"
        ? process.env.FOCUS_NFE_TOKEN_PROD
        : process.env.FOCUS_NFE_TOKEN_HML ?? process.env.FOCUS_NFE_TOKEN_PROD;
    if (!token) throw new Error("Token Focus NFe não configurado");

    const aliquota = Number(nota.aliquota_iss ?? emitente.aliquota_iss ?? 0.02);
    const valorServicos = Number(nota.valor_servicos);
    const valorIss = +(valorServicos * aliquota).toFixed(2);
    const ref = `nfse-${emitente.id.slice(0, 8)}-${Date.now()}`;

    const dataEmissaoBR = (() => {
      const now = new Date(Date.now() - 3 * 60 * 60 * 1000 - 2 * 60 * 1000);
      return now.toISOString().replace(/\.\d{3}Z$/, "-03:00");
    })();

    const itemListaServico = only(emitente.item_lista_servico);
    if (!itemListaServico) throw new Error("Informe o código nacional do serviço no emitente.");
    const codigoTributarioMunicipio = normalizeCodigoTributarioMunicipio(emitente.codigo_tributario_municipio);

    const cpfCnpj = only(nota.tomador_documento ?? "");
    const imRaw2 = only(emitente.inscricao_municipal ?? "");
    const imLower2 = (emitente.inscricao_municipal ?? "").trim().toLowerCase();
    const inscricaoMunicipal2 = imRaw2 && imLower2 !== "isento" && imLower2 !== "insento" ? imRaw2 : undefined;
    const tomadorCep = only(String(tomadorEndereco.cep ?? ""));
    const tomadorCodigoMunicipio = tomadorEndereco?.logradouro
      ? (await buscarCodigoMunicipioPorCep(tomadorCep)) ?? String(tomadorEndereco.codigoMunicipio ?? emitente.codigo_municipio)
      : undefined;
    const regimeTributario = (emitente.regime_tributario ?? "").toLowerCase();
    const codigoOpcaoSimplesNacional = emitente.optante_simples ? (regimeTributario === "mei" ? 2 : 3) : 1;
    const payloadMunicipal = {
      data_emissao: dataEmissaoBR,
      prestador: {
        cnpj: only(emitente.cnpj),
        ...(inscricaoMunicipal2 ? { inscricao_municipal: inscricaoMunicipal2 } : {}),
        codigo_municipio: emitente.codigo_municipio,
      },
      tomador: {
        cpf: cpfCnpj.length === 11 ? cpfCnpj : undefined,
        cnpj: cpfCnpj.length === 14 ? cpfCnpj : undefined,
        razao_social: nota.tomador_nome,
        email: nota.tomador_email ?? undefined,
        endereco: tomadorEndereco?.logradouro
          ? {
              logradouro: String(tomadorEndereco.logradouro),
              numero: String(tomadorEndereco.numero ?? "S/N"),
              bairro: String(tomadorEndereco.bairro ?? "Centro"),
              codigo_municipio: tomadorCodigoMunicipio,
              uf: String(tomadorEndereco.uf ?? emitente.uf),
              cep: tomadorCep,
            }
          : undefined,
      },
      servico: {
        aliquota: aliquota * 100,
        discriminacao: nota.descricao_servicos,
        iss_retido: false,
        item_lista_servico: itemListaServico,
        codigo_tributario_municipio: codigoTributarioMunicipio,
        codigo_cnae: only(emitente.codigo_cnae) || undefined,
        valor_servicos: valorServicos,
        valor_iss: valorIss,
        exigibilidade_iss: 1,
        municipio_incidencia: emitente.codigo_municipio,
        tributacao_iss: 1, // NFS-e Nacional: 1 = Operação tributável (evita E0539)
      },
      optante_simples_nacional: codigoOpcaoSimplesNacional !== 1,
      codigo_opcao_simples_nacional: codigoOpcaoSimplesNacional, // 1 = não optante; 2 = MEI; 3 = ME/EPP
      regime_especial_tributacao: "0",
      // E0166: para optante SN ME/EPP, regime de apuração é obrigatório (1 = Competência).
      ...(codigoOpcaoSimplesNacional === 3 ? { regime_tributario_simples_nacional: 1 } : {}),
      // Bloco <trib> exige tribFed OU totTrib (evita erro_validacao_schema).
      ...(codigoOpcaoSimplesNacional !== 1
        ? { percentual_total_tributos_simples_nacional: +(aliquota * 100).toFixed(2) }
        : {}),
    };

    const tomadorCodMun = tomadorCodigoMunicipio ?? emitente.codigo_municipio;
    const payloadNacional = {
      data_emissao: dataEmissaoBR,
      serie_dps: Number(emitente.rps_serie ?? 1) || 1,
      numero_dps: emitente.rps_proximo_numero ?? 1,
      data_competencia: dataEmissaoBR.slice(0, 10),
      emitente_dps: 1,
      codigo_municipio_emissora: Number(emitente.codigo_municipio),
      cnpj_prestador: only(emitente.cnpj),
      codigo_opcao_simples_nacional: codigoOpcaoSimplesNacional,
      regime_especial_tributacao: 0,
      ...(cpfCnpj.length === 14 ? { cnpj_tomador: cpfCnpj } : {}),
      ...(cpfCnpj.length === 11 ? { cpf_tomador: cpfCnpj } : {}),
      razao_social_tomador: nota.tomador_nome,
      codigo_municipio_prestacao: Number(tomadorCodMun),
      codigo_tributacao_nacional_iss: itemListaServico,
      ...(codigoTributarioMunicipio ? { codigo_tributacao_municipio: codigoTributarioMunicipio } : {}),
      descricao_servico: nota.descricao_servicos,
      valor_servico: valorServicos,
      tributacao_iss: 1,
      tipo_retencao_iss: 1,
      situacao_tributaria_pis_cofins: "08",
      ...(codigoOpcaoSimplesNacional !== 1
        ? { percentual_total_tributos_simples_nacional: +(aliquota * 100).toFixed(2) }
        : {
            valor_total_tributos_federais: 0,
            valor_total_tributos_estaduais: 0,
            valor_total_tributos_municipais: 0,
          }),
      ...(codigoOpcaoSimplesNacional === 3 ? { regime_tributario_simples_nacional: 1 } : {}),
    };

    const payload = emitente.usar_ambiente_nacional ? payloadNacional : payloadMunicipal;

    await supabase
      .from("nfse")
      .update({
        focus_ref: ref,
        focus_status: "enviando",
        status: "processando",
        erro_mensagem: null,
        payload_envio: payload,
      })
      .eq("id", nota.id);

    // E0014 (DPS já existente) — probing com salto geométrico até encontrar
    // um numero_dps livre. Cada tentativa aqui envolve polling assíncrono
    // no /v2/nfsen, então incrementar de 1 em 1 é lento demais e o time do
    // server function pode estourar. Cresce o salto (1,2,4,8,...) até um
    // teto para varrer faixas grandes com poucas tentativas.
    const baseUrl = focusNfseBase(emitente);
    const isNacional = !!emitente.usar_ambiente_nacional;
    const MAX_RPS_RETRIES = 25;
    const MAX_STEP = 64;
    let currentRef = ref;
    let currentNumero = (payloadNacional as { numero_dps?: number }).numero_dps ?? (emitente.rps_proximo_numero ?? 1);
    let resp: Response;
    let body: { status?: string; erros?: Array<{ codigo?: string; mensagem?: string }>; mensagem?: string } = {};
    let attempts = 0;
    let bumpedTo = currentNumero;

    while (true) {
      attempts++;
      resp = await fetch(`${baseUrl}?ref=${encodeURIComponent(currentRef)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader(token) },
        body: JSON.stringify(payload),
      });
      body = (await resp.json().catch(() => ({}))) as typeof body;
      if (
        isNacional &&
        (body?.status === "processando_autorizacao" || body?.status === "processando")
      ) {
        body = (await pollFocusTerminal(baseUrl, currentRef, token)) as typeof body;
      }
      const erros = Array.isArray(body?.erros) ? body!.erros! : [];
      const e0014 = erros.some((e) => (e?.codigo ?? "").toUpperCase() === "E0014");
      if (!isNacional || !e0014 || attempts >= MAX_RPS_RETRIES) break;
      const step = Math.min(2 ** (attempts - 1), MAX_STEP);
      currentNumero += step;
      bumpedTo = currentNumero;
      (payloadNacional as { numero_dps: number }).numero_dps = currentNumero;
      currentRef = `${ref}-r${currentNumero}`;
    }

    if (isNacional && bumpedTo !== (emitente.rps_proximo_numero ?? 1)) {
      await supabase
        .from("nfse_emitentes")
        .update({ rps_proximo_numero: bumpedTo + 1 })
        .eq("id", emitente.id);
    }

    const errosFinal = Array.isArray(body?.erros) ? body.erros! : [];
    const e0014Final = errosFinal.some((e) => (e?.codigo ?? "").toUpperCase() === "E0014");
    if (!resp.ok || (body?.status === "erro_autorizacao" && e0014Final)) {
      await supabase
        .from("nfse")
        .update({
          status: "erro",
          focus_ref: currentRef,
          focus_status: body?.status ?? "erro",
          erro_mensagem: e0014Final
            ? `Após ${attempts} tentativas a prefeitura ainda recusou (E0014 — DPS já existente). Ajuste manualmente o "Próx. nº RPS" do emitente.`
            : body?.mensagem ?? body?.erros?.[0]?.mensagem ?? `HTTP ${resp.status}`,
          payload_resposta: body,
        })
        .eq("id", nota.id);
      return { ok: false, id: nota.id, error: body?.mensagem ?? `HTTP ${resp.status}`, body, tentativas: attempts };
    }

    await supabase
      .from("nfse")
      .update({
        focus_ref: currentRef,
        focus_status: body?.status ?? "processando_autorizacao",
        payload_resposta: body,
      })
      .eq("id", nota.id);

    return { ok: true, id: nota.id, ref: currentRef, focus: body, tentativas: attempts };
  });
/**
 * Extrai dados de uma NFS-e a partir de imagem/PDF (DANFSe).
 * Usa Lovable AI (Gemini vision) para fazer OCR estruturado.
 */
export const extrairNfseDeImagem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      arquivo_base64: z.string().min(20).max(15_000_000),
      mime: z.string().min(3).max(100),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente");

    const dataUrl = data.arquivo_base64.startsWith("data:")
      ? data.arquivo_base64
      : `data:${data.mime};base64,${data.arquivo_base64}`;
    const isPdf = data.mime.includes("pdf");

    const sys = `Você extrai dados estruturados de uma NFS-e (Nota Fiscal de Serviço eletrônica) brasileira.
Devolva APENAS JSON com este formato exato (use null quando o campo não aparecer):
{
  "numero": "string ou null",
  "data_emissao": "YYYY-MM-DD ou null",
  "valor_servicos": number ou null,
  "descricao_servicos": "string ou null",
  "emitente_cnpj": "apenas dígitos ou null",
  "emitente_nome": "string ou null",
  "tomador_cpf_cnpj": "apenas dígitos ou null",
  "tomador_nome": "string ou null"
}
Não invente. Datas devem virar YYYY-MM-DD. Valor em número (ex: 60.00).`;

    const userContent: Array<Record<string, unknown>> = [
      { type: "text", text: "Extraia os dados da NFS-e nesta imagem/PDF." },
      isPdf
        ? { type: "file", file: { filename: "nfse.pdf", file_data: dataUrl } }
        : { type: "image_url", image_url: { url: dataUrl } },
    ];

    const res = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("Limite de uso da IA atingido. Tente em instantes.");
      if (res.status === 402) throw new Error("Créditos de IA esgotados.");
      throw new Error(`Falha IA (${res.status}): ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content ?? "{}";
    const cleaned = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end < 0) throw new Error("IA não devolveu JSON válido");
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;

    const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3})/g, "").replace(",", ".")) : null);
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const digits = (v: unknown) => { const s = str(v); return s ? s.replace(/\D/g, "") : null; };

    return {
      numero: str(parsed.numero),
      data_emissao: str(parsed.data_emissao),
      valor_servicos: num(parsed.valor_servicos),
      descricao_servicos: str(parsed.descricao_servicos),
      emitente_cnpj: digits(parsed.emitente_cnpj),
      emitente_nome: str(parsed.emitente_nome),
      tomador_cpf_cnpj: digits(parsed.tomador_cpf_cnpj),
      tomador_nome: str(parsed.tomador_nome),
    };
  });

/**
 * Faz proxy do PDF/XML da NFS-e para evitar bloqueios de iframe cross-origin
 * (CSP/X-Frame-Options) ao exibir DANFSE inline no app.
 */
export const baixarNfseArquivo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      nfseId: z.string().uuid(),
      tipo: z.enum(["pdf", "xml"]).default("pdf"),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: nota, error } = await supabase
      .from("nfse")
      .select("url_pdf, url_xml")
      .eq("id", data.nfseId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!nota) throw new Error("NFS-e não encontrada");
    const url = data.tipo === "pdf" ? nota.url_pdf : nota.url_xml;
    if (!url) throw new Error("Arquivo indisponível");

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Falha ao baixar arquivo (${res.status})`);
    const buf = await res.arrayBuffer();
    const b64 = Buffer.from(buf).toString("base64");
    return {
      base64: b64,
      mime: data.tipo === "pdf" ? "application/pdf" : "application/xml",
    };
  });
