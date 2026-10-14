import { ScrollViewStyleReset } from 'expo-router/html';
import type { ReactNode } from 'react';

import { colors } from '@/src/design-system/tokens';

// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
// The contents of this function only run in Node.js environments and
// do not have access to the DOM or browser APIs.
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>FamilyPilot</title>
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />

        {/*
          Disable body scrolling on web. This makes ScrollView components work closer to how they do on native.
          However, body scrolling is often nice to have for mobile web. If you want to enable it, remove this line.
        */}
        <ScrollViewStyleReset />

        {/* Using raw CSS styles as an escape-hatch to ensure the background color never flickers in dark-mode. */}
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
        {/* Add any additional <head> elements that you want globally available on web... */}
      </head>
      <body>
        {/* What a parent sees while the app downloads (on a slow connection that is seconds, not a blink): the brand on the app's own background,
            instead of a white page. Plain HTML and CSS, no script. The root layout removes it as soon as the app has drawn (app/_layout.tsx). */}
        <div id="boot-shell" aria-hidden="true">
          <span className="boot-mark" />
          <span className="boot-word">FamilyPilot</span>
        </div>
        {children}
      </body>
    </html>
  );
}

// The shell's colours are the app's own tokens (background, action, ink), read here so they cannot drift from the app.
const responsiveBackground = `
body {
  background-color: #fff;
}
@media (prefers-color-scheme: dark) {
  body {
    background-color: #000;
  }
}
#boot-shell {
  position: fixed; inset: 0; z-index: 0; display: flex; align-items: center; justify-content: center; gap: 12px;
  background-color: ${colors.background}; color: ${colors.ink}; font: 700 22px/1.2 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; letter-spacing: -0.02em;
}
#boot-shell .boot-mark { width: 22px; height: 22px; border-radius: 50%; background-color: ${colors.action}; animation: boot-pulse 1.4s ease-in-out infinite; }
@keyframes boot-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.45; transform: scale(0.82); } }
@media (prefers-reduced-motion: reduce) { #boot-shell .boot-mark { animation: none; } }`;
