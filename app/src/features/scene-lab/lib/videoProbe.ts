/* Loading a video file in a browser fails in more ways than it succeeds, and
 * every one of them used to surface as "nothing happened".
 *
 * Three real failures, all reproduced:
 *
 *  1. `duration` comes back **Infinity**. Any file written as a stream —
 *     which is every MediaRecorder capture and most screen recordings — has
 *     no duration in its header. The old check was `Number.isFinite(duration)`
 *     and rejected these with "could not be decoded", which was both wrong and
 *     unhelpful. The fix is the standard one: seek far past the end, wait for
 *     `durationchange`, and read the real value the browser then computes.
 *
 *  2. The codec is not decodable here (HEVC, some MP4 profiles). The element
 *     fires `error` — but `canPlayType` still answers "maybe" for the very
 *     same file, so it cannot be used as a pre-check. You have to try.
 *
 *  3. Nothing fires at all. `loadeddata` and `seeked` are not guaranteed, and
 *     the old code awaited them with no timeout and no error listener, so a
 *     stalled decode hung the promise forever and the page just sat there.
 *
 * Every wait here is bounded and every failure returns a reason a visitor can
 * act on. */

export interface ProbeOk {
  ok: true;
  duration: number;
  width: number;
  height: number;
  /** true when the duration had to be recovered by seeking (streamed file) */
  recovered: boolean;
}
export interface ProbeFail { ok: false; reason: string }
export type ProbeResult = ProbeOk | ProbeFail;

const METADATA_TIMEOUT_MS = 12_000;
const DURATION_TIMEOUT_MS = 8_000;

/** Resolve on the first of several events, or on a timeout. Never hangs. */
function race(
  el: HTMLMediaElement,
  events: string[],
  ms: number,
  test?: () => boolean,
): Promise<'ok' | 'error' | 'timeout'> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: 'ok' | 'error' | 'timeout') => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      for (const e of events) el.removeEventListener(e, onEvent);
      el.removeEventListener('error', onError);
      resolve(v);
    };
    const onEvent = () => { if (!test || test()) finish('ok'); };
    const onError = () => finish('error');
    const timer = setTimeout(() => finish('timeout'), ms);
    for (const e of events) el.addEventListener(e, onEvent);
    el.addEventListener('error', onError);
    if (test?.()) finish('ok');
  });
}

/**
 * Inspect a video URL without committing to playback.
 * Uses a throwaway element so a failure cannot leave the visible player in a
 * broken state.
 */
export async function probeVideo(url: string): Promise<ProbeResult> {
  const v = document.createElement('video');
  v.preload = 'metadata';
  v.muted = true;
  v.playsInline = true;
  v.src = url;

  const meta = await race(v, ['loadedmetadata'], METADATA_TIMEOUT_MS, () => v.readyState >= 1);
  if (meta === 'error') {
    const code = v.error?.code;
    v.src = '';
    return {
      ok: false,
      reason: code === 4
        ? 'This browser cannot decode that video. H.265/HEVC and some MP4 profiles are not supported — re-export as H.264 MP4 or WebM and try again.'
        : 'The file could not be read as video. It may be corrupt or not actually a video file.',
    };
  }
  if (meta === 'timeout') {
    v.src = '';
    return { ok: false, reason: 'The browser stalled while reading that file. It may be very large or on a slow disk — try a smaller clip.' };
  }

  let duration = v.duration;
  let recovered = false;

  /* Streamed containers report Infinity until the browser has seen the end.
     Seeking past it forces the real duration to be computed. */
  if (!Number.isFinite(duration) || duration === 0) {
    recovered = true;
    const got = await race(v, ['durationchange', 'seeked'], DURATION_TIMEOUT_MS,
      () => Number.isFinite(v.duration) && v.duration > 0);
    v.currentTime = 1e101;
    if (got !== 'ok') {
      await race(v, ['durationchange', 'seeked'], DURATION_TIMEOUT_MS,
        () => Number.isFinite(v.duration) && v.duration > 0);
    }
    duration = v.duration;
    v.currentTime = 0;
  }

  const width = v.videoWidth;
  const height = v.videoHeight;
  v.src = '';
  v.load();

  if (!width || !height) {
    return { ok: false, reason: 'That file has no decodable video track — it may be audio-only, or the video codec is unsupported here.' };
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    return { ok: false, reason: 'The clip has no usable duration. Re-encoding it (for example with ffmpeg) usually fixes this.' };
  }

  return { ok: true, duration, width, height, recovered };
}

/** Seek and wait, bounded. Returns false if the seek never completed. */
export function seekTo(v: HTMLVideoElement, t: number, ms = 6000): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      v.removeEventListener('seeked', onSeeked);
      v.removeEventListener('error', onError);
      resolve(ok);
    };
    const onSeeked = () => finish(true);
    const onError = () => finish(false);
    const timer = setTimeout(() => finish(false), ms);
    v.addEventListener('seeked', onSeeked);
    v.addEventListener('error', onError);
    try {
      v.currentTime = t;
    } catch {
      finish(false);
    }
  });
}

/** Wait until the element has an actual frame to draw. */
export async function waitForFrame(v: HTMLVideoElement, ms = 10_000): Promise<boolean> {
  if (v.readyState >= 2 && v.videoWidth > 0) return true;
  const r = await race(v, ['loadeddata', 'canplay'], ms, () => v.readyState >= 2 && v.videoWidth > 0);
  return r === 'ok';
}
