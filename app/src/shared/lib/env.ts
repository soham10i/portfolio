/** Public URL of the Smart Tabletop Factory twin on Google Cloud Run.
    VITE_STF_URL overrides it (e.g. a staging deploy); set it to an empty
    string to hide the live links and fall back to the recorded video. */
export const STF_LIVE_URL: string | undefined =
  (import.meta.env.VITE_STF_URL ?? 'https://stf-live-500754517962.europe-west1.run.app/stf/') || undefined;

