import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const ROOT_DIR = path.resolve(import.meta.dirname, "../..");
const LITERALS_DIR = path.join(ROOT_DIR, "public", "i18n", "literals");

const FOCUS_UI_LITERALS = [
  "关注UI",
  "Monitor MITM status, quota, and realtime logs in one place",
  "MITM server status and controls",
  "MITM tool interception status",
  "Quota Management",
  "Provider account quota overview",
  "Console Logs",
  "MITM / OpenrouterX realtime output",
  "Collapse",
  "Expand",
  "Live",
  "No console logs yet.",
];

function readLocale(fileName) {
  return JSON.parse(fs.readFileSync(path.join(LITERALS_DIR, fileName), "utf8"));
}

describe("Focus UI i18n literals", () => {
  it("covers every Focus UI literal in each locale file", () => {
    const localeFiles = fs.readdirSync(LITERALS_DIR).filter((fileName) => fileName.endsWith(".json"));
    const missingByLocale = Object.fromEntries(
      localeFiles
        .map((fileName) => {
          const translations = readLocale(fileName);
          const missing = FOCUS_UI_LITERALS.filter((literal) => !translations[literal]);
          return [fileName, missing];
        })
        .filter(([, missing]) => missing.length > 0),
    );

    expect(missingByLocale).toEqual({});
  });
});
