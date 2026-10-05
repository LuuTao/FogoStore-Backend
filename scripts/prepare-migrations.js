require('dotenv/config');

const path = require('path');
const { execFileSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const migrations = [
  {
    name: '20260907092934_init_db',
    requirements: [
      ['table', 'Category'],
      ['table', 'Series'],
      ['table', 'Product'],
      ['table', 'ProductVariant'],
      ['table', 'Order'],
      ['table', 'OrderItem'],
    ],
  },
  {
    name: '20260928120000_add_variant_size_version',
    requirements: [
      ['column', 'ProductVariant', 'size'],
      ['column', 'ProductVariant', 'version'],
    ],
  },
  {
    name: '20260929140000_add_post_related_products',
    requirements: [['column', 'Post', 'relatedProductIds']],
  },
  {
    name: '20260929150000_add_product_faq',
    requirements: [['table', 'ProductFaq']],
  },
  {
    name: '20260929170000_add_flash_sale_config',
    requirements: [['table', 'FlashSaleConfig']],
  },
  {
    name: '20260929193000_add_variant_flash_sale_and_home_layout',
    requirements: [
      ['column', 'ProductVariant', 'isFlashSale'],
      ['table', 'HomeLayout'],
    ],
  },
  {
    name: '20260929213000_add_stock_reservations_and_audit_logs',
    requirements: [
      ['column', 'Order', 'stockReservationStatus'],
      ['column', 'Order', 'stockReservedUntil'],
      ['column', 'Order', 'stockReleasedAt'],
      ['table', 'AuditLog'],
    ],
  },
  {
    name: '20261004120000_add_order_access_token',
    requirements: [['column', 'Order', 'accessTokenHash']],
  },
  {
    name: '20261004153000_add_auth_sessions',
    requirements: [
      ['table', 'AuthSession'],
      ['column', 'AuthSession', 'refreshTokenHash'],
      ['column', 'AuthSession', 'expiresAt'],
      ['column', 'AuthSession', 'revokedAt'],
    ],
  },
];

const requirementKey = (requirement) => {
  if (requirement[0] === 'table') return `table:${requirement[1]}`;
  return `column:${requirement[1]}.${requirement[2]}`;
};

async function readSchemaMarkers() {
  const tables = await prisma.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
  );
  const columns = await prisma.$queryRawUnsafe(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`
  );

  return new Set([
    ...tables.map((row) => `table:${row.table_name}`),
    ...columns.map((row) => `column:${row.table_name}.${row.column_name}`),
  ]);
}

async function migrationHistoryCount(markers) {
  if (!markers.has('table:_prisma_migrations')) return 0;
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`
  );
  return Number(rows[0]?.count || 0);
}

function markApplied(migrationName) {
  const prismaCli = path.join(__dirname, '..', 'node_modules', 'prisma', 'build', 'index.js');
  execFileSync(
    process.execPath,
    [prismaCli, 'migrate', 'resolve', '--applied', migrationName],
    { stdio: 'inherit', env: process.env }
  );
}

async function main() {
  const markers = await readSchemaMarkers();
  const historyCount = await migrationHistoryCount(markers);

  if (historyCount > 0) {
    console.log(`✅ Prisma migration history đã tồn tại (${historyCount} bản ghi). Bỏ qua baseline.`);
    return;
  }

  const hasApplicationTables = migrations[0].requirements.some((item) => markers.has(requirementKey(item)));
  if (!hasApplicationTables) {
    console.log('✅ Database đang trống. Prisma migrate deploy sẽ khởi tạo schema từ đầu.');
    return;
  }

  console.log('ℹ️ Phát hiện database có schema nhưng chưa có lịch sử migration. Bắt đầu baseline an toàn...');

  for (const migration of migrations) {
    const found = migration.requirements.filter((item) => markers.has(requirementKey(item)));
    if (found.length === 0) {
      console.log(`↪ ${migration.name}: chưa có schema, sẽ để migrate deploy áp dụng.`);
      continue;
    }
    if (found.length !== migration.requirements.length) {
      const missing = migration.requirements
        .filter((item) => !markers.has(requirementKey(item)))
        .map(requirementKey)
        .join(', ');
      throw new Error(
        `Database chỉ có một phần của migration ${migration.name}. Thiếu: ${missing}. ` +
          'Dừng deploy để tránh ghi đè hoặc mất dữ liệu.'
      );
    }

    console.log(`→ Baseline migration đã có sẵn: ${migration.name}`);
    markApplied(migration.name);
  }

  console.log('✅ Baseline hoàn tất. Prisma migrate deploy sẽ chỉ chạy các migration còn thiếu.');
}

main()
  .catch((error) => {
    console.error('❌ Không thể chuẩn bị migration:', error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
