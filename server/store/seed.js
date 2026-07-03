'use strict';
/*
 * Multi-tenant seed data.
 *
 * The shape is intentionally normalised-by-org so it maps cleanly onto both the
 * JSON store (blob keyed by orgId) and the Postgres store (rows with an org_id
 * column). Two orgs are seeded so tenant isolation is demonstrable, not just
 * claimed: an admin from one org must never see the other's devices, requests,
 * or reports.
 */
const { hashPassword } = require('../auth');

module.exports = function seed() {
  const northshorePw = hashPassword('deadbolt');
  const capePw = hashPassword('deadbolt');

  return {
    // orgs keyed by id; each is a self-contained tenant
    orgs: {
      org_northshore: {
        org: { id: 'org_northshore', name: 'Northshore Dental', seats: 14 },
        admins: [
          { id: 'a_ns1', orgId: 'org_northshore', email: 'admin@northshore.example', name: 'Ed Chan', salt: northshorePw.salt, hash: northshorePw.hash }
        ],
        groups: [
          {
            id: 'g_front', orgId: 'org_northshore', name: 'Front desk',
            policy: {
              enforcement: 'locked', unblockMode: 'admin-approval',
              cooldownMinutes: 20, allowanceMinutes: 10,
              categories: ['Social', 'Gambling', 'Adult', 'Streaming'],
              customBlocklist: ['tiktok.com'],
              schedule: { days: 'Mon–Fri', from: '08:00', to: '18:00' }
            }
          },
          {
            id: 'g_clin', orgId: 'org_northshore', name: 'Clinicians',
            policy: {
              enforcement: 'locked', unblockMode: 'cooldown',
              cooldownMinutes: 15, allowanceMinutes: 10,
              categories: ['Gambling', 'Adult'],
              customBlocklist: [],
              schedule: { days: 'Mon–Fri', from: '08:00', to: '18:00' }
            }
          }
        ],
        enrollmentCodes: [
          { code: 'NSD-4K9-QX2', orgId: 'org_northshore', groupId: 'g_front' },
          { code: 'NSD-7P3-ZW8', orgId: 'org_northshore', groupId: 'g_clin' }
        ],
        devices: [],
        requests: [],
        events: []
      },

      org_capecall: {
        org: { id: 'org_capecall', name: 'Cape Call Centre', seats: 40 },
        admins: [
          { id: 'a_cc1', orgId: 'org_capecall', email: 'admin@capecall.example', name: 'Thandi Mokoena', salt: capePw.salt, hash: capePw.hash }
        ],
        groups: [
          {
            id: 'g_floor', orgId: 'org_capecall', name: 'Call floor',
            policy: {
              enforcement: 'locked', unblockMode: 'admin-approval',
              cooldownMinutes: 30, allowanceMinutes: 5,
              categories: ['Social', 'Streaming', 'Gambling', 'Adult', 'News'],
              customBlocklist: ['youtube.com'],
              schedule: { days: 'Mon–Sat', from: '07:00', to: '19:00' }
            }
          }
        ],
        enrollmentCodes: [
          { code: 'CCC-2M8-RT5', orgId: 'org_capecall', groupId: 'g_floor' }
        ],
        devices: [],
        requests: [],
        events: []
      }
    },

    // tokens are global; each record carries the orgId it is scoped to
    tokens: {}
  };
};
