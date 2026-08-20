import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './style.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('missing #root element');
}
createRoot(rootElement).render(
    <StrictMode>
        <App />
    </StrictMode>,
);

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch((err: unknown) => {
            if (err instanceof Error) {
                console.error('service worker registration failed:', err.message);
            }
        });
    });
}
