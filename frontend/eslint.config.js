import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
import refresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  { ignores: ["dist", "playwright-report", "node_modules", "public/pdf"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      "@typescript-eslint/no-namespace": ["error", { allowDeclarations: true }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": hooks, "react-refresh": refresh },
    rules: {
      ...hooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
          allowExportNames: ["pdfPageCount", "pdfImages"],
        },
      ],
    },
  },
  {
    files: ["src/main.tsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },
);
