import { render, waitFor } from '@testing-library/react';
import DocumentLocale from '@/components/DocumentLocale';

describe('DocumentLocale', () => {
  const originalLanguage = document.documentElement.lang;

  afterEach(() => {
    document.documentElement.lang = originalLanguage;
  });

  it('keeps the document language synchronized with localized navigation', async () => {
    const { rerender } = render(<DocumentLocale locale="en" />);
    await waitFor(() => expect(document.documentElement.lang).toBe('en'));

    rerender(<DocumentLocale locale="el" />);
    await waitFor(() => expect(document.documentElement.lang).toBe('el'));
  });
});
