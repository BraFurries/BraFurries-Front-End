import {
  CONTRACT_MODALITIES, CONTRACT_ROYALTY_METHODS,
  contractModalityDetails, contractRoyaltyDetails
} from './commerce-contract-labels';

describe('Commerce contract presentation labels', () => {
  it('provides a meaningful Portuguese label and explanation for every API modality', () => {
    expect(CONTRACT_MODALITIES.map(item => item.value)).toEqual([
      'ONE_TIME_FEE','RIGHTS_ASSIGNMENT','EXCLUSIVE_LICENSE',
      'NONEXCLUSIVE_LICENSE','ROYALTY','HYBRID'
    ]);
    for (const option of CONTRACT_MODALITIES) {
      expect(contractModalityDetails(option.value).label).toBe(option.label);
      expect(option.label).not.toBe(option.value);
      expect(option.description.length).toBeGreaterThan(25);
    }
  });

  it('describes every financial rule without implying that NONE means no payment at all', () => {
    expect(CONTRACT_ROYALTY_METHODS.map(item => item.value)).toEqual([
      'NONE','PERCENT_GROSS','PERCENT_NET','FIXED_UNIT','FIXED_MONTH'
    ]);
    for (const option of CONTRACT_ROYALTY_METHODS) {
      expect(contractRoyaltyDetails(option.value).label).toBe(option.label);
      expect(option.label).not.toBe(option.value);
      expect(option.description.length).toBeGreaterThan(25);
    }
    expect(contractRoyaltyDetails('NONE').label).toBe('Sem royalties previstos');
    expect(contractRoyaltyDetails('NONE').description).toContain('pagamento único');
  });

  it('does not show unfamiliar codes as untranslated terms on legacy records', () => {
    expect(contractModalityDetails('LEGACY_UNKNOWN').label).toBe('Modalidade não identificada');
    expect(contractRoyaltyDetails('UNRECOGNIZED').label)
      .toBe('Regra de repasse não identificada');
    expect(contractModalityDetails(null).label).toBe('Modalidade não identificada');
  });
});
