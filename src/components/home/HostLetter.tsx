import { HOST_PROFILE } from '@/data/contact';
import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';

/**
 * identity §8 HostLetter, §9.1 item 9 (`id="host"`; /about redirects here). A paper card with the
 * host's letter (owner text, R3-C1). The signature and the meta (languages, reply time) are owner data:
 * each renders only when HOST_PROFILE holds it (§1.4), so without it the letter is title and text only.
 */
export default function HostLetter({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).home.host;
  const name = HOST_PROFILE.name.trim();
  const meta = [
    { key: 'languages', label: t.languages, value: HOST_PROFILE.languages[locale].trim() },
    { key: 'replies', label: t.replies, value: HOST_PROFILE.replyTime[locale].trim() },
  ].filter((row) => row.value !== '');

  return (
    <section id="host" className="host" aria-labelledby="host-title">
      <article className="letter" data-reveal data-tilt>
        <p className="letter__eyebrow">{t.eyebrow}</p>
        <h2 id="host-title" className="letter__title">{t.title}</h2>
        <div className="letter__body">
          {t.paragraphs.map((paragraph) => <p key={paragraph} className="letter__p">{paragraph}</p>)}
        </div>
        {name === '' ? null : <p className="letter__sig">— {name}</p>}
        {meta.length === 0 ? null : (
          <dl className="letter__meta">
            {meta.map((row) => (
              <div key={row.key} className="letter__meta-row">
                <dt className="letter__meta-label">{row.label}</dt>
                <dd className="letter__meta-value">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </article>
    </section>
  );
}
