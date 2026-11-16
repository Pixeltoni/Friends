-- Erweiterung für: Budget & Übergabe, Countdown, PIN zurücksetzen, Terminabstimmung.
-- Fügt nur hinzu, löscht nichts. Kann gefahrlos mehrfach ausgeführt werden.

-- Budget, Übergabe, Countdown
alter table private.settings
  add column if not exists budget text not null default '',
  add column if not exists handover text not null default '',
  add column if not exists countdown_at timestamptz,
  add column if not exists countdown_label text not null default '',
  add column if not exists poll_final uuid;

-- Terminabstimmung Weihnachtsfeier
create table if not exists private.poll_options (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  time_text text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists private.poll_votes (
  option_id uuid not null references private.poll_options(id) on delete cascade,
  participant_id uuid not null references private.participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (option_id, participant_id)
);
alter table private.settings drop constraint if exists settings_poll_final_fkey;
alter table private.settings add constraint settings_poll_final_fkey
  foreign key (poll_final) references private.poll_options(id) on delete set null;

create or replace function public.wichtel_status()
 returns json language sql stable security definer set search_path to ''
as $function$
  select json_build_object(
    'title', s.title,
    'drawn', s.drawn_at is not null,
    'drawnAt', s.drawn_at,
    'budget', s.budget,
    'handover', s.handover,
    'countdownAt', s.countdown_at,
    'countdownLabel', s.countdown_label,
    'participants', coalesce((
      select json_agg(json_build_object('id', p.id, 'name', p.name, 'joinedAt', p.joined_at) order by p.joined_at)
      from private.participants p), '[]'::json),
    'poll', json_build_object(
      'finalId', s.poll_final,
      'options', coalesce((
        select json_agg(json_build_object(
          'id', o.id, 'day', o.day, 'time', o.time_text,
          'voters', coalesce((
            select json_agg(pa.name order by v.created_at)
            from private.poll_votes v join private.participants pa on pa.id = v.participant_id
            where v.option_id = o.id), '[]'::json)
        ) order by o.day, o.time_text, o.created_at)
        from private.poll_options o), '[]'::json))
  ) from private.settings s where s.id = 1
$function$;

create or replace function public.wichtel_me(p_token text)
 returns json language plpgsql stable security definer set search_path to ''
as $function$
declare p private.participants; t private.participants; s private.settings;
begin
  p := private.me(p_token);
  select * into s from private.settings where id = 1;
  if p.gift_to is not null then
    select * into t from private.participants where id = p.gift_to;
  end if;
  return json_build_object(
    'name', p.name,
    'wish', p.wish,
    'drawn', s.drawn_at is not null,
    'votes', coalesce((select json_agg(v.option_id) from private.poll_votes v where v.participant_id = p.id), '[]'::json),
    'wichtel', case when t.id is null then null
                    else json_build_object('name', t.name, 'wish', t.wish) end);
end $function$;

create or replace function public.wichtel_vote(p_token text, p_option uuid, p_yes boolean)
 returns void language plpgsql security definer set search_path to ''
as $function$
declare p private.participants;
begin
  p := private.me(p_token);
  if (select poll_final from private.settings where id = 1) is not null then
    raise exception 'Der Termin steht schon fest.';
  end if;
  if not exists (select 1 from private.poll_options where id = p_option) then
    raise exception 'Diesen Termin gibt es nicht mehr.';
  end if;
  if coalesce(p_yes, false) then
    insert into private.poll_votes (option_id, participant_id) values (p_option, p.id)
      on conflict do nothing;
  else
    delete from private.poll_votes where option_id = p_option and participant_id = p.id;
  end if;
end $function$;

create or replace function public.wichtel_admin_set_info(
  p_pw text, p_budget text, p_handover text, p_countdown_at timestamptz, p_countdown_label text)
 returns void language plpgsql security definer set search_path to ''
as $function$
begin
  perform private.require_admin(p_pw);
  update private.settings set
    budget = left(btrim(coalesce(p_budget, '')), 60),
    handover = left(btrim(coalesce(p_handover, '')), 120),
    countdown_at = p_countdown_at,
    countdown_label = left(btrim(coalesce(p_countdown_label, '')), 60)
  where id = 1;
end $function$;

create or replace function public.wichtel_admin_reset_pin(p_pw text, p_id uuid, p_new text)
 returns void language plpgsql security definer set search_path to ''
as $function$
begin
  perform private.require_admin(p_pw);
  if char_length(coalesce(p_new, '')) < 4 or char_length(p_new) > 64 then
    raise exception 'Die PIN muss mindestens 4 Zeichen lang sein.';
  end if;
  update private.participants
    set pin_hash = extensions.crypt(p_new, extensions.gen_salt('bf')),
        failed_logins = 0, locked_until = null
    where id = p_id;
  if not found then raise exception 'Person nicht gefunden.'; end if;
  delete from private.sessions where participant_id = p_id;
end $function$;

create or replace function public.wichtel_admin_poll_add(p_pw text, p_day date, p_time text default '')
 returns void language plpgsql security definer set search_path to ''
as $function$
declare v_time text := left(btrim(coalesce(p_time, '')), 30);
begin
  perform private.require_admin(p_pw);
  if p_day is null then raise exception 'Bitte ein Datum wählen.'; end if;
  if (select count(*) from private.poll_options) >= 20 then
    raise exception 'Mehr als 20 Terminvorschläge sind nicht möglich.';
  end if;
  if exists (select 1 from private.poll_options where day = p_day and time_text = v_time) then
    raise exception 'Diesen Termin gibt es schon.';
  end if;
  insert into private.poll_options (day, time_text) values (p_day, v_time);
end $function$;

create or replace function public.wichtel_admin_poll_remove(p_pw text, p_id uuid)
 returns void language plpgsql security definer set search_path to ''
as $function$
begin
  perform private.require_admin(p_pw);
  delete from private.poll_options where id = p_id;
  if not found then raise exception 'Termin nicht gefunden.'; end if;
end $function$;

create or replace function public.wichtel_admin_poll_final(p_pw text, p_id uuid)
 returns void language plpgsql security definer set search_path to ''
as $function$
begin
  perform private.require_admin(p_pw);
  if p_id is not null and not exists (select 1 from private.poll_options where id = p_id) then
    raise exception 'Termin nicht gefunden.';
  end if;
  update private.settings set poll_final = p_id where id = 1;
end $function$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.wichtel_vote(text, uuid, boolean)',
    'public.wichtel_admin_set_info(text, text, text, timestamptz, text)',
    'public.wichtel_admin_reset_pin(text, uuid, text)',
    'public.wichtel_admin_poll_add(text, date, text)',
    'public.wichtel_admin_poll_remove(text, uuid)',
    'public.wichtel_admin_poll_final(text, uuid)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated, service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
