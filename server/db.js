import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'

// director accounts, login sessions, each director's productions tree (library), its performances (items)
// and the one on air (shows, what camera views get), in one SQLite file
const dir = process.env.DATA_DIR || 'data'
mkdirSync(dir, { recursive: true })
export const db = new DatabaseSync(`${dir}/rundown.db`)
db.exec(`
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, code TEXT UNIQUE NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS shows (user_id INTEGER PRIMARY KEY, json TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS library (user_id INTEGER PRIMARY KEY, json TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS items (user_id INTEGER NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (user_id, id));
`)

const SESSION_DAYS = 30
const sha = s => createHash('sha256').update(s).digest('hex')
const scrypt = (password, salt) => scryptSync(password, salt, 64).toString('hex')
// no 0/O/1/I/L, so codes read out loud over talkback don't get mixed up
const newCode = () => Array.from(randomBytes(6), b => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[b % 31]).join('')

export const userCount = () => db.prepare('SELECT count(*) AS n FROM users').get().n

export function addUser(email, password) {
  const salt = randomBytes(16).toString('hex')
  db.prepare('INSERT INTO users (email, salt, hash, code) VALUES (?, ?, ?, ?)').run(email.trim().toLowerCase(), salt, scrypt(password, salt), newCode())
}

// creates the account or resets its password (dev login, see server/index.js)
export function setUser(email, password) {
  const salt = randomBytes(16).toString('hex')
  db.prepare('INSERT INTO users (email, salt, hash, code) VALUES (?, ?, ?, ?) ON CONFLICT (email) DO UPDATE SET salt = excluded.salt, hash = excluded.hash')
    .run(email, salt, scrypt(password, salt), newCode())
}

export function checkPassword(email, password) {
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).trim().toLowerCase())
  return u && timingSafeEqual(Buffer.from(u.hash, 'hex'), Buffer.from(scrypt(String(password), u.salt), 'hex')) ? u : null
}

// only the token's hash is stored, so a leaked database file holds no usable sessions
export function newSession(userId) {
  const token = randomBytes(32).toString('hex')
  db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(sha(token), userId, Date.now())
  return token
}
export const endSession = token => db.prepare('DELETE FROM sessions WHERE hash = ?').run(sha(String(token)))
export const sessionUser = token => token && db.prepare(
  'SELECT users.* FROM sessions JOIN users ON users.id = user_id WHERE sessions.hash = ? AND created > ?',
).get(sha(token), Date.now() - SESSION_DAYS * 864e5)

export const userByCode = code => db.prepare('SELECT * FROM users WHERE code = ?').get(String(code).trim().toUpperCase())

export const loadShow = userId => db.prepare('SELECT json FROM shows WHERE user_id = ?').get(userId)?.json
export function saveShow(userId, show) {
  const json = JSON.stringify(show)
  db.prepare('INSERT INTO shows VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET json = excluded.json').run(userId, json)
  if (typeof show.item === 'string') saveItem(userId, show)
}
// one performance only, not the account's live rundown
export const saveItem = (userId, show) => db.prepare('INSERT INTO items VALUES (?, ?, ?) ON CONFLICT (user_id, id) DO UPDATE SET json = excluded.json').run(userId, show.item, JSON.stringify(show))
export const loadItem = (userId, id) => db.prepare('SELECT json FROM items WHERE user_id = ? AND id = ?').get(userId, String(id))?.json
export const loadLibrary = userId => db.prepare('SELECT json FROM library WHERE user_id = ?').get(userId)?.json
export function saveLibrary(userId, json) {
  db.prepare('INSERT INTO library VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET json = excluded.json').run(userId, json)
  // performances deleted from the tree go with it
  db.prepare("DELETE FROM items WHERE user_id = ? AND id NOT IN (SELECT value FROM json_tree(?) WHERE key = 'id' AND type = 'text')").run(userId, json)
}
