import { describe, expect, it } from "vitest";

import { AsterClient } from "./client";


describe("AsterClient service origin", () => {
  it("accepts only a plain localhost origin", () => {
    expect(new AsterClient("http://127.0.0.1:8765", "token").baseUrl).toBe(
      "http://127.0.0.1:8765",
    );
    expect(new AsterClient("http://localhost:8765/", "token").baseUrl).toBe(
      "http://localhost:8765",
    );
  });

  it("rejects remote, userinfo and path-bearing URLs before a token can be sent", () => {
    expect(() => new AsterClient("https://example.com", "token")).toThrow(/localhost/);
    expect(() => new AsterClient("http://127.0.0.1:8765@evil.example", "token")).toThrow(
      /localhost/,
    );
    expect(() => new AsterClient("http://localhost:8765/proxy", "token")).toThrow(/localhost/);
  });

  it("requires a bearer token", () => {
    expect(() => new AsterClient("http://127.0.0.1:8765", "")).toThrow(/token/);
  });
});
