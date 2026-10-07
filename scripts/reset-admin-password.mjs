/**
 * One-off: reset Super Admin password (local/dev).
 * Usage (from apps/api): node ../../scripts/reset-admin-password.mjs [password]
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRequire = createRequire(join(__dirname, '../apps/api/package.json'));
const { PrismaClient } = apiRequire('@prisma/client');
const argon2 = apiRequire('argon2');

const email = (process.env.ADMIN_SUPER_EMAIL || 'admin@example.com').toLowerCase();
const password = process.argv[2] || process.env.ADMIN_SUPER_PASSWORD;
if (!password) {
  console.error('Usage: node scripts/reset-admin-password.mjs <password>');
  console.error('Or set ADMIN_SUPER_PASSWORD in the environment.');
  process.exit(1);
}

const ARGON2_OPTS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

const prisma = new PrismaClient();

async function main() {
  const hash = await argon2.hash(password, ARGON2_OPTS);
  const user = await prisma.user.update({
    where: { email },
    data: { passwordHash: hash, status: 'ACTIVE' },
  });

  const roles = await prisma.userRole.findMany({ where: { userId: user.id } });
  if (roles.length === 0) {
    await prisma.userRole.create({
      data: { userId: user.id, role: 'SUPER_ADMIN' },
    });
    console.log('[reset] Granted SUPER_ADMIN role');
  } else {
    console.log('[reset] Roles:', roles.map((r) => r.role).join(', '));
  }

  const ok = await argon2.verify(hash, password);
  console.log(`[reset] Password updated for ${email}`);
  console.log(`[reset] Verify OK: ${ok}`);
  console.log(`[reset] Use this password on Operations sign-in.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
