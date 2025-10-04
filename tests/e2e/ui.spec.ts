import { test, expect } from '@playwright/test';

test('renders table and updates on server state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Mahjong Table')).toBeVisible();
  // Wait for initial game_state_update to render at least one player hand container
  await expect(page.getByRole('list', { name: 'hand' })).toBeVisible();
});


