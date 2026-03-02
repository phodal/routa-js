import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      ".next-desktop/**",
      "node_modules/**",
      "out/**",
      "build/**",
      "dist/**",
      ".vercel/**",
      "apps/desktop/src-tauri/target/**",
      "apps/desktop/src-tauri/bundled/**",
      "apps/desktop/src-tauri/frontend/**",
      "**/*.config.js",
      "**/*.config.mjs",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        module: "readonly",
        require: "readonly",
        exports: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
      },
    },
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
      "@next/next": nextPlugin,
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      // Convert all react-hooks rules to warnings
      ...Object.fromEntries(
        Object.entries(reactHooksPlugin.configs.recommended.rules).map(
          ([key, value]) => [key, value === "error" ? "warn" : value]
        )
      ),
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      // Disable some overly strict rules
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-require-imports": "off", // Allow require() for dynamic imports
      "@typescript-eslint/triple-slash-reference": "warn", // Downgrade to warning
      "@typescript-eslint/no-unsafe-function-type": "warn", // Downgrade to warning
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react/no-unescaped-entities": "warn", // Downgrade to warning
      // Downgrade all react-hooks rules to warnings
      "react-hooks/rules-of-hooks": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "@next/next/no-html-link-for-pages": "warn", // Downgrade to warning
      "no-useless-escape": "warn", // Downgrade to warning
      "prefer-const": "warn", // Downgrade to warning
      "no-empty": "warn", // Downgrade to warning
      "no-prototype-builtins": "warn", // Downgrade to warning
      "no-regex-spaces": "warn", // Downgrade to warning
      "no-fallthrough": "warn", // Downgrade to warning
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
];

export default eslintConfig;

