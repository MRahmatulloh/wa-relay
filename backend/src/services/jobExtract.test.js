import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractJobsRules, extractPrice, normalizePlace } from './jobExtract.js';

describe('normalizePlace', () => {
  it('maps airports', () => {
    assert.equal(normalizePlace('Heathrow Airport'), 'LHR');
    assert.equal(normalizePlace('Gatwick'), 'LGW');
    assert.equal(normalizePlace('luton airport'), 'LTN');
    assert.equal(normalizePlace('Stansted'), 'STN');
    assert.equal(normalizePlace('LCY'), 'LCY');
  });

  it('rejects dashed separators', () => {
    assert.equal(normalizePlace('--------------------------------------------------'), null);
    assert.equal(normalizePlace('-'), null);
  });

  it('rejects title/vehicle fragments', () => {
    assert.equal(normalizePlace('TOMORROW @ between 13:00'), null);
    assert.equal(normalizePlace('Today Pair Job : 8'), null);
    assert.equal(normalizePlace('MPV -'), null);
    assert.equal(normalizePlace('8 Seater job'), null);
    assert.equal(normalizePlace('up)'), null);
  });

  it('strips leading From: prefix', () => {
    assert.equal(normalizePlace(', From Portsmouth'), 'Portsmouth');
  });
});

describe('extractJobsRules labeled From/To', () => {
  it('parses From:/To: block with Heathrow Terminal', () => {
    const r = extractJobsRules(
      '*Same Day Payment*\n\nFrom: Heathrow Terminal 5\n\nTo: BS7 8RZ\n\n*Price: £180 Net*',
    );
    assert.equal(r.jobs[0].from, 'LHR');
    assert.match(r.jobs[0].to, /BS7\s*8RZ/i);
    assert.equal(r.jobs[0].price, 180);
  });

  it('parses arrow postcode to Gatwick', () => {
    const r = extractJobsRules(
      'LU4 9YH➡️GATWICK SOUTH\n\n*FARE:£95NET*',
    );
    assert.match(r.jobs[0].from, /LU4/i);
    assert.equal(r.jobs[0].to, 'LGW');
    assert.equal(r.jobs[0].price, 95);
  });

  it('parses Pick Up From glued to airport + Address', () => {
    const r = extractJobsRules(
      'Pick Up FromLGW North Terminal\n\nAddress18 Sedgmoor Rd, Flackwell Heath, HP10 9AU\n\nFare £130',
    );
    assert.equal(r.jobs[0].from, 'LGW');
    assert.match(r.jobs[0].to, /HP10\s*9AU/i);
    assert.equal(r.jobs[0].price, 130);
  });
});

describe('extractPrice', () => {
  it('parses pound variants', () => {
    assert.equal(extractPrice('PRICE £75 NET'), 75);
    assert.equal(extractPrice('Net fare:£90'), 90);
    assert.equal(extractPrice('Price:90£'), 90);
    assert.equal(extractPrice('Fare 75 NET'), 75);
    assert.equal(extractPrice('Driver income:\t£110'), 110);
    assert.equal(extractPrice('80 Pounds'), 80);
    assert.equal(extractPrice('PAYMENT - £70 SAME DAY'), 70);
  });

  it('parses when £ became U+FFFD', () => {
    assert.equal(extractPrice('PRICE \uFFFD75 NET'), 75);
    assert.equal(extractPrice('\uFFFD150 Same Day'), 150);
  });

  it('parses Total : N Net', () => {
    assert.equal(extractPrice('Total : 135 Net'), 135);
  });

  it('prefers £fare over seat count in MPV 6 £85', () => {
    assert.equal(extractPrice('22:30 LTN to E16 1EA MPV 6 £85 Booster seat'), 85);
  });

  it('parses markdown Net Fare label', () => {
    assert.equal(extractPrice('*Net Fare:*  140.00\n\n*Same Day Payment*'), 140);
  });
});

describe('extractJobsRules pair booking', () => {
  it('reads both legs and Total fare', () => {
    const r = extractJobsRules(
      'Today Pair Booking\n\n13:45 E10 5LP  To heathrow (8 Seater)\n16:05 Heathrow  To EC3N 1JY (Estate)\n\nTotal : 135 Net',
    );
    assert.equal(r.jobs.length, 2);
    assert.equal(r.jobs[0].from, 'E10 5LP');
    assert.equal(r.jobs[0].to, 'LHR');
    assert.equal(r.jobs[0].price, 135);
    assert.equal(r.jobs[1].from, 'LHR');
    assert.match(r.jobs[1].to, /EC3N\s*1JY/i);
    assert.equal(r.jobs[1].price, null);
  });
});

describe('extractJobsRules pounds word', () => {
  it('Pick Up / Drop Off with N Pounds', () => {
    const r = extractJobsRules(
      'Today Landing   23:35 pm\n\nPick Up: Gatwick North Terminal\n\nDrop Off:     CR4 3LY\n\n80 Pounds \n9 seater ( 8 pax)',
    );
    assert.equal(r.jobs[0].from, 'LGW');
    assert.equal(r.jobs[0].to, 'CR4 3LY');
    assert.equal(r.jobs[0].price, 80);
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

  it('Gatwick N To postcode with markdown price', () => {
    const r = extractJobsRules(
      'Tomorrow @ *15:25 PM (Landing)*\n\nVehicle: MPV\n\nGatwick N To HA4 8EQ\n\nPrice: *£80 NET*',
    );
    assert.equal(r.jobs[0].from, 'LGW');
    assert.equal(r.jobs[0].to, 'HA4 8EQ');
    assert.equal(r.jobs[0].price, 80);
    assert.equal(r.parseStatus, 'silver');
  });

  it('P/U D/O with Job ID does not use Job ID as route', () => {
    const r = extractJobsRules(
      [
        'Job ID: 18316621-1',
        'TODAY – Monday, 03 August 2026',
        'P/U: 15:50, London Euston Train Station (EUS)',
        'D/O: Holiday Inn London – Gatwick Airport, Povey Cross Road, Horley RH6 0BA',
        'Vehicle: Minibus-8',
        'Net Fare: £95',
        'Payment: Same Day Payment (SDP)',
      ].join('\n'),
    );
    assert.equal(r.jobs[0].from, 'EUS');
    assert.equal(r.jobs[0].to, 'LGW');
    assert.equal(r.jobs[0].price, 95);
  });

  it('multiline P/U D/O after time-only label', () => {
    const r = extractJobsRules(
      [
        'TODAY – Monday, 03 August 2026',
        'Job ID: 18316621-1',
        'P/U: 15:50',
        'London Euston Train Station (EUS)',
        '',
        'D/O:',
        'Holiday Inn London – Gatwick Airport',
        'Povey Cross Road, Horley RH6 0BA',
        'Vehicle: Minibus-8',
        'Net Fare: £95',
      ].join('\n'),
    );
    assert.equal(r.jobs[0].from, 'EUS');
    assert.equal(r.jobs[0].to, 'LGW');
    assert.equal(r.jobs[0].price, 95);
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

  it('ignores dashed separator and parses @time LCY/Heathrow jobs', () => {
    const r = extractJobsRules(
      [
        '*MPV JOBS FOR TOMORROW*',
        '---------------------------------------------------------',
        '*@12:45*',
        'LCY to SE10 0TW, => *£55* NET',
        '',
        '*@15:25*',
        'Heathrow to WC2H 9AN => *£60* NET',
      ].join('\n'),
    );
    assert.equal(r.jobs.length, 2);
    assert.equal(r.jobs[0].from, 'LCY');
    assert.equal(r.jobs[0].to, 'SE10 0TW');
    assert.equal(r.jobs[0].price, 55);
    assert.equal(r.jobs[1].from, 'LHR');
    assert.equal(r.jobs[1].to, 'WC2H 9AN');
    assert.equal(r.jobs[1].price, 60);
  });

  it('parses stacked @time place/postcode blocks', () => {
    const r = extractJobsRules(
      [
        '*MPV JOBS FOR TOMORROW*',
        '---------------------------------------------------------',
        '*@12:45*',
        'LCY',
        'SE10 0TW,',
        '=> *£55* NET',
        '',
        '*@15:25*',
        'Heathrow',
        'WC2H 9AN',
        '=> *£60* NET',
      ].join('\n'),
    );
    assert.equal(r.jobs.length, 2);
    assert.equal(r.jobs[0].from, 'LCY');
    assert.equal(r.jobs[0].to, 'SE10 0TW');
    assert.equal(r.jobs[0].price, 55);
    assert.equal(r.jobs[1].from, 'LHR');
    assert.equal(r.jobs[1].to, 'WC2H 9AN');
    assert.equal(r.jobs[1].price, 60);
  });

  it('ignores Tomorrow Jobs date title when splitting numbered blocks', () => {
    const r = extractJobsRules(
      [
        'Tomorrow Jobs 05-08-2026',
        '',
        '**1. 04:00**',
        '',
        '* **Pickup:** SE3 8QL',
        '* **Drop-off:** Gatwick',
        '* **Vehicle:** MPV',
        '* **Fare:** £70',
        '',
        '**2. 04:00**',
        '',
        '* **Pickup:** RH2 7HQ',
        '* **Drop-off:** Gatwick',
        '* **Vehicle:** MINIVAN',
        '* **Fare:** £60',
        '',
        '**3. 05:00**',
        '',
        '* **Pickup:** BR6 8HD',
        '* **Drop-off:** Gatwick',
        '* **Vehicle:** MPV',
        '* **Fare:** £70',
      ].join('\n'),
    );
    assert.equal(r.jobs.length, 3);
    assert.equal(r.jobs[0].from, 'SE3 8QL');
    assert.equal(r.jobs[0].to, 'LGW');
    assert.equal(r.jobs[0].price, 70);
    assert.equal(r.jobs[1].from, 'RH2 7HQ');
    assert.equal(r.jobs[1].to, 'LGW');
    assert.equal(r.jobs[1].price, 60);
    assert.equal(r.jobs[2].from, 'BR6 8HD');
    assert.equal(r.jobs[2].to, 'LGW');
    assert.equal(r.jobs[2].price, 70);
  });

  it('splits multi Time:/Pickup: Gatwick list without treating date as route', () => {
    const r = extractJobsRules(
      [
        'Tomorrow Jobs 05-08-2026',
        '',
        '**Time:** 04:00',
        '**Pickup:** SE3 8QL',
        '**Drop-off:** Gatwick',
        '**Vehicle:** MPV',
        '**Fare:** £70',
        '',
        '**Time:** 04:00',
        '**Pickup:** RH2 7HQ',
        '**Drop-off:** Gatwick',
        '**Vehicle:** MINIVAN',
        '**Fare:** £60',
        '',
        '**Time:** 05:00',
        '**Pickup:** BR6 8HD',
        '**Drop-off:** Gatwick',
        '**Vehicle:** MPV',
        '**Fare:** £70',
      ].join('\n'),
    );
    assert.equal(r.jobs.length, 3);
    assert.equal(r.jobs[0].from, 'SE3 8QL');
    assert.equal(r.jobs[0].to, 'LGW');
    assert.equal(r.jobs[1].from, 'RH2 7HQ');
    assert.equal(r.jobs[2].from, 'BR6 8HD');
    assert.ok(r.jobs.every((j) => j.to === 'LGW'));
  });
});
