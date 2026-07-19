'use strict';
const { hashPassword } = require('./auth');

module.exports = function seed() {
  const { salt, hash } = hashPassword('holdfast');
  // team_monthly renews monthly — the period end must be ~1 month out, not a year,
  // or the console shows a monthly plan "renewing" 12 months away.
  const MONTH = 30 * 24 * 3600 * 1000;
  return {
    orgs: [
      {
        id: 'org1',
        name: 'Northshore Dental',
        seats: 14,
        plan: 'team_monthly',
        subscriptionStatus: 'active',
        currentPeriodEnd: Date.now() + MONTH,
        groups: [
          {
            id: 'g_front',
            name: 'Front desk',
            policy: {
              enforcement: 'locked', unblockMode: 'admin-approval', cooldownMinutes: 20, allowanceMinutes: 10,
              categories: ['Social', 'Gambling', 'Adult', 'Streaming'], customBlocklist: ['tiktok.com'],
              schedule: { days: 'Mon–Fri', from: '08:00', to: '18:00' }
            }
          },
          {
            id: 'g_clin',
            name: 'Clinicians',
            policy: {
              enforcement: 'locked', unblockMode: 'cooldown', cooldownMinutes: 15, allowanceMinutes: 10,
              categories: ['Gambling', 'Adult'], customBlocklist: [],
              schedule: { days: 'Mon–Fri', from: '08:00', to: '18:00' }
            }
          }
        ],
        enrollmentCodes: [
          { code: 'NSD-4K9-QX2', groupId: 'g_front' },
          { code: 'NSD-7P3-ZW8', groupId: 'g_clin' }
        ]
      }
    ],
    admins: [
      { id: 'a1', orgId: 'org1', email: 'admin@northshore.example', name: 'Ed Chan', salt, hash }
    ],
    devices: [],
    requests: [],
    events: [],
    users: [],
    checkouts: [],
    tokens: {}
  };
};
