import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { numerarFichasFormatadas, type LinhaParaFicha } from "@/lib/agenda/ficha-numero";
import { janelaDiaClinica, dataClinicaDe } from "@/lib/date-utils";
import { modalidadePublicadaDoMedico } from "./vinculo-catalogo-agenda.server";
import { resolverModalidade, type ModalidadeResolvida } from "./modalidade-atendimento";
import type { SlotNina } from "./paciente-tools.server";
import type { EscopoAtendimentoConsulta } from "./atendimento-consulta";

export async function modalidadeAtualDaAgenda(clinicaId: string, medicoId: string, agendaId: string | null, escopo?: EscopoAtendimentoConsulta) {
  const publicada = await modalidadePublicadaDoMedico(clinicaId, medicoId, escopo);
  if (publicada) return publicada;
  if (!agendaId) return "nao_definida" as const;
  const { data, error } = await supabaseAdmin.from("medico_agendas").select("ordem_chegada")
    .eq("id", agendaId).eq("clinica_id", clinicaId).eq("medico_id", medicoId).maybeSingle();
  if (error) throw new Error(error.message);
  return resolverModalidade(null, data?.ordem_chegada);
}

export async function enriquecerModalidades(clinicaId: string, slots: SlotNina[], escopo?: EscopoAtendimentoConsulta): Promise<SlotNina[]> {
  const modos = new Map<string, Promise<ModalidadeResolvida>>();
  for (const slot of slots) {
    const chave = `${slot.medico_id}|${slot.agenda ?? ""}`;
    if (!modos.has(chave)) modos.set(chave, modalidadeAtualDaAgenda(clinicaId, slot.medico_id, slot.agenda, escopo));
  }
  return Promise.all(slots.map(async slot => ({ ...slot,
    modalidade: await modos.get(`${slot.medico_id}|${slot.agenda ?? ""}`)!,
  })));
}

/** Lê a mesma ficha posicional da tela, incluindo vagas e cancelados; não renumera nada. */
export async function fichaDoAgendamento(clinicaId: string, medicoId: string, inicio: string, id: string) {
  const dia = dataClinicaDe(inicio);
  if (!dia) return null;
  const janela = janelaDiaClinica(dia);
  const linhas: LinhaParaFicha[] = [];
  const tamanho = 500;
  for (let pagina = 0; ; pagina++) {
    const { data, error } = await supabaseAdmin.from("agendamentos")
      .select("id, inicio, paciente_nome, medico_id, agenda_id")
      .eq("clinica_id", clinicaId).eq("medico_id", medicoId)
      .gte("inicio", janela.inicio).lt("inicio", janela.fimExclusivo)
      .order("inicio").order("id").range(pagina * tamanho, (pagina + 1) * tamanho - 1);
    if (error) throw new Error(error.message);
    linhas.push(...(data ?? []));
    if ((data?.length ?? 0) < tamanho) break;
  }
  return numerarFichasFormatadas(linhas).get(id) ?? null;
}
