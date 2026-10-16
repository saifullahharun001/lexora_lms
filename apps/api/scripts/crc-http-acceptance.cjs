'use strict';
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const { assertFreshDatabase } = require('./crc-fresh-safety.cjs');
const law = 'crc_fixture_law';
const foreign = 'crc_fixture_http_foreign';
const actors = {
  member1: 'crc_fixture_boundary_member1', member2: 'crc_fixture_boundary_member2',
  chairman: 'crc_fixture_boundary_chairman', student: 'crc_fixture_boundary_student',
  admin: 'crc_fixture_operator', foreign: 'crc_fixture_http_foreign_teacher'
};
function safety(env = process.env) {
  assert.equal(env.LEXORA_CRC_HTTP_CONFIRM, 'YES_DISPOSABLE_HTTP_ACCEPTANCE');
  assert.equal(env.DATABASE_URL, env.LEXORA_CRC_FOUNDATION_DATABASE_URL);
  assert.equal(env.DATABASE_DIRECT_URL, env.LEXORA_CRC_FOUNDATION_DATABASE_URL);
  const u = new URL(env.DATABASE_URL);
  assert.equal(u.protocol, 'postgresql:');
  assert.equal(u.hostname, '127.0.0.1');
  assert.match(u.pathname, /^\/crc_[a-f0-9]{32}_test$/);
  assert.equal(u.pathname.slice(1), env.LEXORA_CRC_FOUNDATION_EXPECTED_DATABASE);
  assert.deepEqual([...u.searchParams.keys()], ['schema']);
  assert.equal(u.searchParams.get('schema'), 'public');
  assert.equal(u.hash, '');
  const stage = path.resolve(env.LEXORA_CRC_HTTP_STAGE || '/invalid');
  const root = path.resolve(__dirname, '../../../.crc-runtime');
  assert.equal(path.dirname(stage), root);
  assert.match(path.basename(stage), /^[a-f0-9]{32}$/);
  assert.equal(fs.existsSync(path.join(stage, '.env')), false);
  return stage;
}
function syntheticEnv(url) {
  const secret = () => randomBytes(32).toString('hex');
  Object.assign(process.env, {
    NODE_ENV: 'test', DATABASE_URL: url, DATABASE_DIRECT_URL: url,
    REDIS_URL: 'redis://127.0.0.1:1/15', REDIS_HOST: '127.0.0.1', REDIS_PORT: '1',
    REDIS_PASSWORD: '', REDIS_DB: '15',
    JWT_ACCESS_SECRET: secret(), JWT_REFRESH_SECRET: secret(),
    JWT_ACCESS_TTL: '10m', JWT_REFRESH_TTL: '1d', JWT_ISSUER: 'crc-http-test',
    JWT_AUDIENCE: 'crc-http-test', REFRESH_TOKEN_COOKIE_NAME: 'crc_rt',
    REFRESH_TOKEN_COOKIE_SECURE: 'false', REFRESH_TOKEN_COOKIE_DOMAIN: '',
    SMTP_HOST: '127.0.0.1', SMTP_PORT: '25', SMTP_SECURE: 'false',
    SMTP_USER: '', SMTP_PASSWORD: '', SMTP_FROM_NAME: 'CRC test',
    SMTP_FROM_EMAIL: 'test@crc-fixture.invalid', OTP_ISSUER: 'CRC',
    OTP_DIGITS: '6', OTP_TTL_SECONDS: '300', OTP_RATE_LIMIT_PER_WINDOW: '5',
    TWO_FACTOR_ENCRYPTION_KEY: secret(),
    S3_ENDPOINT: 'http://127.0.0.1:1', S3_REGION: 'us-east-1',
    S3_BUCKET: 'crc-http-test', S3_ACCESS_KEY: 'crc', S3_SECRET_KEY: secret(),
    S3_FORCE_PATH_STYLE: 'true', S3_PUBLIC_BASE_URL: 'http://127.0.0.1:1',
    MALWARE_SCANNER_MODE: 'disabled', MALWARE_SCANNER_TIMEOUT_MS: '1000',
    FILE_MALWARE_SCAN_WORKER_ENABLED: 'false',
    SENTRY_DSN: '', SENTRY_ENVIRONMENT: 'test', SENTRY_TRACES_SAMPLE_RATE: '0',
    WEB_APP_URL: 'http://127.0.0.1:1', API_APP_URL: 'http://127.0.0.1:1',
    PUBLIC_VERIFICATION_URL: 'http://127.0.0.1:1/verify',
    ALLOWED_ORIGINS: 'http://127.0.0.1:1',
    RATE_LIMIT_TTL_SECONDS: '60', RATE_LIMIT_MAX_REQUESTS: '1000',
    AUTH_RATE_LIMIT_TTL_SECONDS: '60', AUTH_RATE_LIMIT_MAX_REQUESTS: '100',
    UNIVERSITY_EMAIL_DOMAINS: '', AUTH_LOCKOUT_FAILURE_THRESHOLD: '5',
    AUTH_LOCKOUT_WINDOW_MINUTES: '15', AUTH_LOCKOUT_DURATION_MINUTES: '15',
  });
}
async function identities(db) {
  const bcrypt = require('bcryptjs');
  assert.equal(await db.formativeFinalResult.count(), 6);
  assert.equal(await db.summativeChairmanApproval.count(), 0);
  assert.equal(await db.courseResultComposition.count(), 0);
  assert.equal(await db.summativeCommitteeMemberReview.count(), 0);
  const permissionIds = [];
  for (const code of [
    'summative-examination.member-review.review_department',
    'summative-examination.chairman-approval.approve_department'
  ]) {
    const p = await db.permission.findUniqueOrThrow({ where: { code } });
    assert.equal(p.scope, 'DEPARTMENT');
    permissionIds.push(p.id);
  }
  // The foreign teacher gets real permission grants but NO law appointment.
  await db.department.create({ data: {
    id: foreign, code: 'CRC_HTTP_FOREIGN', slug: 'crc-http-foreign',
    name: 'Synthetic external test department', status: 'ACTIVE'
  } });
  await db.user.create({ data: { id: actors.foreign, departmentId: foreign,
    email: 'crc-http-foreign@crc-fixture.invalid',
    normalizedEmail: 'crc-http-foreign@crc-fixture.invalid',
    displayName: 'Synthetic foreign teacher', status: 'ACTIVE', passwordHash: null } });
  const role = await db.role.create({ data: {
    departmentId: foreign, code: 'teacher', name: 'Synthetic foreign teacher role'
  } });
  await db.userRole.create({ data: { departmentId: foreign,
    userId: actors.foreign, roleId: role.id } });
  for (const permissionId of permissionIds)
    await db.rolePermission.create({ data: { roleId: role.id, permissionId } });
  const passwords = new Map();
  for (const [name,id] of Object.entries(actors)) {
    const user = await db.user.findUniqueOrThrow({ where: { id } });
    assert.equal(user.departmentId, name === 'foreign' ? foreign : law);
    assert.equal(user.status, 'ACTIVE');
    assert.equal(user.passwordHash, null);
    const password = randomBytes(24).toString('base64url') + 'Aa9!';
    passwords.set(name, password);
    await db.user.update({ where: { id },
      data: { passwordHash: await bcrypt.hash(password, 12) } });
  }
  return passwords;
}
async function appStart() {
  require('reflect-metadata');
  const { Module, ValidationPipe, VersioningType } = require('@nestjs/common');
  const { NestFactory } = require('@nestjs/core');
  const { PlatformModule } = require('../dist/src/platform/platform.module.js');
  const { IdentityAccessModule } = require('../dist/src/modules/identity-access/identity-access.module.js');
  const { SummativeExaminationModule } = require('../dist/src/modules/summative-examination/summative-examination.module.js');
  const { RequestContextInterceptor } = require('../dist/src/common/request-context/request-context.interceptor.js');
  const { ApiExceptionFilter } = require('../dist/src/common/http/api-exception.filter.js');
  class CrcOnlyModule {}
  Module({ imports: [PlatformModule, IdentityAccessModule, SummativeExaminationModule] })(CrcOnlyModule);
  const app = await NestFactory.create(CrcOnlyModule, { logger: false, abortOnError: false });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.use(require('cookie-parser')());
  app.useGlobalInterceptors(app.get(RequestContextInterceptor));
  app.useGlobalFilters(app.get(ApiExceptionFilter));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  const server = app.getHttpServer().address();
  assert.equal(server.address, '127.0.0.1');
  assert.ok(server.port > 0 && server.port !== 4000);
  return [app, `http://127.0.0.1:${server.port}/api/v1`];
}
async function call(base, method, route, token, body, header) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (header) headers['x-department-id'] = header;
  const response = await fetch(base + route, { method, headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000), redirect: 'error' });
  const data = await response.json().catch(() => null);
  return { code: response.status, data };
}
function expect(result, code, name) {
  assert.equal(result.code, code, name + ': unexpected HTTP status');
  console.log(`CRC_HTTP_${name}=PASS`);
  return result.data;
}
function deny(result, name) {
  assert.ok([403, 404].includes(result.code), name + ': unexpected HTTP access');
  console.log(`CRC_HTTP_${name}=PASS`);
}
async function run(db) {
  const stage = safety();
  await assertFreshDatabase(db);
  const passwords = await identities(db);
  await assertFreshDatabase(db);
  const prior = process.cwd();
  let app;
  try {
    // ConfigModule reads '.env' relative to cwd: never read canonical apps/api/.env.
    process.chdir(stage);
    syntheticEnv(process.env.LEXORA_CRC_FOUNDATION_DATABASE_URL);
    safety();
    const [instance, base] = await appStart();
    app = instance;
    const tokens = {};
    for (const [name, userId] of Object.entries(actors)) {
      const departmentCode = name === 'foreign' ? 'CRC_HTTP_FOREIGN' : 'CRC_TEST';
      const email = name === 'foreign' ? 'crc-http-foreign@crc-fixture.invalid'
        : `${userId}@crc-fixture.invalid`;
      const profile = expect(await call(base,'POST','/auth/login',null,
        { departmentCode,email,password:passwords.get(name) }), 201, `LOGIN_${name.toUpperCase()}`);
      assert.equal(profile?.user?.id, userId);
      assert.equal(profile?.user?.departmentId, name === 'foreign' ? foreign : law);
      assert.ok(typeof profile?.accessToken === 'string' && profile.accessToken.length > 20);
      tokens[name] = profile.accessToken;
    }
    const mark = await db.summativeCalculatedMark.findFirstOrThrow({
      where: { examinationId: 'crc_fixture_boundary_exam', departmentId: law } });
    const other = await db.summativeCalculatedMark.findFirstOrThrow({
      where: { examinationId: 'crc_fixture_precision_exam', departmentId: law } });
    const uri = `/summative/calculated-marks/${encodeURIComponent(mark.id)}/committee-workflow`;
    const work = suffix => uri + '/' + suffix;
    expect(await call(base,'GET',work('member-workspace')),401,'ANONYMOUS_DENIAL');
    expect(await call(base,'GET',work('member-workspace'),tokens.student),403,'STUDENT_DENIAL');
    expect(await call(base,'GET',work('chairman-workspace'),tokens.admin),403,'ADMIN_DENIAL');
    expect(await call(base,'GET',work('member-workspace'),tokens.foreign),404,'FOREIGN_DEPARTMENT_NOT_FOUND');
    expect(await call(base,'GET',work('member-workspace'),tokens.foreign,undefined,law),404,'FOREIGN_FORGED_HEADER_DENIAL');
    deny(await call(base,'GET',`/summative/calculated-marks/${encodeURIComponent(other.id)}/committee-workflow/member-workspace`,tokens.member1), 'UNASSIGNED_REAL_OBJECT_DENIAL');
    expect(await call(base,'GET',work('member-workspace'),tokens.member1),200,'AUTHENTICATED_MEMBER_WORKSPACE');
    expect(await call(base,'GET',work('chairman-workspace'),tokens.chairman,undefined,foreign),200,'PRINCIPAL_SCOPE_OVERRIDES_HEADER');
    const first = expect(await call(base,'POST',work('member-reviews'),tokens.member1,{outcome:'VERIFIED'}),201,'MEMBER1_VERIFIED');
    assert.equal(first?.reviewerSeat,'MEMBER_1');
    expect(await call(base,'POST',work('chairman-approval'),tokens.chairman,{confirmFinalLock:true}),409,'PREMATURE_LOCK_DENIAL');
    assert.equal(await db.summativeChairmanApproval.count(),0);
    const second = expect(await call(base,'POST',work('member-reviews'),tokens.member2,{outcome:'VERIFIED'}),201,'MEMBER2_VERIFIED');
    assert.equal(second?.reviewerSeat,'MEMBER_2');
    const approval = expect(await call(base,'POST',work('chairman-approval'),tokens.chairman,{confirmFinalLock:true}),201,'CHAIRMAN_FINAL_LOCK');
    assert.equal(approval?.calculatedMarkId,mark.id);
    const composed = await db.courseResultComposition.findFirstOrThrow({
      where: { departmentId:law, examinationId:'crc_fixture_boundary_exam',
        examinationCourseId:'crc_fixture_boundary_course', enrollmentId:'crc_fixture_boundary_enrollment' } });
    assert.equal(composed.chairmanApprovalId,approval.id);
    assert.equal(composed.calculatedMarkId,mark.id);
    assert.ok(composed.formativeMark.eq(16));
    assert.ok(composed.summativeMark.eq(24));
    assert.ok(composed.totalMark.eq(40));
    assert.deepEqual([composed.formativePassed,composed.summativePassed,composed.coursePassed],[true,true,true]);
    assert.equal(await db.courseResultComposition.count(),1);
    assert.equal(await db.summativeChairmanApproval.count(),1);
    assert.equal(await db.summativeCommitteeMemberReview.count(),2);
    const actions=['summative-examination.chairman-approval.final-lock-completed','course-result.composed'];
    for (const action of actions)
      assert.equal(await db.auditLog.count({where:{action,outcome:'SUCCESS'}}),1);
    console.log('CRC_HTTP_IMMUTABLE_100_AND_AUDITS=PASS');
    const academicSnapshot = async () => JSON.stringify({
      a: await db.summativeChairmanApproval.findMany({orderBy:{id:'asc'}}),
      b: await db.summativeCommitteeMemberReview.findMany({orderBy:{id:'asc'}}),
      c: await db.courseResultComposition.findMany({orderBy:{id:'asc'}}),
      d: await db.auditLog.findMany({where:{action:{in:actions}},orderBy:{id:'asc'}})
    });
    const snapshot=await academicSnapshot();
    expect(await call(base,'POST',work('chairman-approval'),tokens.chairman,{confirmFinalLock:true}),409,'DUPLICATE_FINAL_LOCK_DENIAL');
    const replay=expect(await call(base,'POST',work('member-reviews'),tokens.member1,{outcome:'VERIFIED'}),201,'EXACT_MEMBER_REPLAY');
    assert.equal(replay?.id, first.id);
    expect(await call(base,'POST',work('member-reviews'),tokens.member1,
      {outcome:'VERIFIED',reviewComment:'attempted academic evidence mutation'}),409,'IMMUTABLE_REVIEW_DENIAL');
    assert.equal(await academicSnapshot(),snapshot);
    const binding = await db.userRole.findFirstOrThrow({where:{userId:actors.member1,roleId:'crc_fixture_teacher_role',departmentId:law}});
    assert.equal(binding.revokedAt,null);
    await db.userRole.update({where:{id:binding.id},data:{revokedAt:new Date()}});
    try { expect(await call(base,'GET',work('member-workspace'),tokens.member1),403,'REVOKED_ROLE_DENIAL'); }
    finally { await db.userRole.update({where:{id:binding.id},data:{revokedAt:null}}); }
    assert.equal(await academicSnapshot(),snapshot);
    console.log('CRC_HTTP_PROTECTED_EVIDENCE_STABLE=PASS');
  } finally {
    if (app) await app.close();
    process.chdir(prior);
    passwords.clear();
  }
}
module.exports={safety,run};
