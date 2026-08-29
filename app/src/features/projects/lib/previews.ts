/* Which animated preview each project card renders. Kept out of the component
   file so ProjectPreview.tsx exports components only and fast refresh works. */

export type PreviewKind =
  | 'twin' | 'maze' | 'vision' | 'rag' | 'maintenance' | 'beacon' | 'diffusion' | 'iot';

export const PREVIEW_BY_PROJECT: Record<string, PreviewKind> = {
  'digital-twin': 'twin',
  slam: 'maze',
  scene: 'vision',
  medqa: 'rag',
  wind: 'maintenance',
  ble: 'beacon',
  'cv-uad': 'diffusion',
  'smart-home': 'iot',
};
