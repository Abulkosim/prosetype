import type { ReactElement } from 'react';

import { TypingStage } from '../stage/TypingStage';

/** `/` — the test (§9.1). Passage stage, live HUD, result view in place. */
export function StagePage(): ReactElement {
  return <TypingStage />;
}
