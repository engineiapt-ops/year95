import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

it("migration 027 is additive and denies direct client access to new tables", async () => {
  const sql = await readFile(new URL("../../db/migrations/027_add_identity_repository_tables.sql", import.meta.url), "utf8");
  expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS allowed_emails/i);
  expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS user_profiles/i);
  expect(sql).toMatch(/REFERENCES auth\.users\(id\) ON DELETE CASCADE/i);
  expect(sql.match(/ENABLE ROW LEVEL SECURITY/gi)).toHaveLength(2);
  expect(sql).toMatch(/REVOKE ALL PRIVILEGES ON TABLE allowed_emails FROM PUBLIC/i);
  expect(sql).toMatch(/REVOKE ALL PRIVILEGES ON TABLE user_profiles FROM PUBLIC/i);
  expect(sql).not.toMatch(/\b(?:DROP|TRUNCATE|RENAME)\b/i);
});
