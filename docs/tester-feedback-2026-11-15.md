# Tester feedback — 15 Nov 2026

First hands-on try by a club scorer, sent over WhatsApp. Each point, what was
actually going on in the app, and what was done on branch
`feature/tester-feedback-nov15`.

| # | Feedback | What was going on | Status |
|---|----------|-------------------|--------|
| 1 | Couldn't tell if the game was private or public, so deleted it | Nothing on the setup or capture screens says whether a game goes to the Swish site. The only hint is a tooltip on the sync pill. | Done: a "Public on Swish / Private" pill in the capture header, with what it means |
| 2 | Imported a roster from Swish and couldn't change a player's number | The roster row shows the number as plain text. There was no way to edit it after adding the player. | Done: tap the number to edit it, on the roster screen and from the starting-five check |
| 3 | Starters have to be set during setup and can't be changed later | Setup refused to continue without exactly 5 starters, and the capture screen had no way to change them | Done: starters are optional at setup; a "Starting five" check opens before the first play and can be reopened until that team's first sub |
| 4 | On a made basket, choosing assist removes and-one (and vice versa) | Tapping the passer closed the prompt. And-one first did come back to the assist, but only if the free throw went in | Done: either order works. Assist first → "Fouled on the play?" stays up. And-one first → assist, then who fouled, then the free throw |
| 5 | No assist prompt after free throws | FIBA's stats manual credits an assist when the pass leads to a shooting foul and at least one free throw goes in | Done: after a 2- or 3-shot shooting-foul trip with a make, "Who assisted?" comes up (then the rebound if the last one missed). Worth confirming against the 2024 FIBA Statisticians' Manual |
| 6 | Couldn't find subs on the main screen, only in "Add play" | Subs worked by tapping a bench player then an on-court player, but nothing said so | Done: a SUB button on each team panel opens a sub dialog (several players at once); bench taps still work |
| 7 | Tech / unsportsmanlike foul types need updating to the new names and categories | FIBA 2026 rules (from 1 Oct 2026): unsportsmanlike is split into **disruptive** (DI, doesn't count to ejection) and **flagrant** (FL, counts); technicals are **category 1** (counts) or **category 2** (delay/admin, doesn't). Ejection = 2 cat-1 T, 2 flagrant, or one of each | Done in the app (dialog, ejection count, play-by-play text). The site publisher still labels both disruptive and flagrant "unsportsmanlike" until its database function is updated |
| 8 | Separate FOUL and FOUL DRAWN buttons — simpler to have FOUL and then ask who drew it | FOUL already asks who was fouled; FOUL DRAWN was a second way in | Done: one FOUL button. Foul drawn is still in "Add a missed play" |
| 9 | Didn't check fouling out | On a 5th foul or an ejection the app showed a toast, but the player stayed on court and could be subbed back in | Done: the sub dialog opens with that player already picked to go off; fouled-out and ejected players can't come back on |

## Checked

Clicked through in local mode (browser-only data) on 15 Nov: starting five
(forced when a team has none, a shirt number changed from inside it), assist →
and-one, and-one → assist → foul → missed free throw → rebound, a 2-shot
shooting foul with one make → assist → rebound, a 5th foul opening the sub
with the player picked, one and two subs from the dialog, a fouled-out player
greyed out on the bench, two cat-2 techs and two disruptive fouls (no
ejection), cat-1 tech + flagrant (ejected), shirt number edit on the roster
screen. Typecheck clean.

Not seen: the "PUBLIC ON SWISH" state (local mode has no sync, so it always
reads PRIVATE), and anything on a phone-sized screen. One double-sub attempt
from the fouled-out dialog didn't save during testing and the dialog reset;
the same steps worked on retry and it didn't happen again.

## Still to do

- **Site labels for the new fouls.** The live `capture.publish_game` database
  function writes every `flagrant` event as "unsportsmanlike" (or
  "disqualifying"), and writes technicals without their category. Needs a
  migration that maps `disruptive` / `flagrant` and passes `category1` /
  `category2` through. Not written or applied yet.
- The WhatsApp thread carried on past the screenshot — check for more points.
