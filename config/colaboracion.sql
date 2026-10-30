-- DOMINUS · Colaboración web v1. Ejecutar en SQL Editor de un proyecto Supabase dedicado.
-- Solo crea objetos dominus_*. No modifica políticas/tablas de otras aplicaciones.
begin;
create table if not exists public.dominus_cases (
 id uuid primary key default gen_random_uuid(), owner uuid not null references auth.users(id),
 alias text not null check (length(trim(alias)) between 1 and 120),
 version integer not null check (version > 0), packet jsonb not null,
 updated_at timestamptz not null default now()
);
create table if not exists public.dominus_members (
 case_id uuid not null references public.dominus_cases(id), user_id uuid not null references auth.users(id),
 role text not null check (role in ('editor','reader')), primary key(case_id,user_id)
);
create table if not exists public.dominus_revisions (
 case_id uuid not null references public.dominus_cases(id), version integer not null,
 actor uuid not null references auth.users(id), at timestamptz not null default now(),
 reason text not null check (length(trim(reason)) between 1 and 500), packet jsonb not null,
 primary key(case_id,version)
);
alter table public.dominus_cases enable row level security;
alter table public.dominus_members enable row level security;
alter table public.dominus_revisions enable row level security;
create or replace function public.dominus_role(_case uuid) returns text language sql stable security definer set search_path='' as $$
 select case when c.owner = (select auth.uid()) then 'owner' else m.role end
 from public.dominus_cases c left join public.dominus_members m on m.case_id=c.id and m.user_id=(select auth.uid())
 where c.id=_case and (c.owner=(select auth.uid()) or m.user_id=(select auth.uid()))
$$;
create or replace function public.dominus_packet_valid(_packet jsonb) returns boolean language sql immutable set search_path='' as $$
 select case when jsonb_typeof(_packet)<>'object' then false else coalesce(
 (select count(*) from jsonb_object_keys(_packet))=6 and
 _packet->>'format'='dominus-web-backup-v1' and _packet->>'kdf'='PBKDF2-SHA256' and
 _packet->'iterations'='600000'::jsonb and
 jsonb_typeof(_packet->'salt')='string' and length(_packet->>'salt')=24 and
 jsonb_typeof(_packet->'iv')='string' and length(_packet->>'iv')=16 and
 jsonb_typeof(_packet->'data')='string' and length(_packet->>'data') between 24 and 8000000 and
 (_packet->>'salt') ~ '^[A-Za-z0-9+/]+={0,2}$' and (_packet->>'iv') ~ '^[A-Za-z0-9+/]+={0,2}$' and
 (_packet->>'data') ~ '^[A-Za-z0-9+/]+={0,2}$',false) end
$$;
drop policy if exists dominus_case_read on public.dominus_cases;
create policy dominus_case_read on public.dominus_cases for select to authenticated using (public.dominus_role(id) is not null);
drop policy if exists dominus_members_read on public.dominus_members;
create policy dominus_members_read on public.dominus_members for select to authenticated using (public.dominus_role(case_id)='owner' or user_id=(select auth.uid()));
drop policy if exists dominus_revisions_read on public.dominus_revisions;
create policy dominus_revisions_read on public.dominus_revisions for select to authenticated using (public.dominus_role(case_id) is not null);

create or replace function public.dominus_create(_alias text,_packet jsonb,_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.dominus_cases;
begin
 if auth.uid() is null then raise exception 'Sesión requerida'; end if;
 if not public.dominus_packet_valid(_packet) then raise exception 'Paquete cifrado incompatible'; end if;
 insert into public.dominus_cases(owner,alias,version,packet) values(auth.uid(),trim(_alias),1,_packet) returning * into c;
 insert into public.dominus_revisions(case_id,version,actor,reason,packet) values(c.id,1,auth.uid(),_reason,_packet);
 return to_jsonb(c);
end $$;
create or replace function public.dominus_save(_case uuid,_expected integer,_packet jsonb,_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.dominus_cases;
begin
 if coalesce(public.dominus_role(_case),'') not in ('owner','editor') then raise exception 'Sin permiso de edición'; end if;
 if not public.dominus_packet_valid(_packet) then raise exception 'Paquete cifrado incompatible'; end if;
 select * into c from public.dominus_cases where id=_case for update;
 -- Revisión de permiso después de bloquear: una revocación concurrente no autoriza nuevos guardados.
 if coalesce(public.dominus_role(_case),'') not in ('owner','editor') then raise exception 'Permiso revocado'; end if;
 if c.version<>_expected then raise exception 'Conflicto de versión: descarga y revisa la versión actual'; end if;
 update public.dominus_cases set packet=_packet,version=version+1,updated_at=clock_timestamp() where id=_case returning * into c;
 insert into public.dominus_revisions(case_id,version,actor,reason,packet) values(c.id,c.version,auth.uid(),_reason,_packet);
 return to_jsonb(c);
end $$;
create or replace function public.dominus_member(_case uuid,_user uuid,_role text) returns void language plpgsql security definer set search_path='' as $$
declare c public.dominus_cases;
begin
 select * into c from public.dominus_cases where id=_case for update;
 if c.owner is distinct from auth.uid() or auth.uid() is null then raise exception 'Solo el propietario administra miembros'; end if;
 if _user=c.owner then raise exception 'No se cambia al propietario'; end if;
 if _role='remove' then delete from public.dominus_members where case_id=_case and user_id=_user;
 elsif _role in ('editor','reader') then
 insert into public.dominus_members(case_id,user_id,role) values(_case,_user,_role) on conflict(case_id,user_id) do update set role=excluded.role;
 else raise exception 'Rol incompatible'; end if;
end $$;
revoke all on public.dominus_cases,public.dominus_members,public.dominus_revisions from public,anon,authenticated;
grant select on public.dominus_cases,public.dominus_members,public.dominus_revisions to authenticated;
revoke all on function public.dominus_role(uuid),public.dominus_packet_valid(jsonb),public.dominus_create(text,jsonb,text),public.dominus_save(uuid,integer,jsonb,text),public.dominus_member(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.dominus_role(uuid),public.dominus_create(text,jsonb,text),public.dominus_save(uuid,integer,jsonb,text),public.dominus_member(uuid,uuid,text) to authenticated;
-- Comprobación de despliegue: versión + usuario que realmente validó Supabase Auth.
create or replace function public.dominus_status() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('schema',1,'user_id',auth.uid())
$$;
revoke all on function public.dominus_status() from public,anon,authenticated;
grant execute on function public.dominus_status() to authenticated;
commit;
