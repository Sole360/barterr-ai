/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        barterr: {
          green: {
            1: "#33FF99",
            2: "#33E7A8",
          },
          cyan: "#33C9BC",
          blue: {
            1: "#33C9BC",
            2: "#3366FF",
          },
        },
      },
      fontFamily: {
        sans: ["Karla", "system-ui", "-apple-system", "sans-serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
