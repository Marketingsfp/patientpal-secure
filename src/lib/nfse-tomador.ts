/**
 * Regras do tomador da NFS-e.
 *
 * Existem porque em 31/08/2026 seis emissões falharam num único dia, todas de
 * pacientes sem CPF na ficha. O bloco `<toma>` da DPS começa obrigatoriamente
 * pelo CPF/CNPJ e o nome (`xNome`) só é aceito depois dele — sem documento a
 * prefeitura devolvia "Element 'xNome': This element is not expected. Expected
 * is one of (CNPJ, CPF...)", mensagem que não dizia nada a quem estava no
 * balcão. A nota ficava com status de erro e o paciente ia embora sem nota.
 *
 * A verificação vive aqui, e não dentro de cada tela, porque cinco telas
 * emitem NFS-e e o servidor precisa aplicar a mesma regra: o diálogo avisa
 * cedo, o servidor é a barreira que vale.
 */

/** Só os dígitos, do jeito que o XML da nota exige. */
export function apenasDigitos(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

/** CPF (11 dígitos) ou CNPJ (14) completo — o que o Ambiente Nacional aceita. */
export function documentoTomadorValido(cpfCnpj: string | null | undefined): boolean {
  const d = apenasDigitos(cpfCnpj);
  return d.length === 11 || d.length === 14;
}

/**
 * Por que este documento não serve, em texto que diz o que fazer. Devolve
 * `null` quando o documento está bom.
 *
 * `nome` entra na mensagem para que, na cobrança de vários atendimentos de
 * uma vez, dê para saber de quem é a ficha incompleta.
 */
export function problemaNoDocumentoDoTomador(
  nome: string | null | undefined,
  cpfCnpj: string | null | undefined,
): string | null {
  const d = apenasDigitos(cpfCnpj);
  if (documentoTomadorValido(d)) return null;
  const quem = (nome ?? "").trim() || "O tomador";
  return d.length === 0
    ? `${quem} está sem CPF no cadastro. A prefeitura não aceita nota fiscal sem o CPF do tomador: cadastre o CPF na ficha do paciente e emita de novo.`
    : `O CPF/CNPJ de ${quem} está incompleto (${d.length} dígitos, precisa de 11 ou 14). Corrija no cadastro e emita de novo.`;
}
