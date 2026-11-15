import { createHash, createHmac, pbkdf2Sync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { drawDatabasePassword, drawFamilyKey, scramVerifier, wrapperFor } from "../../src/secrets";

const operatorKey = Buffer.alloc(32, 3);
const family = wrapperFor(operatorKey, "f-1");

describe("drawFamilyKey", () => {
  it("draws 32 random bytes, base64", () => {
    const key = drawFamilyKey();
    expect(key).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(Buffer.from(key, "base64")).toHaveLength(32);
    expect(drawFamilyKey()).not.toBe(key);
  });
});

describe("drawDatabasePassword", () => {
  it("draws 32 random bytes, base64url", () => {
    const password = drawDatabasePassword();
    expect(password).toMatch(/^[\w-]{43}$/);
    expect(Buffer.from(password, "base64url")).toHaveLength(32);
    expect(drawDatabasePassword()).not.toBe(password);
  });
});

describe("wrapperFor", () => {
  it("unwraps what it wrapped", () => {
    expect(family.unwrap("family-key", family.wrap("family-key", "the family key"))).toBe("the family key");
    expect(family.unwrap("database-password", family.wrap("database-password", "pässwörd"))).toBe("pässwörd");
  });

  it("wraps as v1, a 12-byte IV and the ciphertext with its 16-byte tag, never in the clear", () => {
    const wrapped = family.wrap("family-key", "the family key");
    const [version, iv, sealed, ...rest] = wrapped.split(".");
    expect(version).toBe("v1");
    expect(Buffer.from(iv!, "base64url")).toHaveLength(12);
    expect(Buffer.from(sealed!, "base64url")).toHaveLength("the family key".length + 16);
    expect(rest).toEqual([]);
    expect(wrapped).not.toContain(Buffer.from("the family key").toString("base64url"));
  });

  it("wraps the same secret differently each time", () => {
    expect(family.wrap("family-key", "same")).not.toBe(family.wrap("family-key", "same"));
  });

  it("does not unwrap a secret for another Family", () => {
    const wrapped = family.wrap("family-key", "the family key");
    expect(() => wrapperFor(operatorKey, "f-2").unwrap("family-key", wrapped)).toThrow();
  });

  it("does not unwrap a secret as another purpose", () => {
    const wrapped = family.wrap("family-key", "the family key");
    expect(() => family.unwrap("database-password", wrapped)).toThrow();
  });

  it("does not unwrap with another Operator key", () => {
    const wrapped = family.wrap("family-key", "the family key");
    expect(() => wrapperFor(Buffer.alloc(32, 4), "f-1").unwrap("family-key", wrapped)).toThrow();
  });

  it("does not unwrap a tampered secret", () => {
    const [version, iv, sealed] = family.wrap("family-key", "the family key").split(".");
    const bytes = Buffer.from(sealed!, "base64url");
    bytes[0] = bytes[0]! ^ 1;
    expect(() => family.unwrap("family-key", [version, iv, bytes.toString("base64url")].join("."))).toThrow();
  });

  it.each(["", "v1", "v1.abc", "v2.abc.def", "v1..def", "v1.abc."])("refuses the unknown format %j", (wrapped) => {
    expect(() => family.unwrap("database-password", wrapped)).toThrow("The wrapped database-password has an unknown format");
  });
});

/** The verifier's parts, as RFC 7677 defines them. */
const parse = (verifier: string) => {
  const match = /^SCRAM-SHA-256\$(\d+):([^$]+)\$([^:]+):(.+)$/.exec(verifier);
  if (!match) throw new Error(`Not a SCRAM-SHA-256 verifier: ${verifier}`);
  return { iterations: Number(match[1]), salt: Buffer.from(match[2]!, "base64"), storedKey: match[3]!, serverKey: match[4]! };
};

/** StoredKey and ServerKey of a password, per RFC 5802. */
const keysOf = (password: string, salt: Buffer, iterations: number) => {
  const salted = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  return {
    storedKey: createHash("sha256").update(clientKey).digest("base64"),
    serverKey: createHmac("sha256", salted).update("Server Key").digest("base64"),
  };
};

describe("scramVerifier", () => {
  it("is the verifier Postgres stores: 4096 iterations, a 16-byte salt, StoredKey and ServerKey", () => {
    const { iterations, salt, storedKey, serverKey } = parse(scramVerifier("the password"));
    expect(iterations).toBe(4096);
    expect(salt).toHaveLength(16);
    expect({ storedKey, serverKey }).toEqual(keysOf("the password", salt, 4096));
  });

  it("salts each verifier afresh", () => {
    expect(parse(scramVerifier("the password")).salt).not.toEqual(parse(scramVerifier("the password")).salt);
  });

  it("normalizes the password (NFKC), as SASLprep does", () => {
    const { salt, storedKey, serverKey } = parse(scramVerifier("Ⅸ"));
    expect({ storedKey, serverKey }).toEqual(keysOf("IX", salt, 4096));
  });
});
