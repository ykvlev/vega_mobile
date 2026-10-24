import { seedDemoCatalog } from './demo-seed';

void seedDemoCatalog(process.env)
  .then(() => {
    console.log('Demo catalog seeded; no real prices or availability provided');
  })
  .catch(() => {
    console.error(
      'Demo seed refused or failed; check demo configuration and ownership collisions',
    );
    process.exitCode = 1;
  });
