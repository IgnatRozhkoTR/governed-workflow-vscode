export type MermaidThemeName = 'default' | 'dark';

export interface MermaidTheme {
  readonly theme: MermaidThemeName;
  readonly themeVariables: Readonly<Record<string, string>>;
}

const LIGHT_BODY_CLASSES = ['vscode-light', 'vscode-high-contrast-light'];

const LIGHT_THEME: MermaidTheme = {
  theme: 'default',
  themeVariables: {
    primaryColor: '#e8edf3', primaryTextColor: '#1a1a2e', primaryBorderColor: '#c5cdd8', lineColor: '#8b8fa3',
    secondaryColor: '#f0f2f5', tertiaryColor: '#f8f9fa',
    actorBkg: '#e8edf3', actorBorder: '#c5cdd8', actorTextColor: '#1a1a2e',
    activationBkgColor: '#dde3ed', activationBorderColor: '#c5cdd8',
    signalColor: '#4a5078', signalTextColor: '#1a1a2e',
    labelBoxBkgColor: '#f0f2f5', labelBoxBorderColor: '#c5cdd8', labelTextColor: '#1a1a2e',
    loopTextColor: '#1a1a2e',
    noteBkgColor: '#fff8e1', noteBorderColor: '#b8860b', noteTextColor: '#1a1a2e',
  },
};

const DARK_THEME: MermaidTheme = {
  theme: 'dark',
  themeVariables: {
    primaryColor: '#2d3250', primaryTextColor: '#f0ede8', primaryBorderColor: '#4a5078', lineColor: '#8888a0',
    secondaryColor: '#252840', tertiaryColor: '#1e2035',
    actorBkg: '#2d3250', actorBorder: '#4a5078', actorTextColor: '#f0ede8',
    activationBkgColor: '#252840', activationBorderColor: '#4a5078',
    signalColor: '#8888a0', signalTextColor: '#f0ede8',
    labelBoxBkgColor: '#1e2035', labelBoxBorderColor: '#4a5078', labelTextColor: '#f0ede8',
    loopTextColor: '#f0ede8',
    noteBkgColor: '#3a3a2d', noteBorderColor: '#c7b76b', noteTextColor: '#f0ede8',
  },
};

export function isLightTheme(): boolean {
  return LIGHT_BODY_CLASSES.some((name) => document.body.classList.contains(name));
}

export function getMermaidTheme(): MermaidTheme {
  return isLightTheme() ? LIGHT_THEME : DARK_THEME;
}

export function getMermaidInit(): string {
  const { theme, themeVariables } = getMermaidTheme();
  const variables = Object.entries({ ...themeVariables, fontSize: '12px' })
    .map(([name, value]) => `'${name}': '${value}'`)
    .join(', ');
  return `%%{init: {'theme': '${theme}', 'themeVariables': {${variables}}, `
    + `'flowchart': {'nodeSpacing': 25, 'rankSpacing': 45, 'padding': 10, 'useMaxWidth': false}, `
    + `'classDiagram': {'useMaxWidth': false}}}%%`;
}

export function onThemeChange(listener: () => void): () => void {
  const observer = new MutationObserver(listener);
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}
