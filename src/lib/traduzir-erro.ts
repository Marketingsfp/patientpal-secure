import { toast } from "sonner";

/**
 * Converte erros técnicos (Postgres, Supabase Auth, Focus NFe, rede, storage)
 * em mensagens claras em português para exibir ao usuário final.
 *
 * Uso:
 *   import { mostrarErro, traduzirErro } from "@/lib/traduzir-erro";
 *   mostrarErro(error, "salvar cliente");
 */

type QualquerErro =
  | {
      message?: string;
      code?: string;
      hint?: string;
      details?: string;
      status?: number;
      error_description?: string;
    }
  | string
  | null
  | undefined
  | unknown;

function extrair(err: QualquerErro): {
  msg: string;
  code?: string;
  details?: string;
  hint?: string;
} {
  if (!err) return { msg: "" };
  if (typeof err === "string") return { msg: err };
  const anyErr = err as any;
  return {
    msg: String(anyErr.message ?? anyErr.error_description ?? anyErr.error ?? ""),
    code: anyErr.code ? String(anyErr.code) : undefined,
    details: anyErr.details ? String(anyErr.details) : undefined,
    hint: anyErr.hint ? String(anyErr.hint) : undefined,
  };
}

function nomeCampoAmigavel(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("cpf")) return "CPF";
  if (s.includes("cnpj")) return "CNPJ";
  if (s.includes("email") || s.includes("e_mail")) return "e-mail";
  if (s.includes("telefone")) return "telefone";
  if (s.includes("codigo") || s.includes("code")) return "código";
  if (s.includes("nome")) return "nome";
  if (s.includes("numero")) return "número";
  return "";
}

function traduzirPostgres(msg: string, code?: string, details?: string): string | null {
  const detalhe = (details ?? "") + " " + msg;
  const campo = nomeCampoAmigavel(detalhe);
  switch (code) {
    case "23505":
      return campo
        ? `Já existe um cadastro com esse ${campo}.`
        : "Já existe um registro com esses dados.";
    case "23503":
      return "Este item está sendo usado em outro cadastro e não pode ser removido ou alterado.";
    case "23514":
      return "Um dos valores informados está fora do intervalo permitido.";
    case "23502":
      return campo ? `Preencha o campo ${campo}.` : "Preencha todos os campos obrigatórios.";
    case "22001":
      return "Um dos textos informados é maior do que o permitido.";
    case "22003":
      return "Um dos números informados está fora do intervalo permitido.";
    case "22007":
    case "22008":
      return "Uma das datas informadas está em formato inválido.";
    case "42501":
      return "Você não tem permissão para essa ação.";
    case "PGRST116":
      return "Registro não encontrado.";
    case "PGRST301":
    case "PGRST302":
      return "Sua sessão expirou. Entre novamente.";
    case "P0001":
      // Erro lançado por RAISE em função/trigger — normalmente já vem em PT-BR
      return msg || "Operação não permitida.";
  }
  return null;
}

function traduzirAuth(msg: string): string | null {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (m.includes("user already registered") || m.includes("already been registered"))
    return "Este e-mail já está cadastrado.";
  if (m.includes("password should be at least"))
    return "A senha precisa ter no mínimo 6 caracteres.";
  if (m.includes("email rate limit exceeded"))
    return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  if (m.includes("invalid email")) return "E-mail inválido.";
  if (m.includes("token has expired") || m.includes("jwt expired"))
    return "Sua sessão expirou. Entre novamente.";
  if (m.includes("unauthorized") || m === "no authorization header provided")
    return "Você precisa entrar para realizar essa ação.";
  if (m.includes("user not found")) return "Usuário não encontrado.";
  if (m.includes("signup is disabled")) return "O cadastro está temporariamente desativado.";
  if (m.includes("captcha")) return "Falha na verificação de segurança. Recarregue a página.";
  return null;
}

function traduzirRede(msg: string): string | null {
  const m = msg.toLowerCase();
  if (
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("network request failed")
  )
    return "Sem conexão com o servidor. Verifique sua internet e tente novamente.";
  if (m.includes("timeout") || m.includes("timed out"))
    return "O servidor demorou para responder. Tente novamente.";
  if (m.includes("aborted")) return "A operação foi cancelada.";
  return null;
}

function traduzirStorage(msg: string): string | null {
  const m = msg.toLowerCase();
  if (m.includes("exceeded the maximum allowed size") || m.includes("payload too large"))
    return "Arquivo muito grande. Envie um arquivo menor.";
  if (m.includes("bucket not found"))
    return "Local de armazenamento indisponível. Contate o suporte.";
  if (m.includes("mime type") || m.includes("invalid file type"))
    return "Tipo de arquivo não permitido.";
  if (m.includes("duplicate") && m.includes("object")) return "Já existe um arquivo com esse nome.";
  return null;
}

function traduzirFocusNfe(msg: string): string | null {
  const m = msg.toUpperCase();
  if (m.includes("E0014"))
    return "Já existe uma nota com esse número (RPS). O sistema vai tentar novamente automaticamente.";
  if (m.includes("E0120"))
    return "Inscrição municipal não informada ou inválida para este município.";
  if (m.includes("E0160"))
    return "Regime tributário inválido. Verifique se o emitente está como Simples Nacional ou Normal.";
  if (m.includes("E0166")) return "Situação tributária do PIS/COFINS não informada.";
  if (m.includes("E0310"))
    return "Código do serviço (Lista Nacional) inválido. Confira o item de serviço cadastrado.";
  if (m.includes("E0539")) return "Exigibilidade do ISS não informada.";
  if (m.includes("E0712")) return "Falta o CPF/CNPJ ou razão social do tomador (paciente).";
  if (m.includes("E0713")) return "Faltam dados obrigatórios do tomador (paciente).";
  if (/E\d{4}/.test(m))
    return `A prefeitura rejeitou a nota (${m.match(/E\d{4}/)?.[0]}). Verifique os detalhes.`;
  return null;
}

function pareceTecnico(msg: string): boolean {
  if (!msg) return true;
  return (
    /(syntax error|relation ".+" does not exist|column ".+" of relation|null value in column|violates .+ constraint|invalid input syntax|does not exist)/i.test(
      msg,
    ) ||
    /^[A-Z][a-zA-Z]+Error:/.test(msg) ||
    msg.includes("::") ||
    msg.length > 240
  );
}

export function traduzirErro(err: QualquerErro, contexto?: string): string {
  const { msg, code, details, hint } = extrair(err);

  const traducoes = [
    traduzirPostgres(msg, code, details),
    traduzirAuth(msg),
    traduzirRede(msg),
    traduzirStorage(msg),
    traduzirFocusNfe(msg),
  ];
  let amigavel = traducoes.find((t): t is string => Boolean(t));

  if (!amigavel) {
    if (!msg) amigavel = "Não foi possível concluir a operação. Tente novamente.";
    else if (pareceTecnico(msg))
      amigavel = "Não foi possível concluir a operação. Tente novamente.";
    else amigavel = msg; // já parece amigável (frase em PT-BR)
  }

  if (contexto) {
    amigavel = `Não foi possível ${contexto}: ${amigavel.charAt(0).toLowerCase()}${amigavel.slice(1)}`;
  }
  // Anexa a dica quando for informativa (algumas funções do banco usam hint em PT-BR)
  if (hint && !amigavel.includes(hint) && hint.length < 160 && !/^[a-z_]+$/.test(hint)) {
    amigavel += ` (${hint})`;
  }
  return amigavel;
}

/**
 * Mostra um toast de erro com a mensagem já traduzida.
 * Se o erro original for técnico, expõe uma ação "Ver detalhes" para o suporte.
 */
export function mostrarErro(err: QualquerErro, contexto?: string) {
  const amigavel = traduzirErro(err, contexto);
  const { msg, code, details, hint } = extrair(err);
  const original = [code && `code=${code}`, msg, details, hint].filter(Boolean).join(" | ");

  // Log técnico completo para debug
  try {
    console.error("[erro]", contexto ?? "", err);
  } catch {
    /* */
  }

  if (original && original !== amigavel && pareceTecnico(msg)) {
    toast.error(amigavel, {
      duration: 8000,
      action: {
        label: "Ver detalhes",
        onClick: () => {
          try {
            window.alert(original);
          } catch {
            /* */
          }
        },
      },
    });
  } else {
    toast.error(amigavel);
  }
}
