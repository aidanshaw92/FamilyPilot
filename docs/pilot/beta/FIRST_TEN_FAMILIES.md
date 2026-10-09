# The first ten families

9 October 2026. A plan, not yet a launch. It starts only when the checklist at the end is clear.

## Who and how

Ten **unrelated London families** you choose, each with at least one child under 8, spread across at least three kinds of household (a baby in a buggy; a walking toddler plus a baby; school-age children; one household with a mobility aid or a step-free need if you can find one). You create each account in Supabase (**Authentication → Users → Invite user**); the family gets the invitation email, opens the link, chooses a password, and describes their family. Send the invitations in two groups of five, a few days apart, so a fault in the first group costs five families, not ten.

The message that goes with the invitation (plain text, from you):

> You're one of ten families helping us test FamilyPilot, an app that suggests days out in London that suit your children. You'll get an email from FamilyPilot with a link; open it, choose a password and tell the app about your family. It's early, so please tell us when something is wrong or surprising. We'd love 10 minutes on the phone after your first plan. Your children's details stay on your phone; we never see them.

## What we can measure, and how (there is no analytics, by design)

| Question | Source | Honest limit |
|---|---|---|
| Did at least 8 of 10 create and save a plan **without help**? | A 10-minute call after the first plan, with the same five questions each time (below); you note whether they needed help and where | Self-reported unless you watch their screen. The app records nothing about it. Ask them to open Plans and read out what is saved |
| Any critical privacy or account failure? | Family reports; the daily check of `monitoring.sql` block 7 (accounts = invitations sent); the crash log | Crashes only, not wrong content |
| Any unsupported "confirmed" claim? | Each family asked: "Was anything it told you wrong when you checked?" Every report is traced to its claim by id | Only what a family notices |
| Any unresolved wrong hard exclusion? | Each family asked: "Was there a place you expected that it would not plan?" | A family cannot see what is hidden from them, so the daily list of rules in force is the other half |
| Any new paid Google photo or Place Details call? | `monitoring.sql` block 1 daily; `live-canaries` weekly | Exact |
| Do the recommendations suit the children? | The call: for the top three venues it suggested, "would you take your children there, and why or why not?" | The one thing only families can tell us; record the words, not a score |

The five questions after the first plan: (1) What did you do first? (2) Was there a moment you weren't sure what to do? (3) Which of the places it suggested would you actually go to, and why? (4) Was anything it said wrong or surprising? (5) Would you use it again next weekend?

## Stop signals (pause further invitations and tell me)

A family cannot sign in or cannot set a password; any child's name, date of birth or address appearing anywhere it should not; a recommendation that sends a family to a closed place on a date the venue says it is closed; a venue confirmed with a fact a family finds false; any paid photo or Place Details call; a crash that blocks saving a plan.

## Success, as you set it

At least eight of ten can create and save a plan unaided; no critical privacy or account-access failure; no unsupported confirmed venue claim; no unresolved incorrect hard exclusion; no new paid Google photo or Place Details call; useful feedback on whether recommendations suit the children. **Only then** 20 to 30 families, in batches of 5 to 10 with the same measures. Not before, and the catalogue stays at the ten pilot venues.

## What still prevents inviting the first family

See the checklist in `EXECUTION_PLAN.md` (updated 9 October).
