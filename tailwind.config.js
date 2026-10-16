/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts,scss}'],
  theme: {
    extend: {
      colors: {
        braDark: '#262626',
        braPurple: '#8a3594',
        braCyan: '#45bced',
        braYellow: '#febf10',
        braMagenta: '#ee4092',
        discord: '#5865F2',
      },
      fontFamily: {
        amaranth: ['Amaranth', 'sans-serif'],
        archivo: ['Archivo', 'sans-serif']
      },
      borderRadius: {
                        'bra': '2rem',
                    }
    }
  },
  plugins: []
};