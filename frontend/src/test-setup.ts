/**
 * Test environment setup.
 *
 * jsdom does not implement `matchMedia`, which ThemeService reads to pick up the
 * operating system's colour-scheme preference. Polyfilling it here keeps the
 * production service free of test-only branches.
 */
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  });
}
