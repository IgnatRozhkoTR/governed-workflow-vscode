// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.stubGlobal('acquireVsCodeApi', () => ({ postMessage: vi.fn(), getState: () => undefined, setState: vi.fn() }));
vi.mock('../webview-ui/src/api/git', () => ({
  scanRepos: () => Promise.resolve({
    candidates: [
      { name: 'acme-shop_checkout-to-billing-legacy-transforms', rel_path: 'services/acme-shop_checkout-to-billing-legacy-transforms', current_branch: 'main' },
      { name: 'cobalt', rel_path: 'cobalt', current_branch: 'develop' },
    ],
  }),
  convertMulti: vi.fn(),
}));

import { ConvertPanel } from '../webview-ui/src/tabs/settings/sections/gitParts/ConvertPanel';

afterEach(cleanup);

describe('ConvertPanel', () => {
  it('renders each repo as a checkbox row with a titled name and a base-branch input', async () => {
    render(<ConvertPanel mode="edit" registry={[]} onClose={vi.fn()} />);
    const name = await waitFor(() => screen.getByText('acme-shop_checkout-to-billing-legacy-transforms', { selector: '.gw-git-convert-name' }));
    expect(name.getAttribute('title')).toBe('services/acme-shop_checkout-to-billing-legacy-transforms');
    const rows = document.querySelectorAll('.gw-git-convert-row');
    expect(rows).toHaveLength(2);
    const checkbox = rows[0]!.querySelector<HTMLInputElement>('.gw-git-convert-check input[type="checkbox"]')!;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(name);
    expect(checkbox.checked).toBe(true);
    expect(rows[0]!.querySelector<HTMLInputElement>('input.gw-git-convert-base')!.value).toBe('main');
  });
});
