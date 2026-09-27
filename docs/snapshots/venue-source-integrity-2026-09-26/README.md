# Venue Source Integrity — crawl-scope snapshot, 2026-09-26

The real crawl production performed on the hosts that carry more than one catalogue venue, used to
reproduce the cross-venue contamination and to measure any proposed fix against data rather than
against invented fixtures.

`crawl-scope.txt`, one line per distinct (venue, stored page):

```
<venue name>|<venue's own website>|<source_url stored against it>|<page_title the page gave itself>
```

48 rows, md5 `727f04b3837545b1c6d0c1ead63f4f09`
(`printf '%s' "$(cat crawl-scope.txt)" | md5sum`).

Scope: `venue_source_evidence` rows with `fetch_status` in (`ok`, `cached`, `fetched_truncated`) on
`vam.ac.uk`, `tate.org.uk`, `rmg.co.uk` and `flipout.co.uk` — the four hosts that contain both the
named failures and the counter-examples a fix must not break. The page title is carried verbatim
because it is the signal the pipeline already stores on every row and has never once consulted.

A note on the separator: page titles contain `|` (`"Tate Liverpool + RIBA North | Tate"`). Split on
the first three delimiters only and keep the remainder as the title.

No personal data: public venue pages only.
