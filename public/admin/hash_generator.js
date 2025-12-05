// hash_generator.js
import bcrypt from 'bcrypt';

// --- IMPORTANT: CHANGE THIS TO YOUR DESIRED PLAIN-TEXT PASSWORD ---
const passwordToHash = "SecureP@ss2025"; 
const saltRounds = 10; 

async function generateHash() {
    try {
        const hash = await bcrypt.hash(passwordToHash, saltRounds);
        console.log("-----------------------------------------");
        console.log(`Plain-Text: ${passwordToHash}`);
        console.log(`Bcrypt Hash: ${hash}`);
        console.log("-----------------------------------------");
    } catch (error) {
        console.error("Error generating hash:", error);
    }
}

generateHash();