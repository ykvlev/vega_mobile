import { provisionDemoManager } from './admin-provision';

// Secrets are accepted only through environment variables, never command arguments.
if (process.argv.length !== 2) {
  console.error('Staff provisioning accepts environment configuration only');
  process.exitCode = 1;
} else {
  void provisionDemoManager(process.env)
    .then(() => {
      console.log('Demo staff account provisioned');
    })
    .catch(() => {
      console.error('Demo staff provisioning refused or failed');
      process.exitCode = 1;
    });
}
