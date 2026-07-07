import type { Passage } from '@prosetype/schema';
import type { ReactElement } from 'react';

/**
 * Attribution epigraph (§9.4): EB Garamond italic, e.g.
 * "— Fyodor Dostoevsky, Crime and Punishment, trans. Garnett".
 */
export function Epigraph({ passage }: { passage: Passage }): ReactElement {
  const translator = passage.work.translator;
  return (
    <p className="font-serif text-[1.1rem] italic text-smoke">
      &mdash; {passage.author.name}, {passage.work.title}
      {translator !== null ? `, trans. ${translator}` : null}
    </p>
  );
}
