import { test, expect, Page } from '@playwright/test';

// Generate a unique username per test run to avoid conflicts
const testUser = `e2euser_${Date.now()}`;
const testPassword = 'testpass123';

// Scoped locator helpers
const navbar = (page: Page) => page.locator('.navbar');

test.describe('Unauthenticated user', () => {
  test('can see the home page with public navigation', async ({ page }) => {
    await page.goto('/');
    const nav = navbar(page);
    await expect(nav).toBeVisible();
    await expect(nav.locator('a[href="/pricing"]')).toBeVisible();
    await expect(nav.locator('a[href="/login"]')).toBeVisible();
    await expect(nav.locator('a[href="/signup"]')).toBeVisible();

    // Should NOT see authenticated nav links
    await expect(nav.locator('a[href="/pages"]')).not.toBeVisible();
    await expect(nav.locator('a[href="/layouts"]')).not.toBeVisible();
    await expect(nav.locator('a[href="/account"]')).not.toBeVisible();
  });

  test('can see the pricing page with all three tiers', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.locator('.pricing-header h1')).toHaveText('Simple, transparent pricing');

    // All three plans visible
    await expect(page.locator('.pricing-card')).toHaveCount(3);
    await expect(page.locator('.plan-name', { hasText: 'Basic' })).toBeVisible();
    await expect(page.locator('.plan-name', { hasText: 'Pro' })).toBeVisible();
    await expect(page.locator('.plan-name', { hasText: 'Enterprise' })).toBeVisible();

    // Monthly prices shown by default
    await expect(page.locator('.pricing-card:nth-child(1) .price')).toHaveText('$10');
    await expect(page.locator('.pricing-card:nth-child(2) .price')).toHaveText('$25');
    await expect(page.locator('.pricing-card:nth-child(3) .price')).toHaveText('$50');
  });

  test('can toggle pricing between monthly and yearly', async ({ page }) => {
    await page.goto('/pricing');

    // Default is monthly
    await expect(page.locator('.pricing-card:nth-child(1) .price')).toHaveText('$10');

    // Toggle to yearly
    await page.locator('.toggle-switch').click();
    await expect(page.locator('.pricing-card:nth-child(1) .price')).toHaveText('$100');
    await expect(page.locator('.pricing-card:nth-child(2) .price')).toHaveText('$250');
    await expect(page.locator('.pricing-card:nth-child(3) .price')).toHaveText('$500');

    // Savings should be displayed
    await expect(page.locator('.plan-savings').first()).toBeVisible();
  });

  test('is redirected away from protected routes', async ({ page }) => {
    await page.goto('/pages');
    await expect(page).not.toHaveURL('/pages');

    await page.goto('/account');
    await expect(page).not.toHaveURL('/account');

    await page.goto('/layouts');
    await expect(page).not.toHaveURL('/layouts');
  });

  test('can see the signup form', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.locator('.signup-container h2')).toHaveText('Sign Up');
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#confirmPassword')).toBeVisible();
  });

  test('can see the login form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('.login-container h2')).toHaveText('Login');
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
  });
});

test.describe('Signup and authenticated user', () => {
  test('can sign up and is redirected to pages', async ({ page }) => {
    await page.goto('/signup');

    await page.locator('#username').fill(testUser);
    await page.locator('#password').fill(testPassword);
    await page.locator('#confirmPassword').fill(testPassword);
    await page.locator('button[type="submit"]').click();

    // Should redirect to /pages after signup
    await expect(page).toHaveURL('/pages', { timeout: 10000 });
  });

  test('sees authenticated navigation after signup', async ({ page }) => {
    await signIn(page);
    const nav = navbar(page);

    await expect(nav.locator('a[href="/pages"]')).toBeVisible();
    await expect(nav.locator('a[href="/layouts"]')).toBeVisible();
    await expect(nav.locator('a[href="/account"]')).toBeVisible();

    // Should NOT see unauthenticated nav
    await expect(nav.locator('a[href="/login"]')).not.toBeVisible();
    await expect(nav.locator('a[href="/signup"]')).not.toBeVisible();
  });

  test('can access the account page', async ({ page }) => {
    await signIn(page);

    await navbar(page).locator('a[href="/account"]').click();
    await expect(page).toHaveURL('/account');
    await expect(page.locator('.account-page h1')).toHaveText('Account');
  });

  test('account page shows correct organization info', async ({ page }) => {
    await signIn(page);
    await page.goto('/account');

    // Wait for org data to load
    await expect(page.locator('.info-card').first()).toBeVisible({ timeout: 10000 });

    // Organization section
    const orgSection = page.locator('.account-section').first();
    await expect(orgSection.locator('h2')).toHaveText('Organization');

    // Org name should be "<username>'s Org"
    const nameRow = orgSection.locator('.info-row').nth(0);
    await expect(nameRow.locator('.info-value')).toHaveText(`${testUser}'s Org`);

    // Should be a personal org
    const typeRow = orgSection.locator('.info-row').nth(1);
    await expect(typeRow.locator('.info-value')).toHaveText('Personal');

    // Should have 1 member
    const membersRow = orgSection.locator('.info-row').nth(2);
    await expect(membersRow.locator('.info-value')).toHaveText('1');
  });

  test('account page shows subscription info for new user', async ({ page }) => {
    await signIn(page);
    await page.goto('/account');

    await expect(page.locator('.info-card').first()).toBeVisible({ timeout: 10000 });

    // Subscription section
    const subSection = page.locator('.account-section').nth(1);
    await expect(subSection.locator('h2')).toHaveText('Subscription');

    // New user has no plan
    const planRow = subSection.locator('.info-row').nth(0);
    await expect(planRow.locator('.info-value')).toHaveText('None');

    // Status should show "No subscription"
    const statusRow = subSection.locator('.info-row').nth(1);
    await expect(statusRow.locator('.status-badge')).toHaveText('No subscription');

    // Should show "View Plans" link since no active subscription
    await expect(subSection.locator('a[href="/pricing"]')).toBeVisible();
  });

  test('View Plans link goes to pricing page', async ({ page }) => {
    await signIn(page);
    await page.goto('/account');

    await expect(page.locator('.info-card').first()).toBeVisible({ timeout: 10000 });

    await page.locator('.account-section').nth(1).locator('a[href="/pricing"]').click();
    await expect(page).toHaveURL('/pricing');
  });

  test('can log out and sees public navigation again', async ({ page }) => {
    await signIn(page);
    const nav = navbar(page);

    await nav.locator('button', { hasText: 'Logout' }).click();

    // Should show public nav (wait for login link to confirm nav has updated)
    await expect(nav.locator('a[href="/login"]')).toBeVisible({ timeout: 10000 });
    await expect(nav.locator('a[href="/pricing"]')).toBeVisible();
    await expect(nav.locator('a[href="/account"]')).not.toBeVisible();
  });

  test('can log back in with existing credentials', async ({ page }) => {
    // Ensure user exists first (created by earlier signup test)
    await signIn(page);

    // Now log out
    await navbar(page).locator('button', { hasText: 'Logout' }).click();
    await expect(navbar(page).locator('a[href="/login"]')).toBeVisible({ timeout: 10000 });

    // Log back in
    await page.goto('/login');
    await page.locator('#username').fill(testUser);
    await page.locator('#password').fill(testPassword);
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/\/pages/, { timeout: 10000 });
    await expect(navbar(page).locator('a[href="/account"]')).toBeVisible();
  });
});

/** Helper: sign in via login, falling back to signup if user doesn't exist yet */
async function signIn(page: Page) {
  await page.goto('/login');
  await page.locator('#username').fill(testUser);
  await page.locator('#password').fill(testPassword);
  await page.locator('button[type="submit"]').click();

  // Wait for either successful navigation to /pages or an error message
  const result = await Promise.race([
    page.waitForURL('**/pages', { timeout: 10000 }).then(() => 'success' as const),
    page.locator('.error-message').waitFor({ timeout: 10000 }).then(() => 'error' as const),
  ]);

  if (result === 'error') {
    // User doesn't exist yet, sign up
    await page.goto('/signup');
    await page.locator('#username').fill(testUser);
    await page.locator('#password').fill(testPassword);
    await page.locator('#confirmPassword').fill(testPassword);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/pages', { timeout: 10000 });
  }
}
