# Venue question email

Use this for the venues marked **Contact** in [VERIFICATION_QUEUE.md](VERIFICATION_QUEUE.md), and only after the
browser check for that venue has come up empty. Each queue entry lists two to four questions. Paste in that venue's
questions only, not a generic list.

Send from a FamilyPilot address that you are happy to have on record. Send it to the contact route listed in the
queue, or use the venue's own contact form. Do not guess an address. Nothing in this repository sends email.

---

**Subject:** A quick question about visiting {Venue name} with a baby and a toddler

Hello,

I run FamilyPilot, a small app that helps London parents with babies and young children plan days out. We only show
facilities that a venue has published itself, so where we can't find something on your website we would rather ask
than guess.

Could you tell me:

1. {Question 1}
2. {Question 2}
3. {Question 3}

If any of these only apply on certain days, at certain times or in one area, that detail is very helpful too. A short
reply is perfect, and so is a link to a page that already covers it.

With your permission we will show your answer in the app as information from {Venue name}, dated the day you replied.
If anything changes, just reply to this email and we'll update it.

Thank you,
{Your name}
FamilyPilot

---

## After a reply

1. Add one row per field to [answers-template.csv](answers-template.csv). Use the venue's own words in `exact_words`,
   and keep any day, area or eligibility limit in `restriction_or_detail`.
2. If they pointed you to a page, record that page as the source (`source_type` = `official_website`) instead of the
   email. The crawler can then read it on its next pass.
3. An answer of "not sure" or no answer is not a no. Leave the field unknown.
