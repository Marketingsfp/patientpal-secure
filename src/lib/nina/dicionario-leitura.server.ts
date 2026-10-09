import {
  comCatalogoDoTurno,
  contagemCatalogoDoTurno,
  lerPublicados,
} from "./catalogo-turno.server";
import { consultarVariacoesDaMensagem } from "./dicionario-leitura";
import { registrarEtapa } from "./evidencias.server";

export async function lerDicionarioDaMensagem(clinicaId: string, mensagem: string) {
  return comCatalogoDoTurno(clinicaId, async () => {
    try {
      const catalogo = await contagemCatalogoDoTurno(clinicaId);
      if (catalogo.selecao.fonte !== "base_conhecimento")
        return { status: "nao_aplicavel" as const };
      // Projeta apenas nomes/aliases da leitura compartilhada, sem copiar fatos ou notas.
      type Indice = { id: string; nome: string; aliases?: unknown };
      const [servicos, profissionais] = await Promise.all([
        lerPublicados<Indice>("servicos", "id, nome, aliases:estrutura->aliases", clinicaId),
        lerPublicados<Indice>("profissionais", "id, nome, aliases:estrutura->aliases", clinicaId),
      ]);
      const registro = (r: Indice) => ({
        id: r.id,
        nome: r.nome,
        estrutura: { aliases: r.aliases },
      });
      const resultado = consultarVariacoesDaMensagem(
        mensagem,
        servicos.map(registro),
        profissionais.map(registro),
      );
      registrarEtapa({
        tipo: "consulta",
        fonte: "sistema",
        titulo: "Dicionário publicado consultado antes da interpretação",
        dados: { fonte_consulta: "base_conhecimento", ...resultado },
        codigo: {
          arquivo: "src/lib/nina/dicionario-leitura.server.ts",
          funcao: "lerDicionarioDaMensagem",
        },
      });
      return { status: "consultado" as const, ...resultado };
    } catch {
      registrarEtapa({
        tipo: "consulta",
        fonte: "sistema",
        titulo: "Dicionário indisponível",
        dados: { status: "indisponivel" },
      });
      return { status: "indisponivel" as const };
    }
  });
}
