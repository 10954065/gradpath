import { test as teardown } from '@playwright/test'
import { deleteE2eAccounts } from './support'

teardown('delete accounts created by the E2E suite', async () => {
  await deleteE2eAccounts()
})
