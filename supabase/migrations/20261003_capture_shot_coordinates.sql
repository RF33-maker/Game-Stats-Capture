-- Exact shot locations for Pro capture.
--
-- Coordinates use the same space as the site's shot_chart table (FIBA
-- LiveStats): x 0-100 along the court's length (the app always records the
-- attacking half, so x is 0-50), y 0-100 across its width. shot_zone stays
-- as a readable label derived from the coordinates.
--
-- capture schema only. Coordinates are part of the event, so the append-only
-- guard now covers them too.

alter table capture.stat_events
  add column shot_x double precision check (shot_x between 0 and 100),
  add column shot_y double precision check (shot_y between 0 and 100),
  add constraint stat_events_shot_xy_together check ((shot_x is null) = (shot_y is null));

create or replace function capture.guard_stat_event_update()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (new.uid, new.game_uid, new.team_uid, new.player_uid, new.period, new.clock_seconds,
      new.event_type, new.value, new.shot_zone, new.shot_x, new.shot_y,
      new.ft_sequence_index, new.ft_sequence_total,
      new.pair_event_uid, new.replaces_event_uid, new.device_created_at, new.device_seq,
      new.created_by, new.created_at)
     is distinct from
     (old.uid, old.game_uid, old.team_uid, old.player_uid, old.period, old.clock_seconds,
      old.event_type, old.value, old.shot_zone, old.shot_x, old.shot_y,
      old.ft_sequence_index, old.ft_sequence_total,
      old.pair_event_uid, old.replaces_event_uid, old.device_created_at, old.device_seq,
      old.created_by, old.created_at)
  then
    raise exception 'Stat events cannot be edited — void it and record a replacement'
      using errcode = '42501';
  end if;
  if old.voided_at is not null and (new.voided_at is distinct from old.voided_at
       or new.voided_by is distinct from old.voided_by
       or new.void_reason is distinct from old.void_reason) then
    raise exception 'A voided stat event cannot be un-voided or re-voided'
      using errcode = '42501';
  end if;
  if new.voided_at is not null and old.voided_at is null then
    new.voided_by := auth.uid();
  end if;
  return new;
end;
$$;
