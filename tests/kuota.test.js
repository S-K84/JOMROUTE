const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers');

/** E-mel kepada pemilik bila kuota Google bersama mencapai 80%, sekali bagi setiap tetingkap. */
const mk = () => { const mails = []; return { mails, env: loadCode({ MailApp: { sendEmail: o => mails.push(o) } }) }; };

test('kuota G_maps: e-mel sekali bila mencapai 80%, tidak diulang, dan hanya untuk kuota Google bersama', () => {
  const { mails, env } = mk(), { ctx } = env;
  for (let i = 0; i < 175; i++) ctx.rateLimitAll_([['G_maps']]);          // 175 / 220 = 79.5%
  assert.strictEqual(mails.length, 0);
  ctx.rateLimitAll_([['G_maps']]);                                         // 176 = 80%
  assert.strictEqual(mails.length, 1);
  assert.match(mails[0].subject, /Kuota Google Maps/); assert.match(mails[0].body, /80% \(176 \/ 220\)/);
  assert.strictEqual(mails[0].to, 'pemilik@example.com');
  for (let i = 0; i < 20; i++) ctx.rateLimitAll_([['G_maps']]);
  assert.strictEqual(mails.length, 1);                                     // tetingkap sama: tidak diulang
  for (let i = 0; i < 300; i++) ctx.rateLimitAll_([['G_photon']]);         // kuota lain tidak dipantau
  assert.strictEqual(mails.length, 1);
});

test('kuota: tetingkap baharu dihantar semula; kegagalan e-mel tidak menggagalkan permintaan', () => {
  const { mails, env } = mk(), { ctx, clock } = env;
  for (let i = 0; i < 176; i++) ctx.rateLimitAll_([['G_maps']]);
  assert.strictEqual(mails.length, 1);
  clock.now += 7 * 3600e3;                                                 // tetingkap 6 jam seterusnya
  for (let i = 0; i < 176; i++) ctx.rateLimitAll_([['G_maps']]);
  assert.strictEqual(mails.length, 2);
  const bad = loadCode({ MailApp: { sendEmail: () => { throw new Error('kuota e-mel'); } } }).ctx;
  for (let i = 0; i < 180; i++) bad.rateLimitAll_([['G_maps']]);          // tiada ralat
});
