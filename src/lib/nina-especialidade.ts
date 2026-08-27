/**
 * Reconhecimento de especialidade/procedimento no texto do paciente.
 * Comparação sempre sem acento e sem diferenciar maiúsculas/minúsculas,
 * aceitando singular/plural e variações ("cardio", "cardiologia", "cardiologista").
 */

export function normalizar(texto: string): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Raiz comparável de uma especialidade: "Cardiologia" -> "cardio",
 * "Ortopedia" -> "ortoped", "Pediatria" -> "pedia".
 */
export function raizEspecialidade(nome: string): string {
  const n = normalizar(nome);
  const semSufixo = n.replace(/(logistas?|logias?|logos?|iatras?|iatrias?|istas?|ias?)$/u, "");
  if (semSufixo.length >= 5) return semSufixo;
  return n.slice(0, Math.max(5, semSufixo.length));
}

/** Especialidades citadas na mensagem, dentre as cadastradas na clínica. */
export function detectarEspecialidades(mensagem: string, cadastradas: string[]): string[] {
  const texto = normalizar(mensagem);
  const achadas: string[] = [];
  for (const nome of cadastradas) {
    const raiz = raizEspecialidade(nome);
    if (raiz.length >= 4 && texto.includes(raiz)) achadas.push(nome);
    else if (texto.includes(normalizar(nome))) achadas.push(nome);
  }
  return [...new Set(achadas)];
}

/**
 * A mensagem parece pedir uma especialidade (palavra tipo "…logista",
 * "…iatra", "…ista") mesmo que ela não exista no cadastro.
 */
export function pareceCitarEspecialidade(mensagem: string): string | null {
  const m = normalizar(mensagem).match(
    /\b([a-z]{4,}(?:logistas?|logias?|iatras?|iatrias?|pedias?|dentistas?))\b/u,
  );
  return m?.[1] ?? null;
}

/** Procedimentos/exames citados na mensagem, dentre os cadastrados. */
export function detectarProcedimentos(mensagem: string, nomes: string[]): string[] {
  const texto = normalizar(mensagem);
  const achados = nomes.filter((n) => {
    const alvo = normalizar(n);
    return alvo.length >= 4 && texto.includes(alvo);
  });
  return [...new Set(achados)].slice(0, 5);
}
