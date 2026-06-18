/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './index.html',
        './src/**/*.{js,jsx,ts,tsx}',
    ],
    theme: {
        extend: {
            colors: {
                background: '#0a0a0f',
                foreground: '#e5e5ea',

                card: {
                    DEFAULT: '#15151d',
                    foreground: '#e5e5ea',
                },

                popover: {
                    DEFAULT: '#15151d',
                    foreground: '#e5e5ea',
                },

                primary: {
                    DEFAULT: '#2563eb',
                    foreground: '#0a0a0f',
                },

                secondary: {
                    DEFAULT: '#1a1a24',
                    foreground: '#e5e5ea',
                },

                muted: {
                    DEFAULT: '#1a1a24',
                    foreground: '#8b8b99',
                },

                accent: {
                    DEFAULT: '#7c3aed',
                    foreground: '#e5e5ea',
                },

                destructive: {
                    DEFAULT: '#ef4444',
                    foreground: '#ffffff',
                },

                border: 'rgba(255, 255, 255, 0.08)',
                input: 'transparent',
                ring: '#2563eb',

                sidebar: {
                    DEFAULT: '#0f0f16',
                    foreground: '#e5e5ea',
                    primary: '#2563eb',
                    'primary-foreground': '#0a0a0f',
                    accent: '#1a1a24',
                    'accent-foreground': '#e5e5ea',
                    border: 'rgba(255, 255, 255, 0.08)',
                    ring: '#2563eb',
                },

                chart: {
                    1: '#2563eb',
                    2: '#7c3aed',
                    3: '#ef4444',
                    4: '#fbbf24',
                    5: '#06b6d4',
                },

                success: '#10b981',
                warning: '#fbbf24',
            },

            borderRadius: {
                sm: '6px',
                md: '10px',
                lg: '16px',
                xl: '24px',
            },

            fontFamily: {
                sans: ['Assistant', 'system-ui', 'sans-serif'],
            },
        },
    },
    plugins: [],
};
