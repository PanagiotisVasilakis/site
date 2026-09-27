// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import SearchBar from '@/components/SearchBar';

describe('search bar availability button', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('stays disabled for a zero-night range taken from the URL', async () => {
    window.history.replaceState(null, '', '/en?checkin=2030-07-10&checkout=2030-07-10');
    render(<SearchBar locale="en" />);

    const button = await screen.findByRole('button', { name: 'Check availability' });
    expect(button).toBeDisabled();
    expect(button).not.toHaveTextContent(/0 nights/);
  });

  it('is enabled for a stay of at least one night', async () => {
    window.history.replaceState(null, '', '/en?checkin=2030-07-10&checkout=2030-07-12');
    render(<SearchBar locale="en" />);

    const button = await screen.findByRole('button', { name: 'Check availability' });
    await vi.waitFor(() => expect(button).toBeEnabled());
    expect(button).toHaveTextContent('2 nights');
  });
});
