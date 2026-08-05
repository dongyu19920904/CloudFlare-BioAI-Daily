import test from 'node:test';
import assert from 'node:assert/strict';

import { runIndependentBioTasks } from '../src/bioTaskIsolation.js';

test('one opportunity failure does not prevent the other task from completing', async () => {
  let projectRan = false;
  const result = await runIndependentBioTasks({
    opportunity: async () => { throw new Error('opportunity failed'); },
    projectOpportunity: async () => {
      projectRan = true;
      return { success: true };
    },
  });
  assert.equal(projectRan, true);
  assert.equal(result.opportunity.success, false);
  assert.equal(result.projectOpportunity.success, true);
});
