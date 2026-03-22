import type { SSHAlgorithmCatalog, SSHAlgorithmPreferences, SSHAlgorithmType } from '../../../shared/types/ssh';

const ssh2Constants = require('ssh2/lib/protocol/constants.js') as {
  DEFAULT_KEX: string[];
  SUPPORTED_KEX: string[];
  DEFAULT_SERVER_HOST_KEY: string[];
  SUPPORTED_SERVER_HOST_KEY: string[];
  DEFAULT_CIPHER: string[];
  SUPPORTED_CIPHER: string[];
  DEFAULT_MAC: string[];
  SUPPORTED_MAC: string[];
  DEFAULT_COMPRESSION: string[];
  SUPPORTED_COMPRESSION: string[];
};

const SSH_ALGORITHM_TYPE_ORDER: SSHAlgorithmType[] = [
  'kex',
  'hostKey',
  'cipher',
  'hmac',
  'compression',
];

const SSH_ALGORITHM_CATALOG: SSHAlgorithmCatalog = {
  defaults: {
    kex: [...ssh2Constants.DEFAULT_KEX],
    hostKey: [...ssh2Constants.DEFAULT_SERVER_HOST_KEY],
    cipher: [...ssh2Constants.DEFAULT_CIPHER],
    hmac: [...ssh2Constants.DEFAULT_MAC],
    compression: [...ssh2Constants.DEFAULT_COMPRESSION],
  },
  supported: {
    kex: [...ssh2Constants.SUPPORTED_KEX],
    hostKey: [...ssh2Constants.SUPPORTED_SERVER_HOST_KEY],
    cipher: [...ssh2Constants.SUPPORTED_CIPHER],
    hmac: [...ssh2Constants.SUPPORTED_MAC],
    compression: [...ssh2Constants.SUPPORTED_COMPRESSION],
  },
};

export function getSSHAlgorithmCatalog(): SSHAlgorithmCatalog {
  return {
    defaults: cloneSSHAlgorithmPreferences(SSH_ALGORITHM_CATALOG.defaults),
    supported: cloneSSHAlgorithmPreferences(SSH_ALGORITHM_CATALOG.supported),
  };
}

export function cloneSSHAlgorithmPreferences(value: SSHAlgorithmPreferences): SSHAlgorithmPreferences {
  return {
    kex: [...value.kex],
    hostKey: [...value.hostKey],
    cipher: [...value.cipher],
    hmac: [...value.hmac],
    compression: [...value.compression],
  };
}

export function resolveSSHAlgorithmPreferences(
  value?: Partial<SSHAlgorithmPreferences> | null,
): SSHAlgorithmPreferences {
  const catalog = getSSHAlgorithmCatalog();

  return SSH_ALGORITHM_TYPE_ORDER.reduce<SSHAlgorithmPreferences>((preferences, type) => {
    const supported = new Set(catalog.supported[type]);
    const candidate = Array.isArray(value?.[type]) ? value![type]! : catalog.defaults[type];
    const normalized = Array.from(new Set(candidate.filter((item) => typeof item === 'string' && supported.has(item))));

    preferences[type] = normalized.length > 0
      ? normalized
      : [...catalog.defaults[type]];
    return preferences;
  }, {
    kex: [],
    hostKey: [],
    cipher: [],
    hmac: [],
    compression: [],
  });
}
