window.setTimeout(() => {
    const root = document.getElementById('root');
    if (root && root.textContent?.includes('AUTHENTICATING SOVEREIGN IDENTITY')) {
        console.error('FATAL: Admin Terminal Initialization timed out at the HTML layer.');
        root.innerHTML = `
            <div style="height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #020617; color: #ff4444; padding: 20px; text-align: center; font-family: sans-serif;">
                <h1 style="font-weight: 900; letter-spacing: 4px;">ADMIN_INITIALIZATION_ERROR</h1>
                <p style="color: #fff; opacity: 0.8; max-width: 600px;">The secure bundle failed to execute. Check your internet connection or browse from a supported UAE institutional proxy.</p>
                <button onclick="window.location.reload()" style="background: #DAA520; color: #000; border: none; padding: 12px 24px; font-weight: 900; cursor: pointer; border-radius: 4px;">RELOAD SYSTEM</button>
            </div>
        `;
    }
}, 15000);
