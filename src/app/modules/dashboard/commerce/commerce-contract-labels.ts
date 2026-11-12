/**
 * Labels for the contract codes persisted by the API.
 *
 * These strings are presentation only: never replace enum values in requests,
 * saved templates, or signed snapshots. The signed clauses remain the source
 * of truth for the legal terms.
 */
export interface ContractCodeLabel {
  readonly value: string;
  readonly label: string;
  readonly description: string;
}

export const CONTRACT_MODALITIES: readonly ContractCodeLabel[] = [
  {
    value: 'ONE_TIME_FEE',
    label: 'Pagamento único pela obra',
    description: 'Remuneração em valor único. Os direitos concedidos dependem das cláusulas do contrato.'
  },
  {
    value: 'RIGHTS_ASSIGNMENT',
    label: 'Cessão de direitos patrimoniais',
    description: 'Transferência dos direitos patrimoniais previstos nas cláusulas contratuais.'
  },
  {
    value: 'EXCLUSIVE_LICENSE',
    label: 'Licença exclusiva de uso',
    description: 'Autorização de uso com exclusividade, conforme os limites definidos no contrato.'
  },
  {
    value: 'NONEXCLUSIVE_LICENSE',
    label: 'Licença não exclusiva de uso',
    description: 'Autorização de uso sem exclusividade, conforme os limites definidos no contrato.'
  },
  {
    value: 'ROYALTY',
    label: 'Remuneração por royalties',
    description: 'Remuneração vinculada à regra de repasse definida no acordo.'
  },
  {
    value: 'HYBRID',
    label: 'Modelo misto de remuneração',
    description: 'Pode combinar pagamento inicial e repasses, conforme os valores e cláusulas acordados.'
  }
];

export const CONTRACT_ROYALTY_METHODS: readonly ContractCodeLabel[] = [
  {
    value: 'NONE',
    label: 'Sem royalties previstos',
    description: 'Não há repasse pela regra de royalties; isso não exclui um pagamento único acordado.'
  },
  {
    value: 'PERCENT_GROSS',
    label: 'Royalties sobre a receita bruta',
    description: 'Repasse percentual calculado sobre a receita bruta definida no acordo.'
  },
  {
    value: 'PERCENT_NET',
    label: 'Royalties sobre a receita líquida',
    description: 'Repasse percentual calculado sobre a receita líquida definida no acordo.'
  },
  {
    value: 'FIXED_UNIT',
    label: 'Repasse fixo por unidade',
    description: 'Valor fixo de repasse por unidade, conforme a base prevista no contrato.'
  },
  {
    value: 'FIXED_MONTH',
    label: 'Repasse fixo mensal',
    description: 'Valor fixo de repasse por mês, conforme as condições do contrato.'
  }
];

function contractCodeDetails(
  options: readonly ContractCodeLabel[], code: string | null | undefined,
  fallback: string
): ContractCodeLabel {
  return options.find(option => option.value === code) ?? {
    value: code ?? '',
    label: fallback,
    description: 'Consulte as condições cadastradas no contrato.'
  };
}

export function contractModalityDetails(code: string | null | undefined): ContractCodeLabel {
  return contractCodeDetails(CONTRACT_MODALITIES, code, 'Modalidade não identificada');
}

export function contractRoyaltyDetails(code: string | null | undefined): ContractCodeLabel {
  return contractCodeDetails(CONTRACT_ROYALTY_METHODS, code, 'Regra de repasse não identificada');
}
