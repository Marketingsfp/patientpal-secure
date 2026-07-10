-- Elevar o perfil 'caixa' ao mesmo nível de acesso do 'admin' em todas as clínicas.
-- Aplica 'write' para todos os módulos existentes nas permissões do perfil caixa.
update public.perfil_permissoes pp
set acesso = 'write'::public.modulo_acesso
from public.perfis_acesso p
where pp.perfil_id = p.id
  and p.chave = 'caixa';

-- Garantir que todos os módulos que o admin possui também existam para o caixa,
-- inserindo os que estiverem faltando com acesso 'write'.
insert into public.perfil_permissoes (perfil_id, modulo, acesso)
select pc.id, pa.modulo, 'write'::public.modulo_acesso
from public.perfis_acesso pc
join public.perfis_acesso pad
  on pad.clinica_id is not distinct from pc.clinica_id
 and pad.chave = 'admin'
join public.perfil_permissoes pa on pa.perfil_id = pad.id
where pc.chave = 'caixa'
on conflict (perfil_id, modulo) do update set acesso = 'write'::public.modulo_acesso;