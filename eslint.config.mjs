import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    ignores: [".fixtag.js", "node_modules/**", ".next/**"],
  },
];

export default eslintConfig;
