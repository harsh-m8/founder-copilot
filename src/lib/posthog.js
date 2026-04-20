import posthog from "posthog-js";

const key  = import.meta.env.VITE_POSTHOG_KEY;
const host = import.meta.env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com";

if (key) {
  posthog.init(key, {
    api_host:           host,
    capture_pageview:   false, // we fire $pageview manually on route changes (SPA)
    capture_pageleave:  true,  // enables time-on-page tracking
    autocapture:        true,  // clicks, inputs, form submits
    persistence:        "localStorage",
  });
}

export default posthog;
