const fs = require('fs');
const path = require('path');

function copyFolderSync(from, to) {
    fs.mkdirSync(to);
    fs.readdirSync(from).forEach(element => {
        if (fs.lstatSync(path.join(from, element)).isFile()) {
            if (element !== 'node_modules') {
                fs.copyFileSync(path.join(from, element), path.join(to, element));
            }
        } else {
            if (element !== 'node_modules' && element !== 'dist') {
                copyFolderSync(path.join(from, element), path.join(to, element));
            }
        }
    });
}

try {
    copyFolderSync('c:\\Users\\My-PC\\Desktop\\bin app\\owner-portal', 'c:\\Users\\My-PC\\Desktop\\bin app\\broker-portal');
    console.log("Success");
} catch (e) {
    console.log(e);
}
