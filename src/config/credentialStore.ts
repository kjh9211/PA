/**
 * Local, encrypted credential store for provider API keys.
 *
 * CLI flags and env vars are per-invocation. This store lets a user pass
 * --api-key/--model once and have it picked up automatically on every later
 * run, without re-exporting an env var each time.
 *
 * The encryption key is a random 32-byte value generated on first use and
 * kept in a file (key) separate from the ciphertext (credentials.json),
 * both under the user's home directory with owner-only permissions. This
 * guards against accidental exposure (e.g. a backup or sync tool scooping up
 * one file but not the other) - it does not protect against an attacker who
 * already has read access to the user's home directory, since the key lives
 * on the same machine as the ciphertext.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const CONFIG_DIR = path.join(homedir(), ".can-i-merge");
const KEY_FILE = path.join(CONFIG_DIR, "key");
const CREDENTIALS_FILE = path.join(CONFIG_DIR, "credentials.json");

const ALGORITHM = "aes-256-gcm";

interface EncryptedValue {
  iv: string;
  tag: string;
  data: string;
}

interface StoredProviderConfig {
  apiKey?: EncryptedValue;
  model?: string;
}

type CredentialsFile = Record<string, StoredProviderConfig>;

export interface ProviderConfig {
  apiKey?: string;
  model?: string;
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

function getOrCreateKey(): Buffer {
  ensureConfigDir();
  if (existsSync(KEY_FILE)) {
    return Buffer.from(readFileSync(KEY_FILE, "utf8"), "base64");
  }
  const key = randomBytes(32);
  writeFileSync(KEY_FILE, key.toString("base64"), { mode: 0o600 });
  return key;
}

function encrypt(plaintext: string, key: Buffer): EncryptedValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}

function decrypt(value: EncryptedValue, key: Buffer): string {
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(value.iv, "base64"));
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  const data = Buffer.concat([
    decipher.update(Buffer.from(value.data, "base64")),
    decipher.final(),
  ]);
  return data.toString("utf8");
}

function readCredentialsFile(): CredentialsFile {
  if (!existsSync(CREDENTIALS_FILE)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(CREDENTIALS_FILE, "utf8")) as CredentialsFile;
  } catch {
    return {};
  }
}

function writeCredentialsFile(contents: CredentialsFile): void {
  ensureConfigDir();
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(contents, null, 2), { mode: 0o600 });
}

/** Persist an API key and/or model for a provider, encrypting the API key at rest. */
export function saveProviderConfig(provider: string, config: ProviderConfig): void {
  const file = readCredentialsFile();
  const next: StoredProviderConfig = { ...file[provider] };

  if (config.apiKey !== undefined) {
    next.apiKey = encrypt(config.apiKey, getOrCreateKey());
  }
  if (config.model !== undefined) {
    next.model = config.model;
  }

  file[provider] = next;
  writeCredentialsFile(file);
}

/** Load a previously persisted API key/model for a provider, decrypting the API key. */
export function loadProviderConfig(provider: string): ProviderConfig {
  const stored = readCredentialsFile()[provider];
  if (!stored) {
    return {};
  }

  const result: ProviderConfig = {};
  if (stored.apiKey) {
    try {
      result.apiKey = decrypt(stored.apiKey, getOrCreateKey());
    } catch {
      // Key file missing/rotated or ciphertext corrupted - treat as absent
      // rather than crashing the CLI.
    }
  }
  if (stored.model) {
    result.model = stored.model;
  }
  return result;
}

/** Remove stored credentials for a provider (or all providers if omitted). */
export function clearProviderConfig(provider?: string): void {
  if (!existsSync(CREDENTIALS_FILE)) {
    return;
  }
  if (!provider) {
    unlinkSync(CREDENTIALS_FILE);
    return;
  }
  const file = readCredentialsFile();
  delete file[provider];
  writeCredentialsFile(file);
}
