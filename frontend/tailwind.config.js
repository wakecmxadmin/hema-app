/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    // ─── Spacing: escala base de 4px (múltiplos de 8 nos valores pares) ───
    // 1=4px | 2=8px | 3=12px | 4=16px | 6=24px | 8=32px | 12=48px | 16=64px
    spacing: {
      px: "1px",
      0: "0px",
      0.5: "2px",
      1: "4px",
      2: "8px",
      3: "12px",
      4: "16px",
      5: "20px",
      6: "24px",
      7: "28px",
      8: "32px",
      9: "36px",
      10: "40px",
      11: "44px",
      12: "48px",
      14: "56px",
      16: "64px",
      20: "80px",
      24: "96px",
      32: "128px",
    },

    // ─── Font Sizes ──────────────────────────────────────────────────────
    fontSize: {
      xs: ["12px", { lineHeight: "16px" }],
      sm: ["14px", { lineHeight: "20px" }],
      base: ["16px", { lineHeight: "24px" }],
      lg: ["18px", { lineHeight: "28px" }],
      xl: ["20px", { lineHeight: "28px" }],
      "2xl": ["24px", { lineHeight: "32px" }],
      "3xl": ["28px", { lineHeight: "36px" }],
    },

    extend: {
      // ─── Brand Colors ──────────────────────────────────────────────────
      colors: {
        // Cor primária — vermelho claro Hema Cereais
        brand: {
          DEFAULT: "#D91A21", // vermelho principal
          light: "#FEECED", // fundo sutil (badges, cards selecionados)
          dark: "#B5151B",  // pressed / active states
          on: "#FFFFFF",    // texto/ícone sobre fundo brand
        },

        // Fundos warm neutrals
        cream: {
          DEFAULT: "#FAF6F0", // fundo primário warm
          deep: "#F2ECE2",    // variação para blocos de seção
        },

        // Fundos e superfícies
        surface: {
          DEFAULT: "#FFFFFF", // fundo geral e cards
          secondary: "#F5F5F5", // fundo de telas alternativas
        },

        // Tinta warm (substitui cinzas frios)
        ink: {
          DEFAULT: "#1A1613", // título / texto primário warm
          mid: "#5C544C",     // texto secundário warm
          soft: "#8A8079",    // texto terciário / ícones inativos
        },

        // Divisores warm
        line: {
          DEFAULT: "#EAE3D7", // divisor principal
          soft: "#F2EBDF",    // divisor sutil
        },

        // Acento âmbar
        amber: {
          DEFAULT: "#C97B1F", // kickers e tags
          soft: "#FAEFD9",    // tint para badges
        },

        // Textos (mantidos para compatibilidade)
        "text-primary": "#1A1613",
        "text-secondary": "#5C544C",

        // Escala de cinzas (bordas, fundos secundários, divisores)
        neutral: {
          100: "#F5F5F5",
          200: "#E0E0E0",
          300: "#C2C2C2",
        },

        // Alertas e avaliações
        warning: "#FFD700",

        // Estados semânticos
        success: "#1F8A4C",
        "success-soft": "#E6F2EA",
        error: "#DC3545",
      },

      // ─── Tipografia ────────────────────────────────────────────────────
      fontFamily: {
        sans: ["Inter_400Regular", "System"],
        "sans-medium": ["Inter_500Medium", "System"],
        "sans-semibold": ["Inter_600SemiBold", "System"],
        "sans-bold": ["Inter_700Bold", "System"],
        "sans-extrabold": ["Inter_800ExtraBold", "System"],
      },

      // ─── Border Radius ────────────────────────────────────────────────
      borderRadius: {
        sm: "4px",   // micro elementos, badges
        btn: "12px", // botões e inputs
        card: "20px", // cards de produto e containers
        lg: "28px",  // header curves
      },
    },
  },
  plugins: [],
};
