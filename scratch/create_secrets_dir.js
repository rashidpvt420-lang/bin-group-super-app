const fs = require('fs');
const path = 'C:\\Users\\My-PC\\secrets';
if (!fs.existsSync(path)) {
    fs.mkdirSync(path, { recursive: true });
    console.log(`Directory created: ${path}`);
} else {
    console.log(`Directory already exists: ${path}`);
}
