// Configuración de marca — edita SOLO este archivo (y los campos "name"/
// "short_name"/"theme_color" de manifest.json) para reutilizar el sistema
// con otro nombre, logo o colores en cada cliente, sin tocar el resto del
// código.
const BRAND = {
    appName: "Bloom Salón",
    scriptWord: "Cloud",
    tagline: "SISTEMA TPV PARA SALONES",
    slogan: "Tu salón, tu negocio, en perfectas manos.",
    quote: '"Confía en el proceso y<br>disfruta el resultado ♡"',
    closing: "Todo lo que tu salón necesita, en un solo lugar.",
    logoEmoji: "🌸",
    colorPrimary: "#E91E63",
    colorPrimaryLight: "#FF69B4",
    colorAccent: "#BD1A8D"
};

(function aplicarMarca() {
    document.title = `${BRAND.appName} ${BRAND.scriptWord}`;

    const root = document.documentElement.style;
    root.setProperty('--brand-primary', BRAND.colorPrimary);
    root.setProperty('--brand-primary-light', BRAND.colorPrimaryLight);
    root.setProperty('--brand-accent', BRAND.colorAccent);

    const metaTheme = document.getElementById('meta-theme-color');
    if (metaTheme) metaTheme.setAttribute('content', BRAND.colorAccent);

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('.js-brand-logo-icon').forEach(el => el.textContent = BRAND.logoEmoji);
        document.querySelectorAll('.js-brand-name').forEach(el => el.textContent = BRAND.appName);
        document.querySelectorAll('.js-brand-script').forEach(el => el.textContent = BRAND.scriptWord);
        document.querySelectorAll('.js-brand-tagline').forEach(el => el.textContent = `✿ ${BRAND.tagline} ✿`);
        document.querySelectorAll('.js-brand-slogan').forEach(el => el.textContent = BRAND.slogan);
        document.querySelectorAll('.js-brand-quote').forEach(el => el.innerHTML = BRAND.quote);
        document.querySelectorAll('.js-brand-closing').forEach(el => el.textContent = `♡ ${BRAND.closing} ♡`);

        const gradStart = document.getElementById('brand-grad-start');
        const gradEnd = document.getElementById('brand-grad-end');
        if (gradStart) gradStart.setAttribute('stop-color', BRAND.colorPrimaryLight);
        if (gradEnd) gradEnd.setAttribute('stop-color', BRAND.colorPrimary);

        const headerName = document.getElementById('header-salon-name');
        if (headerName && headerName.textContent.trim() === 'Bloom Salón') {
            headerName.textContent = BRAND.appName;
        }
    });
})();
