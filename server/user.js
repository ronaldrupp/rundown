import { randomBytes } from 'node:crypto'
import { addUser } from './db.js'

// npm run user add <email>: creates a director account with a random password and prints it once
const [cmd, email] = process.argv.slice(2)
if (cmd !== 'add' || !email?.includes('@')) {
  console.error('usage: npm run user add <email>')
  process.exit(1)
}
const password = randomBytes(9).toString('base64url')
try { addUser(email, password) } catch (e) { console.error(e.message.includes('UNIQUE') ? `${email} already has an account` : e.message); process.exit(1) }
console.log(`Created ${email}\nPassword: ${password}`)
