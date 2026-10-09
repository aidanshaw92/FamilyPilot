# The first five families

9 October 2026. This replaces the "first ten" plan for the opening group; the other five follow only if this group passes. Nothing is sent until the gates below are all ticked, in order.

## Gates (each one is checked, not assumed)
| # | Gate | Who | Evidence |
|---|---|---|---|
| 1 | #191 deployed; API canary green | done | `live-canaries` run on `main`, 9 Oct |
| 2 | The app loads and works on your phone | you | Your own pass of `END_TO_END_INVITE_TEST.md` section "device" |
| 3 | Paid photos off | you, then me | Your Vercel confirmation, then canary with `expect_off=photos` green |
| 4 | Custom SMTP, redirect URLs, sign-ups off | you | `YOUR_ACTIONS.md` rows 4 to 7; I then confirm the settings you report match the production address |
| 5 | One hosted invitation to your own address: email arrives, link opens, password chosen, family described, plan saved, sign out and in again | you, with me watching the logs | `END_TO_END_INVITE_TEST.md` |
| 6 | The 21 decisions made; approved cards published by a batch you authorised; live check green | you / reviewers, then me | `TWENTY_ONE_DECISIONS.md`; post-publish check below |
| 7 | Spending cap decided (PR #192 merged and configured, or the accepted interim) | you | PR #192 |

## The message that goes with the invitation (plain text, from you)
> You're one of five families helping us test FamilyPilot, an app that suggests days out in London that suit your children. You'll get an email from FamilyPilot with a link; open it, choose a password and tell the app about your family. It's early, so please tell us when something is wrong or surprising. We'd love 10 minutes on the phone after your first plan. Your children's details stay on your phone; we never see them.

## Who
Five unrelated London families, each with a child under 8, covering: a baby in a buggy; a walking toddler plus a baby; school-age children; if you can find one, a mobility aid or step-free need. Pick families who live near at least two of the five venues (Royal Air Force Museum, Discover, Horniman, London Zoo, Science Museum), since those are the places the app can recommend with confidence at launch.

## Tracker (fill in; no child details)
| # | Household type | Invited | Link opened | Password set | Plan saved unaided | Call done | Anything wrong or surprising |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |
| 4 | | | | | | | |
| 5 | | | | | | | |

Daily while the group is live: `monitoring.sql` (accounts equal invitations; no photo or Place Details spend; claims in force). After each call, the five questions in `FIRST_TEN_FAMILIES.md`.

## Stop and tell me
A family cannot sign in or set a password; a child's details appear where they should not; the app sends a family to a place that is closed on a date the venue says it is closed; a venue is confirmed with a fact a family finds false; any paid photo call; a crash that blocks saving a plan.

## Success for this group
Four of five create and save a plan unaided; no account or privacy failure; no false confirmed fact; no wrong hard exclusion; no paid photo call; useful feedback on whether the suggestions suit the children. Then the next five, not before.
