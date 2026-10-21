import obsidianmd from 'eslint-plugin-obsidianmd';

// Match the directory scan: Obsidian errors block releases; general code-quality
// findings remain visible warnings without expanding this UI-only repair.
const communityConfig = obsidianmd.configs.recommended.map(config => ({
  ...config,
  ...(config.rules ? {rules: Object.fromEntries(Object.entries(config.rules).map(([name, value]) => {
    const level = Array.isArray(value) ? value[0] : value;
    if (name.startsWith('obsidianmd/') || level === 'off' || level === 0) return [name, value];
    return [name, Array.isArray(value) ? ['warn', ...value.slice(1)] : 'warn'];
  }))} : {}),
}));

export default [
  {ignores: ['node_modules/**', 'main.js', 'tests/**', 'scripts/**', 'eslint.config.mjs']},
  ...communityConfig,
  {files: ['src/**/*.ts'], languageOptions: {parserOptions: {projectService: true}}},
];
