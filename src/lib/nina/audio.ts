/** Preferência de formato do turno, sem outra chamada à IA. */
export function deveResponderEmAudio(entrada: {
  recebeuAudio: boolean;
  mensagem: string;
}): boolean {
  const texto = entrada.mensagem
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  // A preferência expressa por texto prevalece mesmo quando veio numa nota de voz.
  if (
    /\b(?:nao (?:me )?(?:mande|manda|envie|envia|responda|responde|quero|preciso|gosto)|sem)\b[^.!?\n]{0,35}\b(?:audio|voz)\b|\b(?:responda|responde|mande|manda|envie|envia|prefiro|quero)\b[^.!?\n]{0,25}\b(?:por escrito|em texto|so texto|somente texto|texto)\b/.test(
      texto,
    )
  )
    return false;
  return (
    entrada.recebeuAudio ||
    /\b(?:responda|responde|responder|mande|manda|mandar|envie|envia|enviar|fale|falar|prefiro|quero|pode ser)\b[^.!?\n]{0,45}\b(?:audio|voz)\b|\b(?:quero|posso|preciso) ouvir (?:a |sua |essa )?resposta\b/.test(
      texto,
    )
  );
}

export function transcricaoDoAudio(m: {
  body?: string | null;
  transcricao?: string | null;
}): string {
  const texto = (m.transcricao || m.body || "").replace(/^🎤\s*/, "").trim();
  return /^(?:\[audio\]|\[áudio não transcrito\]|\[mídia\])$/i.test(texto) ? "" : texto;
}

export const REGRA_RESPOSTA_AUDIO =
  "FORMATO-AUDIO-01: O sistema recebe áudios, transcreve e pode ler sua resposta em voz. Quando o paciente pedir resposta em áudio, responda ao conteúdo normalmente: o transporte gera a voz a partir da resposta final. Não diga que é incapaz de ouvir ou enviar áudio, não escreva uma transcrição fictícia e não prometa áudio se houver aviso de falha. A voz não altera as regras, fontes ou confirmações do atendimento.";
