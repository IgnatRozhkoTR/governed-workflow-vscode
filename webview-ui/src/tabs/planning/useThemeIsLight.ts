import { useEffect, useState } from 'preact/hooks';
import { isLightTheme, onThemeChange } from '../../lib/mermaidTheme';

export function useThemeIsLight(): boolean {
  const [isLight, setLight] = useState(isLightTheme);
  useEffect(() => onThemeChange(() => setLight(isLightTheme())), []);
  return isLight;
}
