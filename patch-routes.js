const fs = require('fs');
const path = require('path');

const releasesDir = path.join(__dirname, 'releases');
const portals = ['admin-panel', 'broker-portal', 'owner-portal', 'technician-portal', 'tenant-portal'];

portals.forEach(portal => {
    const indexPath = path.join(releasesDir, portal, 'index.html');
    if (fs.existsSync(indexPath)) {
        let content = fs.readFileSync(indexPath, 'utf8');

        // Replace absolute paths with relative paths
        content = content.replace(/href="\/assets\//g, 'href="./assets/');
        content = content.replace(/src="\/assets\//g, 'src="./assets/');
        content = content.replace(/href="\/static\//g, 'href="./static/');
        content = content.replace(/src="\/static\//g, 'src="./static/');
        content = content.replace(/href="\/vite.svg"/g, 'href="./vite.svg"');

        fs.writeFileSync(indexPath, content);
        console.log(`Patched ${portal}/index.html`);
    }
});
