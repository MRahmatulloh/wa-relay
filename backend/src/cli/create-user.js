import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { User } from '../models/User.js';

function usage() {
  console.log(`Usage:
  npm run user:create -- <username> <password>

Examples:
  npm run user:create -- admin secret123
  docker compose exec backend npm run user:create -- admin secret123`);
}

async function main() {
  const username = String(process.argv[2] || '')
    .trim()
    .toLowerCase();
  const password = String(process.argv[3] || '');

  if (!username || !password) {
    usage();
    process.exit(1);
  }
  if (username.length < 3 || password.length < 6) {
    console.error('Error: username min 3 chars, password min 6 chars');
    process.exit(1);
  }

  await mongoose.connect(config.mongoUri);
  try {
    const existing = await User.findOne({ username });
    if (existing) {
      console.error(`Error: username "${username}" already taken`);
      process.exit(1);
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, passwordHash });
    console.log(`Created user: ${user.username} (id=${user._id})`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
