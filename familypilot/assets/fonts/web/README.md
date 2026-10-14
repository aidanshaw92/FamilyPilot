# Inter, cut down for the web

The four weights the app draws with (Regular 400, Medium 500, Semi Bold 600, Bold 700), taken from `@expo-google-fonts/inter` (Inter, <https://rsms.me/inter/>, copyright The Inter Project Authors) and reduced to Latin, Latin-1, general punctuation, arrows, the euro sign and a check mark, as WOFF2. The native app keeps the full TTFs.

**Licence.** Inter is licensed under the SIL Open Font License 1.1 (<https://openfontlicense.org>), which allows subsetting and redistribution with the licence kept. The licence text ships with the package at `node_modules/@expo-google-fonts/inter/LICENSE` and with Inter itself.

**How they were made** (fonttools 4.67 with brotli):

```
pyftsubset Inter_<weight>.ttf \
  --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2190-2193,U+2212,U+2215,U+2713,U+FEFF,U+FFFD" \
  --layout-features='kern,liga,calt,tnum,case,ccmp,locl,mark,mkmk' --flavor=woff2 --output-file=Inter_<weight>-latin.woff2
```

`tnum` is kept because the app lines digits up in columns. A character outside the range is drawn by the system font.
