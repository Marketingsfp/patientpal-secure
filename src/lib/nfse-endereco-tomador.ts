/**
 * Regras de endereço do tomador na NFS-e.
 *
 * Fica separado de `nfse.functions.ts` para poder ser testado sem subir o
 * server function inteiro — mesmo motivo de `nfse-tomador.ts`.
 */

function only(s: string | null | undefined) {
  return (s ?? "").replace(/\D/g, "");
}

/**
 * Resultado da checagem do CEP do tomador nos Correios (ViaCEP).
 *
 * "inexistente" e "indisponivel" são separados de propósito: só o primeiro
 * autoriza descartar o endereço da nota (ver `resolverEnderecoDoTomador`).
 * Se o ViaCEP estiver fora do ar, um CEP bom não pode ser tratado como ruim.
 */
export type ConsultaCep =
  | { situacao: "ok"; codigoMunicipio: string }
  | { situacao: "inexistente" }
  | { situacao: "indisponivel" };

export async function consultarCepDoTomador(cep: string | null | undefined): Promise<ConsultaCep> {
  const digits = only(cep);
  // CEP vazio, incompleto ou zerado (00000000) nem chega a ser consultado:
  // é o caso dos milhares de cadastros preenchidos "de enchimento".
  if (!/^\d{8}$/.test(digits) || /^0+$/.test(digits)) return { situacao: "inexistente" };

  try {
    const resp = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (!resp.ok) return { situacao: "indisponivel" };
    const body = (await resp.json().catch(() => null)) as { erro?: boolean; ibge?: string } | null;
    if (body?.erro) return { situacao: "inexistente" };
    const ibge = only(body?.ibge);
    return /^\d{7}$/.test(ibge)
      ? { situacao: "ok", codigoMunicipio: ibge }
      : { situacao: "indisponivel" };
  } catch {
    return { situacao: "indisponivel" };
  }
}

export function formatarCep(cep: string | null | undefined) {
  const d = only(cep);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d || "(vazio)";
}

/**
 * Decide se o endereço do tomador entra na nota e com que município.
 *
 * Um CEP que não existe nos Correios derrubava a emissão inteira: o código não
 * descobria o município pelo CEP, caía no município do emitente e mandava para
 * a prefeitura um par CEP/município impossível — E0240, "o CEP informado para o
 * endereço nacional do tomador do serviço não existe ou não pertence ao
 * município do endereço do tomador". Como há milhares de fichas com CEP de
 * enchimento (00000000, 25000000), isso travava a recepção sem explicar o que
 * corrigir.
 *
 * Agora, quando o CEP não existe, a nota sai SEM o bloco de endereço — o
 * Ambiente Nacional aceita assim, é o que já acontece com quem não tem endereço
 * cadastrado — e a tela avisa qual ficha precisa ser corrigida.
 */
export async function resolverEnderecoDoTomador(args: {
  temLogradouro: boolean;
  cep: string | null | undefined;
  codigoMunicipioCadastro?: string | null;
  codigoMunicipioEmitente: string;
  nomeTomador: string;
}) {
  if (!args.temLogradouro) {
    return { enviarEndereco: false, codigoMunicipio: undefined, aviso: null as string | null };
  }

  const consulta = await consultarCepDoTomador(args.cep);
  if (consulta.situacao === "inexistente") {
    return {
      enviarEndereco: false,
      codigoMunicipio: undefined,
      aviso:
        `O CEP ${formatarCep(args.cep)} do cadastro de ${args.nomeTomador} não existe nos Correios. ` +
        `A nota foi emitida sem o endereço do tomador — corrija o CEP na ficha do paciente.`,
    };
  }

  return {
    enviarEndereco: true,
    codigoMunicipio:
      consulta.situacao === "ok"
        ? consulta.codigoMunicipio
        : (args.codigoMunicipioCadastro ?? args.codigoMunicipioEmitente),
    aviso: null as string | null,
  };
}
