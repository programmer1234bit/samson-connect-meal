// theme.js
async function applyThemeFromBackend() {
    try {
        const res = await fetch('/api/settings');
        const settings = await res.json();
        const theme = settings.theme || 'light';

        if(theme === 'dark'){
            document.body.style.background = '#1a1a1a';
            document.body.style.color = 'green';
        } else {
            document.body.style.background = '#f4f4f8';
            document.body.style.color = 'black';
        }

        // Optional: store in localStorage for super fast switching
        localStorage.setItem('theme', theme);

    } catch(err) {
        console.error('❌ Failed to apply theme', err);
    }
}

// Call immediately on every page
applyThemeFromBackend();
