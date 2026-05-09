import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import vitestPlugin from "eslint-plugin-vitest";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "**/*.mjs"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["src/routes/**/*.ts"],
    rules: {
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { arguments: false } },
      ],
    },
  },
  {
    files: ["test/**/*.ts"],
    plugins: { vitest: vitestPlugin },
    rules: {
      ...vitestPlugin.configs.recommended.rules,
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/unbound-method": "off",
    },
    languageOptions: {
      globals: {
        ...globals.node,
        ...vitestPlugin.configs.env.languageOptions.globals,
      },
    },
  },
);
