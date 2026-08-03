import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseGeminiJobsPayload } from './geminiExtract.js';

describe('parseGeminiJobsPayload', () => {
  it('reads jobs object from candidate text', () => {
    const data = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  jobs: [{ from: 'LHR', to: 'GU14', price: 75, currency: 'GBP' }],
                }),
              },
            ],
          },
        },
      ],
    };
    const jobs = parseGeminiJobsPayload(data);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].from, 'LHR');
    assert.equal(jobs[0].price, 75);
  });

  it('accepts bare array', () => {
    const data = {
      candidates: [
        {
          content: {
            parts: [{ text: '[{"from":"LGW","to":"WC1","price":80}]' }],
          },
        },
      ],
    };
    assert.equal(parseGeminiJobsPayload(data)[0].to, 'WC1');
  });
});
