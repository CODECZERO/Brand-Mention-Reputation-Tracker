module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  moduleNameMapper: {
    "^src/(.*)$": "<rootDir>/src/$1",
  },
  setupFiles: ["<rootDir>/tests/setup-env.ts"],
  clearMocks: true,
  collectCoverageFrom: ["<rootDir>/src/**/*.ts", "!<rootDir>/src/**/*.d.ts"],
  modulePathIgnorePatterns: [
    "<rootDir>/.vscode",
    "<rootDir>/.windsurf",
    "<rootDir>/Downloads",
    "<rootDir>/Desktop",
    "<rootDir>/.config",
  ],
  watchPathIgnorePatterns: ["<rootDir>/.vscode", "<rootDir>/.windsurf"],
};
