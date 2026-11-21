import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  WORK1_13_HEADERS,
  WORK1_SYNTHETIC_ROWS,
  CRD_WORK1_9_BACKUP_FOLDERS,
  buildWork1Csv,
  toGlassFolderFiles,
} from '../src/services/work1BackupService';

function runWork1CloudflarePrepTests() {
  console.log('===============================================================');
  console.log('🧪 WORK 1 13-Col, Drive Backup & Cloudflare Pages Prep Test');
  console.log('===============================================================\n');

  // 1. WORK 1 13-Column Contract
  const expectedHeaders = [
    'ลำดับ',
    'เลขที่สมาชิก',
    'ชื่อสมาชิก',
    'สถานะ',
    'สัญญาเลขที่',
    'จำนวนเงินกู้',
    'เงินต้นคงเหลือ',
    'ค่าปรับ',
    'ผิดนัดรวมทั้งสัญญา',
    'หุ้นรวม',
    'เงินฝาก',
    'สังกัด',
    'ชำระล่าสุด',
  ];
  assert.equal(WORK1_13_HEADERS.length, 13, 'WORK1_13_HEADERS must have exactly 13 columns');
  assert.deepEqual([...WORK1_13_HEADERS], expectedHeaders);
  console.log('✅ Test 1: WORK1_13_HEADERS matches exact 13-column schema');

  // 2. Zero-PII & 5-digit leading-zero Mem_ID + CSV export
  assert.ok(WORK1_SYNTHETIC_ROWS.length >= 4, 'Must include synthetic rows covering 4.1 & 4.2');
  for (const row of WORK1_SYNTHETIC_ROWS) {
    assert.match(row.memberId, /^\d{5}$/, `Mem_ID ${row.memberId} must preserve 5 digits`);
    assert.ok(row.memberName.includes('DEMO'), `Row ${row.memberId} must be marked synthetic DEMO`);
  }

  const csv = buildWork1Csv(WORK1_SYNTHETIC_ROWS);
  assert.ok(csv.startsWith('\uFEFF'), 'CSV must include UTF-8 BOM for Thai Excel');
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines.length, 1 + WORK1_SYNTHETIC_ROWS.length);
  assert.equal(lines[0].split(',').length, 13, 'Header line must have 13 columns');
  assert.ok(lines[4].includes('ระดับสมาชิก-ไม่รวมซ้ำ'), 'Second contract of same member must annotate member-level field');

  // Formula injection test
  const injectedCsv = buildWork1Csv([
    {
      ...WORK1_SYNTHETIC_ROWS[0],
      memberName: '=CMD("calc")',
      affiliation: '+SUM(1,2)',
    },
  ]);
  assert.ok(injectedCsv.includes("'=CMD"), 'Formula starting with = must be prefixed with single quote');
  assert.ok(injectedCsv.includes("'+SUM"), 'Formula starting with + must be prefixed with single quote');
  console.log('✅ Test 2: CSV export, UTF-8 BOM, Zero-PII, and formula-injection defense passed');

  // 3. CRD_WORK1_9_BACKUP GlassFolder coverage (WORK 1-9)
  assert.equal(CRD_WORK1_9_BACKUP_FOLDERS.length, 3);
  const allBackupFiles = CRD_WORK1_9_BACKUP_FOLDERS.flatMap((g) => g.files);
  assert.equal(allBackupFiles.length, 9, 'Must cover WORK 1-9 (9 backup files)');
  for (const group of CRD_WORK1_9_BACKUP_FOLDERS) {
    const folderFiles = toGlassFolderFiles(group.files);
    assert.equal(folderFiles.length, group.files.length);
    for (const f of folderFiles) {
      assert.ok(f.name && f.art, 'FolderFile must have name and ArtPreset');
    }
  }
  console.log('✅ Test 3: CRD_WORK1_9_BACKUP covers WORK 1-9 for 3D GlassFolder');

  // 4. Cloudflare Pages dist/ & SPA fallback & Zero-Secrets verification
  const rootDir = path.resolve(import.meta.dirname, '..');
  const distIndexPath = path.join(rootDir, 'dist', 'index.html');
  const distRedirectsPath = path.join(rootDir, 'dist', '_redirects');

  assert.ok(fs.existsSync(distIndexPath), 'dist/index.html must exist after npm run build');
  assert.ok(fs.existsSync(distRedirectsPath), 'dist/_redirects must exist after npm run build');

  const redirectsContent = fs.readFileSync(distRedirectsPath, 'utf8').trim();
  assert.equal(redirectsContent, '/* /index.html 200', 'Cloudflare Pages SPA fallback rule must match');

  const distHtml = fs.readFileSync(distIndexPath, 'utf8');
  const forbiddenPatterns: Array<[string, RegExp]> = [
    ['GEMINI_API_KEY', /GEMINI_API_KEY/],
    ['CRD_GATEWAY_TOKEN', /CRD_GATEWAY_TOKEN/],
    ['crd_gateway_token_2026', /crd_gateway_token_2026/],
    ['SC4MSG', /SC4MSG/],
    ['Google API key prefix AIza', /AIza[0-9A-Za-z_-]{10,}/],
    ['GitHub token prefix ghp_/gho_', /gh[po]_[0-9A-Za-z]{10,}/],
    ['no-cors fetch mode', /["']no-cors["']/],
  ];

  for (const [label, regex] of forbiddenPatterns) {
    assert.ok(!regex.test(distHtml), `dist/index.html must NOT contain ${label}`);
  }
  console.log('✅ Test 4: dist/index.html, dist/_redirects SPA fallback, and Zero-Secrets scan passed');

  console.log('\n🎉 ALL WORK 1 & CLOUDFLARE PAGES PREP TESTS PASSED!');
}

runWork1CloudflarePrepTests();
