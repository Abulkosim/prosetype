import { expect, test } from '@playwright/test';

/**
 * The single Phase 2 smoke (plan §11): load → type a seeded passage via real
 * keyboard events → result appears → reload → the run shows up in stats. It
 * guards the input wiring and the persistence loop end-to-end; it deliberately
 * does not re-test the engine's numbers (that is the engine's own suite).
 *
 * Typing cadence: ~60ms/char keeps wpm around 200 regardless of passage length
 * (duration scales with length), comfortably inside the server's 3s-minimum /
 * 350-wpm-max acceptance window so the result persists.
 */
test('type a passage, see the result, and find it in stats', async ({ page }) => {
  // Warm-up band → a shorter passage to type.
  await page.goto('/?band=warmup');

  const board = page.getByTestId('passage');
  await expect(board).toBeVisible();
  const text = ((await board.textContent()) ?? '').trim();
  expect(text.length).toBeGreaterThan(0);

  // Arm the submission waiter before typing finishes so we don't miss it. Its
  // timeout must outlast the full type-out (each keystroke re-renders the
  // board), so it is generous; the test timeout is larger still.
  const submitted = page.waitForResponse(
    (r) => r.url().includes('/api/v1/results') && r.request().method() === 'POST',
    { timeout: 75_000 },
  );

  // Focus the hidden textarea (clicking the stage focuses it) and type. 40ms
  // between keys keeps wpm well under the server's 350 ceiling even on a fast
  // machine, while the run stays comfortably longer than the 3s minimum.
  await page.locator('section[aria-label="Typing stage"]').click();
  await page.keyboard.type(text, { delay: 40 });

  // The result view replaces the stage in place after the completion hold.
  const result = page.locator('section[aria-label="Result"]');
  await expect(result).toBeVisible({ timeout: 15_000 });
  await expect(result.getByText('wpm').first()).toBeVisible();

  // The run must persist server-side before we reload (reloading would abort an
  // in-flight submission). Assert the server accepted it.
  const response = await submitted;
  expect(response.ok()).toBeTruthy();

  // Reload to prove nothing depends on in-memory state, then open stats.
  await page.reload();
  await page.goto('/stats');

  // The submitted run should appear (submission is fire-and-forget; the
  // web-first assertion retries until it lands).
  await expect(page.getByRole('heading', { name: 'history' })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('section[aria-label="Stats"] li').first()).toBeVisible();
});
