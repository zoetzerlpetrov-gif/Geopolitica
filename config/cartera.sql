-- DOMINUS · Cartera de proyectos v1. Ejecutar completo en el SQL Editor de tu proyecto Supabase (se puede volver a
-- ejecutar sin perder datos). Solo crea objetos con prefijo dominus_planes / dominus_cartera. No toca otras tablas.
-- Seguridad: Row Level Security en todas las tablas. Cada plan lo ven solo su dueño y los correos a los que lo compartió.
-- Los datos NO van cifrados de punta a punta: el administrador de tu proyecto Supabase puede leerlos.
begin;

create table if not exists public.dominus_planes (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id),
  empresa text not null check (length(trim(empresa)) between 1 and 120),
  sector text not null default '' check (length(sector) <= 120),
  titulo text not null check (length(trim(titulo)) between 1 and 200),
  paises text[] not null default '{}',
  datos jsonb not null check (jsonb_typeof(datos) = 'object' and octet_length(datos::text) <= 4000000),
  linea_base date,
  version integer not null default 1,
  actualizado timestamptz not null default now()
);
create table if not exists public.dominus_planes_miembros (
  plan_id uuid not null references public.dominus_planes(id) on delete cascade,
  correo text not null check (correo = lower(trim(correo)) and correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  rol text not null check (rol in ('lector', 'editor')),
  agregado timestamptz not null default now(),
  primary key (plan_id, correo)
);
create table if not exists public.dominus_planes_cortes (
  id bigint generated always as identity primary key,
  plan_id uuid not null references public.dominus_planes(id) on delete cascade,
  fecha timestamptz not null default now(),
  autor uuid not null default auth.uid() references auth.users(id),
  resumen jsonb not null check (jsonb_typeof(resumen) = 'object' and octet_length(resumen::text) <= 200000)
);
create index if not exists dominus_planes_cortes_plan on public.dominus_planes_cortes (plan_id, fecha desc);

alter table public.dominus_planes enable row level security;
alter table public.dominus_planes_miembros enable row level security;
alter table public.dominus_planes_cortes enable row level security;

-- Rol de quien consulta en un plan: 'dueno', 'editor', 'lector' o null.
create or replace function public.dominus_planes_rol(_plan uuid) returns text language sql stable security definer set search_path = '' as $$
  select case when p.owner = (select auth.uid()) then 'dueno' else m.rol end
  from public.dominus_planes p
  left join public.dominus_planes_miembros m on m.plan_id = p.id and m.correo = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  where p.id = _plan
    and (p.owner = (select auth.uid()) or m.correo is not null)
$$;
revoke all on function public.dominus_planes_rol(uuid) from public, anon;
grant execute on function public.dominus_planes_rol(uuid) to authenticated;

-- Planes
drop policy if exists dominus_planes_leer on public.dominus_planes;
-- «owner = auth.uid()» va primero: al crear un plan, la página pide el registro de vuelta (INSERT … RETURNING) y la
-- función, que consulta la tabla, todavía no ve la fila nueva; sin esta condición la creación se rechaza.
create policy dominus_planes_leer on public.dominus_planes for select to authenticated
  using (owner = (select auth.uid()) or public.dominus_planes_rol(id) is not null);
drop policy if exists dominus_planes_crear on public.dominus_planes;
create policy dominus_planes_crear on public.dominus_planes for insert to authenticated with check (owner = (select auth.uid()));
drop policy if exists dominus_planes_editar on public.dominus_planes;
create policy dominus_planes_editar on public.dominus_planes for update to authenticated
  using (public.dominus_planes_rol(id) in ('dueno', 'editor')) with check (public.dominus_planes_rol(id) in ('dueno', 'editor'));
drop policy if exists dominus_planes_borrar on public.dominus_planes;
create policy dominus_planes_borrar on public.dominus_planes for delete to authenticated using (owner = (select auth.uid()));

-- Un editor no puede cambiar de dueño el plan.
create or replace function public.dominus_planes_proteger() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.owner <> old.owner then raise exception 'No se puede cambiar el dueño del plan'; end if;
  new.version := old.version + 1;
  new.actualizado := now();
  return new;
end $$;
drop trigger if exists dominus_planes_proteger on public.dominus_planes;
create trigger dominus_planes_proteger before update on public.dominus_planes for each row execute function public.dominus_planes_proteger();

-- Miembros (solo el dueño agrega o quita; cada quien ve su propia membresía)
drop policy if exists dominus_miembros_leer on public.dominus_planes_miembros;
create policy dominus_miembros_leer on public.dominus_planes_miembros for select to authenticated
  using (public.dominus_planes_rol(plan_id) = 'dueno' or correo = lower(coalesce((select auth.jwt()) ->> 'email', '')));
drop policy if exists dominus_miembros_crear on public.dominus_planes_miembros;
create policy dominus_miembros_crear on public.dominus_planes_miembros for insert to authenticated with check (public.dominus_planes_rol(plan_id) = 'dueno');
drop policy if exists dominus_miembros_editar on public.dominus_planes_miembros;
create policy dominus_miembros_editar on public.dominus_planes_miembros for update to authenticated
  using (public.dominus_planes_rol(plan_id) = 'dueno') with check (public.dominus_planes_rol(plan_id) = 'dueno');
drop policy if exists dominus_miembros_borrar on public.dominus_planes_miembros;
create policy dominus_miembros_borrar on public.dominus_planes_miembros for delete to authenticated using (public.dominus_planes_rol(plan_id) = 'dueno');

-- Cortes (historial de avance): los lee quien ve el plan; los agregan dueño y editores; nunca se editan.
drop policy if exists dominus_cortes_leer on public.dominus_planes_cortes;
create policy dominus_cortes_leer on public.dominus_planes_cortes for select to authenticated using (public.dominus_planes_rol(plan_id) is not null);
drop policy if exists dominus_cortes_crear on public.dominus_planes_cortes;
create policy dominus_cortes_crear on public.dominus_planes_cortes for insert to authenticated
  with check (autor = (select auth.uid()) and public.dominus_planes_rol(plan_id) in ('dueno', 'editor'));
drop policy if exists dominus_cortes_borrar on public.dominus_planes_cortes;
create policy dominus_cortes_borrar on public.dominus_planes_cortes for delete to authenticated using (public.dominus_planes_rol(plan_id) = 'dueno');

revoke all on public.dominus_planes, public.dominus_planes_miembros, public.dominus_planes_cortes from anon;
grant select, insert, update, delete on public.dominus_planes, public.dominus_planes_miembros, public.dominus_planes_cortes to authenticated;

-- Comprobación que hace la página al conectarse.
create or replace function public.dominus_cartera_estado() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('esquema', 1, 'usuario', (select auth.uid()), 'correo', (select auth.jwt()) ->> 'email')
$$;
revoke all on function public.dominus_cartera_estado() from public, anon;
grant execute on function public.dominus_cartera_estado() to authenticated;

commit;
