-- Limpeza pontual: pagamento avulso duplicado (QUEDIMA SUELEN, 27/07/2026, Menino Jesus).
-- Mantém o 1º registro (14:12) e remove o 2º (14:13), gerado por duplicidade de tela.
DELETE FROM public.contrato_mensalidades WHERE contrato_id = '243a7e8d-e058-4633-babe-dad29bfdc527';
DELETE FROM public.contrato_dependentes WHERE contrato_id = '243a7e8d-e058-4633-babe-dad29bfdc527';
DELETE FROM public.contrato_renovacoes WHERE contrato_id = '243a7e8d-e058-4633-babe-dad29bfdc527';
DELETE FROM public.contratos_assinatura WHERE id = '243a7e8d-e058-4633-babe-dad29bfdc527';
DELETE FROM public.caixa_movimentos WHERE lancamento_id = '410bbf3c-81c4-49e9-966a-9a370b810ddd';
DELETE FROM public.fin_lancamentos WHERE id = '410bbf3c-81c4-49e9-966a-9a370b810ddd';