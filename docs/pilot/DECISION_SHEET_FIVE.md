# Five decisions only you (or a named delegate) should make

9 October 2026. Each of these can stop a family getting a plan for a date, or for a household that needs something. Nothing here is published; each takes effect only after a person approves it, and each can be withdrawn afterwards (set to disputed; the Step 1-style rollback applies to every publishing batch). Reply with a number and **Approve**, **Approve as a warning only**, **Edit** (say how) or **Unknown**, or name a delegate in writing ("delegated to X by the owner on <date>") and I will record it.

I could not open the live pages from this environment (the network blocks the venues' sites), so every quotation below is the stored reading of 8 October. **Before you approve, open each link once.** If the page no longer says it, choose Unknown.

---

## 1. Natural History Museum: closed Friday 9 October 2026 and 24–26 December

| | |
|---|---|
| Source | https://www.nhm.ac.uk/visit.html, read 8 Oct |
| The page says | "Closed 9 October and 24–26 December … Our South Kensington site will be closed on Friday 9 October 2026, as we're hosting a charity gala." |
| Context | Same page, opening-times line: "Open daily 10:00–17:50 (last entry 17:30) Closed 9 October and 24–26 December". The homepage and footer say "Open every day" and list only 24–26 December; that is standing text and does not say it is open on 9 October |
| Date or condition | Whole South Kensington site (not Tring, not one gallery), Friday 9 October 2026, and 24, 25, 26 December |
| Consequence for a family | The planner refuses those dates ("The South Kensington museum is closed on Friday 9 October 2026 for a charity gala.") and offers another day or venue; Home and Explore say **Closed today** on the day. Other dates are untouched. **9 October is today**, so by tomorrow only the Christmas closure matters |
| Recommendation | **Approve.** Confidence **high (about 90%)**. Two pages state it in the venue's own words; the contradiction is only generic footer text. The one thing to check on the live page today is that the notice has not been withdrawn |
| If you say Unknown | The app keeps using Google's hours and will plan a day out to a museum that is shut on those dates |

## 2. Science Museum: closed 24–26 December (and open daily 10:00–18:00)

| | |
|---|---|
| Source | https://www.sciencemuseum.org.uk/visit, read 8 Oct |
| The page says | "The museum is open daily from 10.00–18.00 (except for 24–26 December when the museum is closed)." |
| Date or condition | The whole museum, 24, 25, 26 December; otherwise 10:00 to 18:00 every day |
| Consequence for a family | Those three dates are refused; a visit that would run past 18:00 is refused. Google's hours agree on the weekly pattern, so only the Christmas closure is new |
| Recommendation | **Approve.** Confidence **high (about 95%)**: one direct, unambiguous sentence about the whole museum |
| If you say Unknown | A plan for Christmas week would be built for a closed museum |

## 3. Science Museum: buggies allowed, but bulky ones may be sent to a buggy park in some areas

| | |
|---|---|
| Source | https://www.sciencemuseum.org.uk/visit/young-explorers-guide-science-museum, read 8 Oct |
| The page says | "Buggies are allowed in the museum and galleries. However, in certain areas, you may be asked to leave your pram in a buggy park as it will be too bulky to be allowed into the area or exhibit. Buggy parking is available free of charge in the Spare Room, located opposite The Garden gallery on level -1. Please ensure that the pushchairs are empty." |
| Date or condition | Always; "in certain areas" (the page does not say which) |
| Consequence for a family | **Nobody is refused.** A household that brings a buggy sees a "Check before you go" note naming the buggy park; a household that says buggy access is a must-have is not excluded because buggies are allowed |
| Recommendation | **Approve as a warning only** (that is what the app does with it). Confidence **high (about 85%)** that the wording is faithful; the only judgment is whether "certain areas" is too vague to show, and I think a vague, honest caution is right |
| If you say Unknown | The buggy park information is hidden; nothing else changes |

## 4. Discover Children's Story Centre: festive closure

| | |
|---|---|
| Source | https://discover.org.uk/your-visit/, read 8 Oct |
| The page says | "Discover is open every day, 10am - 5pm … We're closed on 24, 25, 26, 31 December and 1 January over the festive period." |
| Date or condition | The whole centre; 24, 25, 26, 31 December 2026 and 1 January 2027 (the page gives no year; I inferred the next occurrence) |
| Consequence for a family | Those five dates are refused; a visit running past 17:00 is refused |
| Recommendation | **Approve.** Confidence **high (about 90%)**. The only inference is the year, which cannot be anything else for a notice read in October |
| If you say Unknown | A New Year's Eve plan would be built for a closed centre |

## 5. Discover Children's Story Centre: no buggies or pushchairs in storytelling or play areas

| | |
|---|---|
| Source | https://discover.org.uk/getting-here/, read 8 Oct |
| The page says | "There is buggy parking available on our Ground Floor. We do not allow buggies and pushchairs in any of our storytelling or play areas. If you have a smaller baby we recommend bringing a sling." |
| Date or condition | Always. Applies to the storytelling and play areas, which are the paid "Story Worlds"; the café and bookshop are open to everyone |
| Consequence for a family | A household that says buggy access is a **must-have** is told, in the venue's words, that Discover does not fit them (**no plan**; the date and venue stay discoverable). A household that merely brings a buggy gets a prominent warning and still gets a plan |
| Recommendation | **Approve as a restriction on the core visit.** Confidence **medium-high (about 75%)**. It is the venue's own flat statement and the play areas are what the ticket is for. This is the most consequential of the five because it removes a venue from a family's options; the alternative is **Approve as a warning only**, which never refuses anyone but lets a buggy-dependent family build a plan they cannot fully do |
| If you say Unknown | No warning at all: a family with a pram will not hear about the rule until they arrive |

---

### How a decision is recorded

You can answer in chat ("1 approve, 2 approve, 3 warning only, 4 approve, 5 approve as restriction") or in the expert review page (`review-expert-all.html`, these five are cards in it). I write each as a line in the tamper-evident audit trail with your name and the time. **Approving does not publish anything**: a separate publishing step (a batch of `rules.*` claims with a `human:` approver, its own rollback written first, run only when you say so) is the only thing that reaches families. Approved rules also expire after 30 days unless re-read.

### What I would not decide for you

None of the five is a close call on the facts. Item 5 is a judgment about consequences, which is why it has the lowest confidence.
