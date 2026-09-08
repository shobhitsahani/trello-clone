import { describe, expect, it } from "bun:test";
import { decryptSecret, encryptSecret, hashPassword, hashSecret, signPayload, verifyPassword } from "../src/lib/password.js";

describe("passwords", () => {
  it("hash + verify round-trips; wrong password fails", () => {
    const stored = hashPassword("correct horse battery staple");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("correct horse battery staple", stored)).toBe(true);
    expect(verifyPassword("wrong", stored)).toBe(false);
  });

  it("salts (same password → different hashes)", () => {
    expect(hashPassword("x")).not.toBe(hashPassword("x"));
  });
});

describe("secret handling", () => {
  it("hashes API keys one-way (hash-at-rest)", () => {
    const key = "tfk_live_abc123";
    const h = hashSecret(key);
    expect(h).toHaveLength(64);
    expect(h).toBe(hashSecret(key));
    expect(h).not.toContain(key);
  });

  it("encrypts/decrypts webhook secrets (AES-256-GCM)", () => {
    const secret = "whsec_test123";
    const stored = encryptSecret(secret);
    expect(stored.startsWith("v1.")).toBe(true);
    expect(stored).not.toContain(secret);
    expect(decryptSecret(stored)).toBe(secret);
  });

  it("signs webhook payloads deterministically (HMAC-SHA256)", () => {
    const sig = signPayload("secret", "body", "123");
    expect(sig).toBe(signPayload("secret", "body", "123"));
    expect(sig).toHaveLength(64);
    expect(signPayload("other", "body", "123")).not.toBe(sig);
  });
});