-- Floater as a shot type. The capture app now tags 2-point shots layup, dunk
-- or floater; the publisher already turned layup and dunk into the site's
-- sub types and sent everything else out as a jump shot. A floater goes out as
-- the site's "floatingjumpshot", which the shot chart already labels "Floater".
do $fix$
declare
  d text := pg_get_functiondef('capture._publish_game_core(uuid, boolean)'::regprocedure);
  old1 text := $q$q in ('layup', 'dunk', 'hook', 'tip') limit 1);$q$;
  new1 text := $q$q in ('layup', 'dunk', 'floater', 'hook', 'tip') limit 1);$q$;
  old2 text := $q$when 'dunk' then 'dunk' when 'hook'$q$;
  new2 text := $q$when 'dunk' then 'dunk' when 'floater' then 'floatingjumpshot' when 'hook'$q$;
begin
  if (length(d) - length(replace(d, old1, ''))) <> length(old1) then
    raise exception 'shot qualifier list not found exactly once';
  end if;
  if (length(d) - length(replace(d, old2, ''))) <> length(old2) then
    raise exception 'shot sub type case not found exactly once';
  end if;
  execute replace(replace(d, old1, new1), old2, new2);
end
$fix$;
