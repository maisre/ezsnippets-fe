// Theme palettes for the page composer's Theme card.
//
// SOURCE OF TRUTH is ez-view — keep these in sync by hand when it changes:
//  - THEME_PRESETS mirrors `COLOR_PRESETS` in
//    ez-view/src/templates/edit-template.txt (the content editor's colour panel)
//  - THEME_DEFAULTS mirrors the settable pairs in the first `:root` block of
//    ez-view/src/templates/css-template.txt
//  - the variable names are `SETTABLE_COLOR_VARIABLES` in
//    ez-view/src/view-page/page.controller.ts, and ez-api validates writes
//    against its own copy in ez-api/src/common/theme-colors.ts
//
// Today the template default is exactly the Slate preset, so a page with no
// saved colours shows Slate as active. That is computed below rather than
// assumed, so it stays right if either side changes.

import { PageColorVariable } from '../models';

export interface ThemePreset {
  name: string;
  /** Page, wash, dark and accent — the four backgrounds, for the swatch. */
  preview: [string, string, string, string];
  colors: Record<string, string>;
}

export const THEME_DEFAULTS: Record<string, string> = {
  '--surface': '#ffffff',
  '--on-surface': '#15181e',
  '--primary-color1': '#eef1f6',
  '--on-primary1': '#15181e',
  '--secondary-color1': '#1d2a44',
  '--on-secondary1': '#ffffff',
  '--accent-color1': '#8e4e00',
  '--on-accent1': '#ffffff',
};

export const THEME_PRESETS: ThemePreset[] = [
  {
    name: 'Slate',
    preview: ['#ffffff', '#eef1f6', '#1d2a44', '#8e4e00'],
    colors: {
      '--surface': '#ffffff', '--on-surface': '#15181e',
      '--primary-color1': '#eef1f6', '--on-primary1': '#15181e',
      '--secondary-color1': '#1d2a44', '--on-secondary1': '#ffffff',
      '--accent-color1': '#8e4e00', '--on-accent1': '#ffffff',
    },
  },
  {
    name: 'Coral',
    preview: ['#fffefd', '#eef0f5', '#16243d', '#a33a2b'],
    colors: {
      '--surface': '#fffefd', '--on-surface': '#1a1a1f',
      '--primary-color1': '#eef0f5', '--on-primary1': '#1a1a1f',
      '--secondary-color1': '#16243d', '--on-secondary1': '#ffffff',
      '--accent-color1': '#a33a2b', '--on-accent1': '#ffffff',
    },
  },
  {
    name: 'Sage',
    preview: ['#fffffe', '#ecf2ed', '#1c3328', '#7a2f5e'],
    colors: {
      '--surface': '#fffffe', '--on-surface': '#161a17',
      '--primary-color1': '#ecf2ed', '--on-primary1': '#161a17',
      '--secondary-color1': '#1c3328', '--on-secondary1': '#ffffff',
      '--accent-color1': '#7a2f5e', '--on-accent1': '#ffffff',
    },
  },
  {
    name: 'Harbor',
    preview: ['#ffffff', '#eaf2f5', '#123a4a', '#895000'],
    colors: {
      '--surface': '#ffffff', '--on-surface': '#12212b',
      '--primary-color1': '#eaf2f5', '--on-primary1': '#12212b',
      '--secondary-color1': '#123a4a', '--on-secondary1': '#ffffff',
      '--accent-color1': '#895000', '--on-accent1': '#ffffff',
    },
  },
  {
    name: 'Midnight',
    preview: ['#0c0f14', '#181d29', '#4a5a85', '#e8912b'],
    colors: {
      '--surface': '#0c0f14', '--on-surface': '#e8ebf2',
      '--primary-color1': '#181d29', '--on-primary1': '#e8ebf2',
      '--secondary-color1': '#4a5a85', '--on-secondary1': '#ffffff',
      '--accent-color1': '#e8912b', '--on-accent1': '#15181e',
    },
  },
];

/**
 * The colours a page actually renders with: its saved overrides on top of the
 * template defaults. ez-view layers them the same way, so a page that saved
 * only some variables (or none) still resolves to a full palette.
 */
export function effectiveThemeColors(
  saved: PageColorVariable[] | undefined,
): Record<string, string> {
  const colors = { ...THEME_DEFAULTS };
  for (const cv of saved ?? []) {
    if (cv.variable in colors && cv.value) colors[cv.variable] = cv.value.toLowerCase();
  }
  return colors;
}

/** The preset whose every variable matches, or null for a hand-tuned palette. */
export function activeThemePreset(
  saved: PageColorVariable[] | undefined,
): ThemePreset | null {
  const colors = effectiveThemeColors(saved);
  return (
    THEME_PRESETS.find((preset) =>
      Object.keys(colors).every(
        (variable) => preset.colors[variable]?.toLowerCase() === colors[variable],
      ),
    ) ?? null
  );
}
