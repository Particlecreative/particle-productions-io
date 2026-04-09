/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'particle-title': ['Sofia Sans Extra Condensed', 'sans-serif'],
        'particle-secondary': ['Sofia Sans', 'sans-serif'],
        'particle-body': ['Neue Haas Grotesk', 'Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
        'blurr-title': ['Avenir Next Condensed', 'AvenirNextCondensed', 'Impact', 'sans-serif'],
        'blurr-secondary': ['Proxima Nova ExtraBold', 'ProximaNova', 'Arial Black', 'sans-serif'],
        'blurr-body': ['Avenir', 'AvenirLT', 'Helvetica Neue', 'Arial', 'sans-serif'],
        'biomella-title': ['Epilogue', 'Inter', 'sans-serif'],
        'biomella-secondary': ['Epilogue', 'Inter', 'sans-serif'],
        'biomella-body': ['Epilogue', 'Inter', 'sans-serif'],
      },
      colors: {
        particle: {
          bg: '#b7b7b7',
          primary: '#030b2e',
          secondary: '#0808f8',
          accent: '#0808f8',
          text: '#000000',
        },
        blurr: {
          bg: '#F5F5F5',
          primary: '#B842A9',
          secondary: '#862F7B',
          cta1: '#B842A9',
          cta2: '#F86EE6',
          text: '#000000',
        },
      },
      keyframes: {
        slideInRight: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        progressGrow: {
          '0%': { width: '0%' },
        },
      },
      animation: {
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'progress-grow': 'progressGrow 0.8s ease-out',
      },
    },
  },
  plugins: [],
}
