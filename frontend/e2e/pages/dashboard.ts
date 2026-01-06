import { expect } from '@playwright/test'
import type { Page } from 'playwright'
import { baseURL } from '../utils'

export const dashboard_page = async (page: Page) => {
  await page.goto(baseURL)
  await expect(page.getByRole('link', { name: 'Government of British Columbia' })).toBeVisible()
  await expect(page.getByText('QuickStart OpenShift')).toBeVisible()
  await expect(page.getByText('Applicant ID')).toBeVisible()
  await expect(page.getByText('Applicant Last Name')).toBeVisible()
  await expect(page.getByText('Employee CS Status')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Home' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'About gov.bc.ca' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Disclaimer' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Privacy' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Accessibility' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Copyright' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Contact us' })).toBeVisible()
  await expect(page.getByText('John.ipsum@test.com')).toBeVisible()
}
