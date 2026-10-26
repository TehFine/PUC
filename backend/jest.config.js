/** @type {import('jest').Config} */
module.exports = {
  rootDir: ".",
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  moduleFileExtensions: ["js", "json", "ts"],
  transform: { "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.json", diagnostics: true }] },
  testEnvironment: "node",
  globalSetup: "<rootDir>/tests/global-setup.ts",
  globalTeardown: "<rootDir>/tests/global-teardown.ts",
  testTimeout: 30000,
  maxWorkers: 1,
};
