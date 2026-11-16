import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  framework: { name: "@storybook/react-vite", options: {} },
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-a11y"],
  core: { disableTelemetry: true },
  // Tokens use light-dark(); don't let the CSS minifier lower it for old browsers
  // (tokens.css carries its own fallback for those).
  viteFinal: (config) => ({
    ...config,
    build: { ...config.build, cssTarget: ["chrome123", "edge123", "firefox120", "safari17.5"] },
  }),
};

export default config;
