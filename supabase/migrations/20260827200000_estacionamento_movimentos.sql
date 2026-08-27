-- ---------------------------------------------------------------------------
-- Módulo Estacionamento: tabela de movimentos
--
-- A clínica passa a controlar o estacionamento dentro do sistema. Não havia
-- absolutamente nada disso no banco — nenhuma tabela, coluna, categoria
-- financeira ou procedimento — então este arquivo cria a base do zero.
--
-- São dois tipos de movimento, e a diferença entre eles é o que a tela mostra:
--
--   * `rotativo`   — o carro entrou, pagou e saiu. Só interessa a placa, o
--                    valor e a forma de pagamento.
--   * `mensalista` — o cliente paga por mês. Além da placa e do nome, guarda a
--                    `competencia`: o MÊS a que aquele pagamento se refere.
--                    É ela que separa "referente ao período", "atrasado" e
--                    "antecipado" no painel — sem esse campo os três cards não
--                    teriam como existir.
--
-- `data` é o dia em que o dinheiro entrou; `competencia` é o mês a que ele se
-- refere. São coisas diferentes de propósito, pela mesma razão que já vale no
-- Movimento de Caixa: um mensalista pode quitar em agosto a mensalidade de
-- julho, e o dinheiro é de agosto enquanto a competência continua sendo julho.
--
-- Esta migration NÃO mexe em caixa, em `fin_lancamentos` nem em nenhuma regra
-- financeira existente. O estacionamento nasce isolado: registrar um movimento
-- aqui não move a gaveta da recepção nem cria lançamento no financeiro. Se a
-- clínica decidir depois que esse dinheiro entra no caixa, isso é uma segunda
-- decisão, consciente, e não um efeito colateral de criar a tabela.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.estacionamento_movimentos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id       uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  tipo             text NOT NULL CHECK (tipo IN ('rotativo', 'mensalista')),
  -- Entrada é dinheiro recebido; saída é despesa do próprio estacionamento
  -- (diarista, manutenção da cancela). Sem esta coluna o filtro "Saídas" da
  -- tela não teria o que mostrar e o total pago seria sempre zero.
  sentido          text NOT NULL DEFAULT 'entrada' CHECK (sentido IN ('entrada', 'saida')),
  -- Placa sempre em caixa alta e sem espaços: é o identificador que a
  -- recepção digita e procura, e "abc1d23" e "ABC1D23" são o mesmo carro.
  placa            text,
  -- Nome do mensalista. O rotativo normalmente não tem nome.
  nome             text,
  valor            numeric(12,2) NOT NULL DEFAULT 0 CHECK (valor >= 0),
  forma_pagamento  text,
  -- Dia em que o dinheiro entrou.
  data             date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date),
  -- Mês a que a mensalidade se refere (dia 1). Nulo para rotativo.
  competencia      date,
  observacoes      text,
  criado_por       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- Mensalista sem competência deixaria o painel de detalhamento sem resposta:
  -- a linha existiria e não caberia em nenhum dos três cards.
  CONSTRAINT estacionamento_mensalista_tem_competencia
    CHECK (tipo <> 'mensalista' OR competencia IS NOT NULL)
);

-- A tela abre sempre por clínica + intervalo de datas.
CREATE INDEX IF NOT EXISTS estacionamento_mov_clinica_data_idx
  ON public.estacionamento_movimentos (clinica_id, data DESC);

-- Busca por placa, que é como a recepção procura um carro.
CREATE INDEX IF NOT EXISTS estacionamento_mov_clinica_placa_idx
  ON public.estacionamento_movimentos (clinica_id, placa);

ALTER TABLE public.estacionamento_movimentos ENABLE ROW LEVEL SECURITY;

-- Mesmo isolamento por clínica de todas as outras tabelas do sistema: quem não
-- é membro da clínica não enxerga nem grava nada. Não há dado de saúde aqui,
-- mas placa e nome são dados pessoais e seguem a mesma regra.
DROP POLICY IF EXISTS estacionamento_member_select ON public.estacionamento_movimentos;
CREATE POLICY estacionamento_member_select ON public.estacionamento_movimentos
  FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));

DROP POLICY IF EXISTS estacionamento_member_insert ON public.estacionamento_movimentos;
CREATE POLICY estacionamento_member_insert ON public.estacionamento_movimentos
  FOR INSERT TO authenticated
  WITH CHECK (public.is_member(auth.uid(), clinica_id));

DROP POLICY IF EXISTS estacionamento_member_update ON public.estacionamento_movimentos;
CREATE POLICY estacionamento_member_update ON public.estacionamento_movimentos
  FOR UPDATE TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));

DROP POLICY IF EXISTS estacionamento_member_delete ON public.estacionamento_movimentos;
CREATE POLICY estacionamento_member_delete ON public.estacionamento_movimentos
  FOR DELETE TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));

-- Normaliza a placa na gravação, para a busca não depender de como foi
-- digitada. Feito no banco, e não só na tela, porque a tela não é a única
-- porta: importação e correção manual passam por aqui também.
CREATE OR REPLACE FUNCTION public.fn_estacionamento_normaliza_placa()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.placa IS NOT NULL THEN
    NEW.placa := upper(regexp_replace(NEW.placa, '[^A-Za-z0-9]', '', 'g'));
    IF NEW.placa = '' THEN NEW.placa := NULL; END IF;
  END IF;
  IF NEW.nome IS NOT NULL THEN
    NEW.nome := upper(btrim(NEW.nome));
    IF NEW.nome = '' THEN NEW.nome := NULL; END IF;
  END IF;
  -- Competência é sempre o dia 1 do mês: guardar o dia exato faria dois
  -- pagamentos do mesmo mês parecerem competências diferentes.
  IF NEW.competencia IS NOT NULL THEN
    NEW.competencia := date_trunc('month', NEW.competencia)::date;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_estacionamento_normaliza ON public.estacionamento_movimentos;
CREATE TRIGGER trg_estacionamento_normaliza
  BEFORE INSERT OR UPDATE ON public.estacionamento_movimentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_estacionamento_normaliza_placa();
