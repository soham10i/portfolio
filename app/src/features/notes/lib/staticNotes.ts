import type { NoteMeta } from '../Notes';

export const STATIC_NOTES: NoteMeta[] = [
  {
    slug: 'diffusion-from-scratch',
    title: 'Diffusion models from scratch',
    summary:
      'The complete derivation — forward marginal, reverse posterior, the variational bound, and the proof that predicting the image, the noise and the score are one objective. Every theorem proved, then checked numerically on a five-step chain where all three parameterisations return the identical number.',
    topic: 'Generative models',
    tags: ['diffusion', 'DDPM', 'variational inference', 'score matching', 'guidance'],
    updated: '2026-08-29T00:00:00.000Z',
    words: 5074,
    readingMinutes: 27,
  },
];
