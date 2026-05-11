import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const ROOT_DIR = path.resolve(import.meta.dirname, "../..");
const LITERALS_DIR = path.join(ROOT_DIR, "public", "i18n", "literals");

const ANTIGRAVITY_NEW_INSTANCE_LITERALS = [
  "Open New Antigravity",
  "Open a new Antigravity window with MITM enabled",
  "Opened new Antigravity",
  "Open New",
];

function readLocale(fileName) {
  return JSON.parse(fs.readFileSync(path.join(LITERALS_DIR, fileName), "utf8"));
}

describe("Antigravity new instance i18n literals", () => {
  it("covers every new Antigravity launch literal in each locale file", () => {
    const localeFiles = fs.readdirSync(LITERALS_DIR).filter((fileName) => fileName.endsWith(".json"));
    const missingByLocale = Object.fromEntries(
      localeFiles
        .map((fileName) => {
          const translations = readLocale(fileName);
          const missing = ANTIGRAVITY_NEW_INSTANCE_LITERALS.filter((literal) => !translations[literal]);
          return [fileName, missing];
        })
        .filter(([, missing]) => missing.length > 0),
    );

    expect(missingByLocale).toEqual({});
  });
});
