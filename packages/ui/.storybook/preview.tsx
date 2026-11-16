import "../src/styles/global.css";
import type { Decorator, Preview } from "@storybook/react-vite";
import { useEffect } from "react";
import { UIProvider } from "../src/components/Provider/UIProvider";

/** Theme, brand, density and contrast go on <html>, so portalled overlays follow them too. */
const withTheme: Decorator = (Story, context) => {
  const { theme, brand, density, contrast } = context.globals as Record<string, string>;
  useEffect(() => {
    const html = document.documentElement;
    html.dataset.theme = theme ?? "light";
    html.dataset.brand = brand ?? "ink-saffron";
    html.dataset.density = density ?? "comfortable";
    if (contrast === "more") html.dataset.contrast = "more";
    else delete html.dataset.contrast;
  }, [theme, brand, density, contrast]);
  return (
    <UIProvider>
      <Story />
    </UIProvider>
  );
};

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: "Theme",
      toolbar: {
        title: "Theme",
        icon: "mirror",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
          { value: "system", title: "System" },
        ],
        dynamicTitle: true,
      },
    },
    brand: {
      description: "Brand direction",
      toolbar: {
        title: "Brand",
        icon: "paintbrush",
        items: [
          { value: "ink-saffron", title: "A · Ink & Saffron" },
          { value: "graphite-electric", title: "B · Graphite & Electric" },
          { value: "forest-paper", title: "C · Forest & Paper" },
        ],
        dynamicTitle: true,
      },
    },
    density: {
      description: "Density",
      toolbar: {
        title: "Density",
        icon: "component",
        items: [
          { value: "comfortable", title: "Comfortable" },
          { value: "compact", title: "Compact" },
        ],
        dynamicTitle: true,
      },
    },
    contrast: {
      description: "Contrast",
      toolbar: {
        title: "Contrast",
        icon: "contrast",
        items: [
          { value: "normal", title: "Normal contrast" },
          { value: "more", title: "High contrast" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: "light",
    brand: "ink-saffron",
    density: "comfortable",
    contrast: "normal",
  },
  parameters: {
    layout: "padded",
    backgrounds: { disable: true },
    a11y: { test: "error" },
    controls: { expanded: true },
  },
};

export default preview;
