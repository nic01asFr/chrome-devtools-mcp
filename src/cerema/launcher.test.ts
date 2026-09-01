/**
 * Tests — src/cerema/config (pure) + src/cerema/launcher (browser)
 *
 * config.ts : fonctions pures testables sans dépendances externes.
 * launcher.ts : nécessite Chrome + Puppeteer → testé en integration CI.
 */

import { describe, it, expect } from 'vitest';
import {
  parseChannel,
  parseUrlPatterns,
  resolveProfileDir,
  getForcedFlags,
  getDefaultViewport,
} from './config.js';

// ---------------------------------------------------------------------------
// parseChannel
// ---------------------------------------------------------------------------

describe('parseChannel', () => {
  it('retourne "chrome" par défaut quand aucun input', () => {
    expect(parseChannel(undefined)).toBe('chrome');
  });

  it('retourne "chrome" pour "chrome"', () => {
    expect(parseChannel('chrome')).toBe('chrome');
  });

  it('retourne le canal en minuscule', () => {
    expect(parseChannel('Chrome')).toBe('chrome');
    expect(parseChannel('CHROME')).toBe('chrome');
    expect(parseChannel('Beta')).toBe('beta');
  });

  it('lève pour un canal invalide', () => {
    expect(() => parseChannel('firefox')).toThrow(
      'CDM_CHANNEL invalide: "firefox"',
    );
    expect(() => parseChannel('chromium')).toThrow(
      'CDM_CHANNEL invalide: "chromium"',
    );
  });

  it('ignore le whitespace', () => {
    expect(parseChannel('  dev  ')).toBe('dev');
  });
});

// ---------------------------------------------------------------------------
// parseUrlPatterns
// ---------------------------------------------------------------------------

describe('parseUrlPatterns', () => {
  it('retourne undefined pour undefined', () => {
    expect(parseUrlPatterns(undefined)).toBeUndefined();
  });

  it('retourne undefined pour chaîne vide', () => {
    expect(parseUrlPatterns('')).toBeUndefined();
    expect(parseUrlPatterns('  ')).toBeUndefined();
  });

  it('parse un CSV simple', () => {
    expect(parseUrlPatterns('https://example.com')).toEqual([
      'https://example.com',
    ]);
  });

  it('parse un CSV multiple', () => {
    const result = parseUrlPatterns(
      'https://example.com, https://api.test.com,https://internal.corp',
    );
    expect(result).toEqual([
      'https://example.com',
      'https://api.test.com',
      'https://internal.corp',
    ]);
  });

  it('filtre les entrées vides du CSV', () => {
    expect(parseUrlPatterns('https://a.com,, https://b.com ,')).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });
});

// ---------------------------------------------------------------------------
// resolveProfileDir
// ---------------------------------------------------------------------------

describe('resolveProfileDir', () => {
  it('utilise DEFAULT_PROFILE_DIR quand profileDir est undefined', () => {
    expect(resolveProfileDir(undefined, 'chrome')).toBe('/data/profiles');
  });

  it('suffixe le channel non-chrome', () => {
    expect(resolveProfileDir(undefined, 'beta')).toBe(
      '/data/profiles/chrome-profile-beta',
    );
    expect(resolveProfileDir(undefined, 'dev')).toBe(
      '/data/profiles/chrome-profile-dev',
    );
  });

  it('utilise profileDir personnalisé', () => {
    expect(resolveProfileDir('/custom/profiles', 'chrome')).toBe(
      '/custom/profiles',
    );
    expect(resolveProfileDir('/custom/profiles', 'canary')).toBe(
      '/custom/profiles/chrome-profile-canary',
    );
  });
});

// ---------------------------------------------------------------------------
// getForcedFlags
// ---------------------------------------------------------------------------

describe('getForcedFlags', () => {
  it('retourne les 4 drapeaux forcés', () => {
    const flags = getForcedFlags();
    expect(flags).toEqual({
      channel: 'chrome',
      'usage-statistics': false,
      'performance-crux': false,
      'redact-network-headers': true,
    });
  });

  it('channel est toujours "chrome"', () => {
    expect(getForcedFlags().channel).toBe('chrome');
  });

  it('usage-statistics est toujours false', () => {
    expect(getForcedFlags()['usage-statistics']).toBe(false);
  });

  it('performance-crux est toujours false', () => {
    expect(getForcedFlags()['performance-crux']).toBe(false);
  });

  it('redact-network-headers est toujours true', () => {
    expect(getForcedFlags()['redact-network-headers']).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getDefaultViewport
// ---------------------------------------------------------------------------

describe('getDefaultViewport', () => {
  it('retourne 1280x720', () => {
    const vp = getDefaultViewport();
    expect(vp).toEqual({ width: 1280, height: 720 });
  });

  it('retourne un nouvel objet à chaque appel', () => {
    const a = getDefaultViewport();
    const b = getDefaultViewport();
    expect(a).toStrictEqual(b); // mêmes valeurs
    expect(a).not.toBe(b); // références différentes
    a.width = 999;
    expect(getDefaultViewport().width).toBe(1280); // original inchangé
  });
});
