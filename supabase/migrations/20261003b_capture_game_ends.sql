-- Which basket each team attacks, for full-court shot capture.
--
-- True  = the home team attacks the LEFT basket (as the scorer sees the
--         court) in the first half; teams swap ends at half-time, and
--         overtime keeps the second-half direction.
-- The scorer can flip it with "Swap ends" if it was set up the wrong way.
-- capture schema only.

alter table capture.games
  add column home_attacks_left_first_half boolean not null default false;
