/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/test"],
  testMatch: ["**/*.test.ts"],
  // Resolve the workspace IR package to its TS source (no build step in tests).
  moduleNameMapper: {
    "^@aurix/ir$": "<rootDir>/../ir/src/index.ts",
  },
  collectCoverageFrom: ["src/**/*.ts", "!src/examples/**"],
};
