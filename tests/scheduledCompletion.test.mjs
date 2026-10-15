import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('actual Worker scheduled entrypoint reports returned failures to Cloudflare', () => {
    const script = `
      import assert from 'node:assert/strict';
      import { readFileSync } from 'node:fs';
      import vm from 'node:vm';
      const source = readFileSync('src/index.js', 'utf8');
      let outcome;
      const imports = new Map([...source.matchAll(/import\\s*{([\\s\\S]*?)}\\s*from\\s*['"]([^'"]+)['"]/g)].map(match =>
        [match[2], match[1].split(',').map(name => name.trim()).filter(Boolean)]));
      const worker = new vm.SourceTextModule(source);
      await worker.link(specifier => {
        const names = imports.get(specifier);
        assert.ok(names, 'All imports must be isolated from real I/O');
        return new vm.SyntheticModule(names, function () {
          for (const name of names) {
            this.setExport(name, name === 'withWorkerConfigDefaults' ? env => env :
              name === 'resolveScheduledModeFromCron' ? cron => cron : async () => outcome);
          }
        });
      });
      await worker.evaluate();
      for (const cron of ['daily', 'opportunity-batch', 'blog']) {
        outcome = { success: true };
        await worker.namespace.default.scheduled({ cron }, {}, {});
        outcome = { success: false, failedSections: ['opportunity'] };
        await assert.rejects(worker.namespace.default.scheduled({ cron }, {}, {}), /did not complete/);
      }
    `;
    execFileSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '-e', script], {
        cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 15000,
    });
});
