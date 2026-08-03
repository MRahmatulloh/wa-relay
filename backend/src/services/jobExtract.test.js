import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractJobsRules, extractPrice, normalizePlace } from './jobExtract.js';

describe('normalizePlace', () => {
  it('maps airports', () => {
    assert.equal(normalizePlace('Heathrow Airport'), 'LHR');
    assert.equal(normalizePlace('Gatwick'), 'LGW');
    assert.equal(normalizePlace('luton airport'), 'LTN');
    assert.equal(normalizePlace('Stansted'), 'STN');
  });
});

describe('extractPrice', () => {
  it('parses pound variants', () => {
    assert.equal(extractPrice('PRICE £75 NET'), 75);
    assert.equal(extractPrice('Net fare:£90'), 90);
    assert.equal(extractPrice('Price:90£'), 90);
    assert.equal(extractPrice('Fare 75 NET'), 75);
    assert.equal(extractPrice('Driver income:\t£110'), 110);
  });
});

describe('extractJobsRules', () => {
  it('LHR TO postcode', () => {
    const r = extractJobsRules('8/9 SEATER \n\nTOMORROW  12:00\n\nLHR  TO  GU14\n\nPRICE £75 NET');
    assert.equal(r.jobs.length, 1);
    assert.equal(r.jobs[0].from, 'LHR');
    assert.equal(r.jobs[0].to, 'GU14');
    assert.equal(r.jobs[0].price, 75);
  });

  it('Pick up / Drop off', () => {
    const r = extractJobsRules(
      'SAME DAY PAYMENT \n\nPick up: Heathrow Airport \n\nDrop off: ME24JR\n\nTomorrow @6:15Am\n\nMPV\n\nNet fare:£90',
    );
    assert.equal(r.jobs[0].from, 'LHR');
    assert.match(r.jobs[0].to, /ME2\s*4JR|ME24JR/i);
    assert.equal(r.jobs[0].price, 90);
  });

  it('postcode To airport', () => {
    const r = extractJobsRules('ASAP (Pax Ready)\n\nUB7 9HU To Heathrow\n\nAny 8/9 Seater \n\n£50 NET');
    assert.match(r.jobs[0].from, /UB7/);
    assert.equal(r.jobs[0].to, 'LHR');
    assert.equal(r.jobs[0].price, 50);
  });

  it('dash route', () => {
    const r = extractJobsRules('*TOMORROW @ 12:00 LANDING TIME*\n\n*LGW - WC1*     \n\nANY MPV\n\n*£80*');
    assert.equal(r.jobs[0].from, 'LGW');
    assert.equal(r.jobs[0].to, 'WC1');
    assert.equal(r.jobs[0].price, 80);
  });

  it('multi At: From To', () => {
    const r = extractJobsRules(
      '*Tomorrow MPV Jobs*\n\nAt:  09:00, From: SO15 0HH, To: SW1V 1EQ ,,, MPV7/8,, *£140 net*\n\nAt:  14:30, From Portsmouth  To RM12 6SF ,,, MPV8 ,,, *£150net*\n\n*Available*',
    );
    assert.ok(r.jobs.length >= 2);
    assert.equal(r.jobs[0].price, 140);
    assert.equal(r.jobs[1].price, 150);
  });

  it('markdown pickup drop-off', () => {
    const r = extractJobsRules(
      '**8. 02:00**\n\n* **Pickup:** RH9 8HX\n* **Drop-off:** Gatwick\n* **Vehicle:** Minivan\n* **Fare:** £55',
    );
    assert.match(r.jobs[0].from, /RH9/);
    assert.equal(r.jobs[0].to, 'LGW');
    assert.equal(r.jobs[0].price, 55);
  });
});
