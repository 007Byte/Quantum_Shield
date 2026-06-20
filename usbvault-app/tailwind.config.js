/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // USBVault brand colors — synced with src/theme/colors.ts
        vault: {
          bg: {
            primary: '#0F0B1E',
            secondary: '#1A1530',
            tertiary: '#251D40',
            input: '#130F24',
            hover: '#2D2645',
          },
          accent: {
            primary: '#7C3AED',
            'primary-hover': '#8B5CF6',
            'primary-pressed': '#6D28D9',
            secondary: '#EC4899',
            'secondary-hover': '#F472B6',
            tertiary: '#06B6D4',
          },
          text: {
            primary: '#FFFFFF',
            secondary: '#B7B2D9',
            muted: '#8893A7',
          },
          border: {
            DEFAULT: '#2D2645',
            light: '#3D3551',
            accent: '#3D2C5E',
            focus: '#7C3AED',
          },
          status: {
            success: '#10B981',
            warning: '#F59E0B',
            danger: '#EF4444',
          },
        },
      },
    },
  },
  plugins: [],
};
