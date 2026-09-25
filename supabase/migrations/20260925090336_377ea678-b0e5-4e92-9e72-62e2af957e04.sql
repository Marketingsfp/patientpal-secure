create or replace function public.lumen_tv_respostas(_ids bigint[])
returns table(id bigint, status_code integer, error_msg text)
language sql stable security definer set search_path = public as $$
  select r.id, r.status_code, r.error_msg from net._http_response r where r.id = any(_ids)
$$;
revoke all on function public.lumen_tv_respostas(bigint[]) from public, anon, authenticated;
grant execute on function public.lumen_tv_respostas(bigint[]) to service_role;