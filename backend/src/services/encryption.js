const crypto = require("crypto");

/**
 * Utility for End-to-End Encryption of sensitive UAE data 
 * (Emirates ID, Smart Cheque Vault).
 */
const ALGORITHM = "aes-256-cbc";
const KEY = crypto.randomBytes(32); // In production, load from secure env
const IV = crypto.randomBytes(16);

function encrypt(text) {
    let cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(KEY), IV);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return { iv: IV.toString("hex"), encryptedData: encrypted.toString("hex") };
}

function decrypt(text) {
    let iv = Buffer.from(text.iv, "hex");
    let encryptedData = Buffer.from(text.encryptedData, "hex");
    let decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(KEY), iv);
    let decrypted = decipher.update(encryptedData);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

module.exports = { encrypt, decrypt };
