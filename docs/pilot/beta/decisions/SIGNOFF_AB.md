# Packs A and B: final sign-off recorded

9 October 2026. The owner signed off the 12 recorded decisions with their exact edited wording ("Final sign-off A and B"), subject to the official-source checks.

**Recorded** in `audit-packAB.jsonl`: 12 entries, hash chain verified (`verifyChain` ok), head `3ab90b9beccd43e4`. Reviewer on record: `owner`. Six approve, five edit, one unknown. Decisions on file: `packAB-final.jsonl`.

**This is not authorisation to publish production claims or to merge the pricing code.**

## Official-source check (`SOURCE_CHECK_AB.txt`)
Each card's quotation was searched for in the stored official page it cites (read 8 Oct 2026).
- **11 of 12 found**, every quoted part, on the cited page. The edited wording of cards 5, 6, 9, 11 and 12 only narrows or reuses text on those pages (for card 11, "Under 3 FREE" is in the same stored table; the Gunnersbury page never says "closed on Monday").
- **Card 10 (Discover price): not found.** It stays **Unknown**.

## Discover's price: one controlled free refetch (owner-authorised)
- Method: one `GET` of the page, with the production fetcher's bounds. No Google call, no database access, no claim touched, no paid usage. Run from a GitHub-hosted runner because this environment cannot reach the site; the result is committed to a branch, `evidence/discover-refetch-2026-10-09-1311`, and to `discover-refetch/discover-refetch-2026-10-09.json`.
- Source URL: https://discover.org.uk/your-visit (HTTP ok, no redirect)
- Retrieved: 2026-10-09 13:11:21 UTC; content sha256 `3552250741a5adb4facf424abbe0df91ba25f147ebaf1327451f4bc9360e57fd`
- What the page says today about price: "Prices for Day or Annual Entry to Discover. Add-on Storytelling, Immersive Exhibitions and other tickets cost between £3-£5.50. Day Entry - Adult or Child. Day Entry - Newham Adult or Child or concession. Annual Entry - Adult or Child…" It names the ticket types but shows **no amount for Day Entry**: no "£10", no "£9" anywhere on the page. The 26 September reading had them; the page has since changed (the amounts appear to be shown only in the booking step).
- **Conclusion: the current price cannot be verified from the official page. Card 10 stays Unknown; nothing about Discover's price is published.**
