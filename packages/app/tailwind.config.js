/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        sidebar: {
          light: "#f3f4f6",
          dark: "#1f2937",
        },
        editor: {
          light: "#ffffff",
          dark: "#111827",
        },
        response: {
          light: "#f9fafb",
          dark: "#0f172a",
        },
      },
    },
  },
  plugins: [],
};
