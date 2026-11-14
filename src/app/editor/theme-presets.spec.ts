import {
  THEME_DEFAULTS,
  THEME_PRESETS,
  activeThemePreset,
  effectiveThemeColors,
} from './theme-presets';

const asSaved = (colors: Record<string, string>) =>
  Object.entries(colors).map(([variable, value]) => ({ variable, value }));

describe('theme presets', () => {
  it('every preset sets exactly the settable variables, as 6-digit hex', () => {
    // ez-api rejects anything else, so a typo here would be a 400 on click.
    const names = Object.keys(THEME_DEFAULTS).sort();
    for (const preset of THEME_PRESETS) {
      expect(Object.keys(preset.colors).sort()).withContext(preset.name).toEqual(names);
      for (const value of Object.values(preset.colors)) {
        expect(value).withContext(preset.name).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('presets are distinguishable from one another', () => {
    const keys = THEME_PRESETS.map((p) => JSON.stringify(p.colors));
    expect(new Set(keys).size).toBe(THEME_PRESETS.length);
  });

  it('a page with no saved colours is on the template default (Slate)', () => {
    expect(activeThemePreset(undefined)?.name).toBe('Slate');
    expect(activeThemePreset([])?.name).toBe('Slate');
  });

  it('recognises each preset from its saved colours, whatever the case', () => {
    for (const preset of THEME_PRESETS) {
      const saved = asSaved(preset.colors).map((cv) => ({
        ...cv,
        value: cv.value.toUpperCase(),
      }));
      expect(activeThemePreset(saved)?.name).toBe(preset.name);
    }
  });

  it('one hand-tuned colour makes the palette custom', () => {
    const saved = asSaved({ ...THEME_PRESETS[1].colors, '--accent-color1': '#123456' });
    expect(activeThemePreset(saved)).toBeNull();
  });

  it('layers a partial save over the defaults, ignoring unknown variables', () => {
    const colors = effectiveThemeColors([
      { variable: '--accent-color1', value: '#123456' },
      { variable: '--gray-100', value: '#ffffff' },
    ]);
    expect(colors['--accent-color1']).toBe('#123456');
    expect(colors['--surface']).toBe(THEME_DEFAULTS['--surface']);
    expect('--gray-100' in colors).toBe(false);
  });
});
