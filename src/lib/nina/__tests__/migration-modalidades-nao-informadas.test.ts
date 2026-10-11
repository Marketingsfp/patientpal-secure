import { afterAll, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";

const MIGRATION = "supabase/migrations/20261011150000_nina_modalidades_nao_informadas.sql";
const db = new PGlite();

afterAll(async () => {
  await db.close();
});

describe("migração física das modalidades do catálogo", () => {
  test("limpa publicado e rascunho sem apagar os demais dados", async () => {
    await db.exec(`
      CREATE TABLE public.nina_cat_servicos (
        id text PRIMARY KEY,
        estrutura jsonb,
        descricao_publica text,
        rascunho jsonb
      );
      CREATE TABLE public.nina_cat_profissionais (
        id text PRIMARY KEY,
        tipo_atendimento text,
        estrutura jsonb,
        observacao_publica text,
        rascunho jsonb
      );
      CREATE FUNCTION public.fn_audit_trigger_teste() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
      CREATE TRIGGER trg_audit_nina_cat_servicos
        AFTER INSERT OR UPDATE OR DELETE ON public.nina_cat_servicos
        FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger_teste();
      CREATE TRIGGER trg_audit_nina_cat_profissionais
        AFTER INSERT OR UPDATE OR DELETE ON public.nina_cat_profissionais
        FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger_teste();

      INSERT INTO public.nina_cat_servicos VALUES (
        'servico-1',
        '{"versao":1,"complementos":[{"chave":"exame","modalidade":"chegada_sem_pre_agendamento","idade_minima":12}]}'::jsonb,
        E'EXAME A\\nObservação: Ordem de chegada sem pré-agendamento\\nLevar documento',
        '{"descricao_publica":"EXAME A\\nObservação: Agendado","estrutura":{"versao":1,"complementos":[{"chave":"exame","modalidade":"hora_marcada","acrescimos":"R$ 10"}]}}'::jsonb
      );
      INSERT INTO public.nina_cat_profissionais VALUES (
        'profissional-1',
        'Hora marcada',
        '{"versao":1,"complementos":[{"chave":"consulta","modalidade":"ficha","chegada_ate":"10:00"}]}'::jsonb,
        E'CONSULTA A\\nModalidade: Por ficha\\nObservação: levar documento',
        '{"tipo_atendimento":"Agendado","observacao_publica":"CONSULTA A\\nObservação: Ordem de chegada","estrutura":{"versao":1,"complementos":[{"chave":"consulta","modalidade":"chegada_sem_pre_agendamento","criterio_adicional":"jejum"}]}}'::jsonb
      );
    `);

    await db.exec(await Bun.file(MIGRATION).text());

    const servicos = await db.query<{
      estrutura: Record<string, unknown>;
      descricao_publica: string;
      rascunho: Record<string, unknown>;
    }>("SELECT estrutura, descricao_publica, rascunho FROM public.nina_cat_servicos");
    const profissionais = await db.query<{
      tipo_atendimento: string | null;
      estrutura: Record<string, unknown>;
      observacao_publica: string;
      rascunho: Record<string, unknown>;
    }>(
      "SELECT tipo_atendimento, estrutura, observacao_publica, rascunho FROM public.nina_cat_profissionais",
    );

    const servico = servicos.rows[0]!;
    const profissional = profissionais.rows[0]!;
    const complementoServico = (
      servico.estrutura.complementos as Array<Record<string, unknown>>
    )[0]!;
    const complementoProfissional = (
      profissional.estrutura.complementos as Array<Record<string, unknown>>
    )[0]!;
    const rascunhoServico = servico.rascunho as {
      descricao_publica: string;
      estrutura: { complementos: Array<Record<string, unknown>> };
    };
    const rascunhoProfissional = profissional.rascunho as {
      tipo_atendimento: string | null;
      observacao_publica: string;
      estrutura: { complementos: Array<Record<string, unknown>> };
    };

    expect(complementoServico.modalidade).toBeUndefined();
    expect(complementoServico.idade_minima).toBe(12);
    expect(servico.descricao_publica).toContain("Observação: Não informado");
    expect(servico.descricao_publica).toContain("Levar documento");
    expect(rascunhoServico.estrutura.complementos[0]!.modalidade).toBeUndefined();
    expect(rascunhoServico.estrutura.complementos[0]!.acrescimos).toBe("R$ 10");
    expect(rascunhoServico.descricao_publica).toContain("Observação: Não informado");

    expect(profissional.tipo_atendimento).toBeNull();
    expect(complementoProfissional.modalidade).toBeUndefined();
    expect(complementoProfissional.chegada_ate).toBe("10:00");
    expect(profissional.observacao_publica).toContain("Modalidade: Não informado");
    expect(profissional.observacao_publica).toContain("Observação: levar documento");
    expect(rascunhoProfissional.tipo_atendimento).toBeNull();
    expect(rascunhoProfissional.estrutura.complementos[0]!.modalidade).toBeUndefined();
    expect(rascunhoProfissional.estrutura.complementos[0]!.criterio_adicional).toBe("jejum");
    expect(rascunhoProfissional.observacao_publica).toContain("Observação: Não informado");
  });
});
