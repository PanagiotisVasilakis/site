import LocaleNotFound from './[locale]/not-found';

// identity §9.10, root 404: URLs that match no route (e.g. three or more segments under a locale) render
// outside the locale layout, so this wraps the same siesta page in the landmark that layout would give it.
export default function RootNotFound() {
  return (
    <main id="main-content" className="status-main" role="main">
      <LocaleNotFound />
    </main>
  );
}
