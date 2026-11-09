const DARK_MODERN = {
  'foreground': '#cccccc',
  'descriptionForeground': '#9d9d9d',
  'errorForeground': '#f85149',
  'focusBorder': '#0078d4',
  'widget-border': '#313131',
  'widget-shadow': '#0000005c',
  'editor-background': '#1f1f1f',
  'editor-foreground': '#cccccc',
  'editorWidget-background': '#202020',
  'editorWidget-border': '#454545',
  'editor-font-family': 'Menlo, Monaco, "Courier New", monospace',
  'editor-font-size': '12px',
  'editor-font-weight': 'normal',
  'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  'font-size': '13px',
  'font-weight': 'normal',
  'sideBar-background': '#181818',
  'sideBar-foreground': '#cccccc',
  'sideBar-border': '#2b2b2b',
  'sideBarSectionHeader-background': '#181818',
  'panel-background': '#181818',
  'panel-border': '#2b2b2b',
  'tab-activeBackground': '#1f1f1f',
  'tab-activeForeground': '#ffffff',
  'tab-inactiveBackground': '#181818',
  'tab-inactiveForeground': '#9d9d9d',
  'tab-border': '#2b2b2b',
  'tab-activeBorderTop': '#0078d4',
  'button-background': '#0078d4',
  'button-foreground': '#ffffff',
  'button-hoverBackground': '#026ec1',
  'button-secondaryBackground': '#313131',
  'button-secondaryForeground': '#cccccc',
  'button-secondaryHoverBackground': '#3c3c3c',
  'button-border': '#ffffff12',
  'input-background': '#313131',
  'input-foreground': '#cccccc',
  'input-border': '#3c3c3c',
  'input-placeholderForeground': '#989898',
  'inputOption-activeBorder': '#2488db',
  'inputValidation-errorBackground': '#5a1d1d',
  'inputValidation-errorBorder': '#be1100',
  'dropdown-background': '#313131',
  'dropdown-foreground': '#cccccc',
  'dropdown-border': '#3c3c3c',
  'list-hoverBackground': '#2a2d2e',
  'list-activeSelectionBackground': '#04395e',
  'list-activeSelectionForeground': '#ffffff',
  'list-inactiveSelectionBackground': '#37373d',
  'badge-background': '#616161',
  'badge-foreground': '#ffffff',
  'textLink-foreground': '#4daafc',
  'textLink-activeForeground': '#4daafc',
  'textCodeBlock-background': '#2b2b2b',
  'textBlockQuote-background': '#2b2b2b',
  'textBlockQuote-border': '#616161',
  'textPreformat-foreground': '#d0d0d0',
  'textSeparator-foreground': '#21262d',
  'scrollbarSlider-background': '#79797966',
  'scrollbarSlider-hoverBackground': '#646464b3',
  'progressBar-background': '#0078d4',
  'icon-foreground': '#cccccc',
  'toolbar-hoverBackground': '#5a5d5e50',
  'charts-red': '#f14c4c',
  'charts-blue': '#3794ff',
  'charts-yellow': '#cca700',
  'charts-orange': '#d18616',
  'charts-green': '#89d185',
  'charts-purple': '#b180d7',
  'testing-iconPassed': '#73c991',
  'testing-iconFailed': '#f14c4c',
  'editorWarning-foreground': '#cca700',
  'editorError-foreground': '#f14c4c',
  'editorInfo-foreground': '#3794ff',
  'diffEditor-insertedTextBackground': '#9ccc2c33',
  'diffEditor-removedTextBackground': '#ff000033',
  'diffEditor-insertedLineBackground': '#9bb95533',
  'diffEditor-removedLineBackground': '#ff000033',
  'gitDecoration-addedResourceForeground': '#81b88b',
  'gitDecoration-modifiedResourceForeground': '#e2c08d',
  'gitDecoration-deletedResourceForeground': '#c74e39',
  'terminal-background': '#181818',
  'terminal-foreground': '#cccccc',
  'banner-background': '#04395e',
  'banner-foreground': '#ffffff',
  'notificationsInfoIcon-foreground': '#3794ff',
  'notificationsWarningIcon-foreground': '#cca700',
  'notificationsErrorIcon-foreground': '#f14c4c',
};

export function themeStyleTag() {
  const declarations = Object.entries(DARK_MODERN).map(([name, value]) => `--vscode-${name}: ${value};`).join('\n');
  return `<style id="gw-harness-theme">
:root {
${declarations}
}
html { scrollbar-color: #79797966 transparent; }
body {
  margin: 0;
  padding: 0 20px;
  color: var(--vscode-foreground);
  background-color: var(--vscode-editor-background);
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  font-weight: var(--vscode-font-weight);
}
a { color: var(--vscode-textLink-foreground); }
</style>`;
}
