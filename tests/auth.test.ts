import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error — module JS phía server, không có file khai báo kiểu
import * as auth from '../api/_lib/auth.js';

const SECRET = 'test-secret-0123456789abcdef';
const ENV = {
  ACCOUNT_ADMIN_EMAIL: 'boss@lc.com', ACCOUNT_ADMIN_PASS: 'envpass1', ACCOUNT_ADMIN_NAME: 'boss',
  VITE_ACCOUNT_MEMBER_EMAIL: 'mem@lc.com', VITE_ACCOUNT_MEMBER_PASS: 'envpass2', // tên cũ vẫn đọc được
  ACCOUNT_CLIENT_EMAIL: 'khach@lc.com', // không có mật khẩu → không đăng nhập được
};

describe('mật khẩu', () => {
  test('hash rồi verify đúng / sai', () => {
    const h = auth.hashPassword('abc123');
    assert.ok(auth.isHashed(h));
    assert.notEqual(h, auth.hashPassword('abc123'), 'salt ngẫu nhiên');
    assert.equal(auth.verifyPassword('abc123', h), true);
    assert.equal(auth.verifyPassword('abc124', h), false);
  });
  test('plain text cũ vẫn verify được; rỗng luôn sai', () => {
    assert.equal(auth.verifyPassword('old', 'old'), true);
    assert.equal(auth.verifyPassword('', ''), false);
    assert.equal(auth.verifyPassword('x', undefined), false);
  });
});

describe('token phiên', () => {
  test('ký / xác minh / sai chữ ký / hết hạn', () => {
    const now = 1_000_000;
    const t = auth.createSessionToken('M1', SECRET, now);
    assert.equal(auth.verifyToken(t, SECRET, now + 10).sub, 'M1');
    assert.equal(auth.verifyToken(t, 'other-secret-xxxxxxxx', now), null);
    const [body] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'M_MANAGER', exp: now + 999 })).toString('base64url');
    assert.equal(auth.verifyToken(`${forged}.${t.split('.')[1]}`, SECRET, now), null, 'đổi payload → sai chữ ký');
    assert.ok(body);
    assert.equal(auth.verifyToken(t, SECRET, now + auth.SESSION_TTL_SEC + 1), null);
  });
  test('cookie HttpOnly, Secure trừ localhost', () => {
    const c = auth.sessionCookie('tok', { headers: { host: 'app.vercel.app' } });
    assert.match(c, /HttpOnly/);
    assert.match(c, /Secure/);
    assert.doesNotMatch(auth.sessionCookie('tok', { headers: { host: 'localhost:3000' } }), /Secure/);
    assert.equal(auth.parseCookies('a=1; hcms_session=x.y').hcms_session, 'x.y');
  });
});

describe('checkLogin', () => {
  const hashed = auth.hashPassword('pw-db-1');
  const accounts = [
    { memberId: 'M1', email: 'An@lc.com', password: hashed, active: true },
    { memberId: 'M2', email: 'old@lc.com', password: 'plain-old', active: true },
    { memberId: 'M3', email: 'off@lc.com', password: hashed, active: false },
  ];

  test('tài khoản DB: email không phân biệt hoa thường', () => {
    const r = auth.checkLogin({ email: 'an@LC.com', password: 'pw-db-1', accounts, env: ENV });
    assert.equal(r.ok, true);
    assert.equal(r.memberId, 'M1');
    assert.equal(r.accounts, undefined, 'đã hash → không cần ghi lại');
  });
  test('sai mật khẩu / không tồn tại → cùng thông báo', () => {
    const a = auth.checkLogin({ email: 'an@lc.com', password: 'x', accounts, env: ENV });
    const b = auth.checkLogin({ email: 'nobody@lc.com', password: 'x', accounts, env: ENV });
    assert.equal(a.ok, false);
    assert.equal(a.error, b.error);
  });
  test('plain text cũ → đăng nhập được và được hash lại', () => {
    const r = auth.checkLogin({ email: 'old@lc.com', password: 'plain-old', accounts, env: ENV });
    assert.equal(r.ok, true);
    const rec = r.accounts.find((a: { memberId: string }) => a.memberId === 'M2');
    assert.ok(auth.isHashed(rec.password));
    assert.equal(auth.verifyPassword('plain-old', rec.password), true);
  });
  test('tài khoản bị khoá → từ chối', () => {
    assert.equal(auth.checkLogin({ email: 'off@lc.com', password: 'pw-db-1', accounts, env: ENV }).ok, false);
  });
  test('tài khoản env lần đầu → tạo bản ghi đã hash', () => {
    const r = auth.checkLogin({ email: 'boss@lc.com', password: 'envpass1', accounts: [], env: ENV });
    assert.equal(r.ok, true);
    assert.equal(r.memberId, 'M_MANAGER');
    assert.equal(r.accounts.length, 1);
    assert.ok(auth.isHashed(r.accounts[0].password));
    assert.equal(auth.checkLogin({ email: 'mem@lc.com', password: 'envpass2', accounts: [], env: ENV }).ok, true);
  });
  test('tài khoản env đã đổi mật khẩu → mật khẩu env cũ không còn dùng được', () => {
    const accs = [{ memberId: 'M_MANAGER', email: 'boss@lc.com', password: auth.hashPassword('newpass'), active: true }];
    assert.equal(auth.checkLogin({ email: 'boss@lc.com', password: 'envpass1', accounts: accs, env: ENV }).ok, false);
    assert.equal(auth.checkLogin({ email: 'boss@lc.com', password: 'newpass', accounts: accs, env: ENV }).ok, true);
  });
  test('tài khoản env bị khoá trong DB → không vượt qua bằng mật khẩu env', () => {
    const accs = [{ memberId: 'M_MANAGER', email: 'changed@lc.com', password: auth.hashPassword('x'), active: false }];
    assert.equal(auth.checkLogin({ email: 'boss@lc.com', password: 'envpass1', accounts: accs, env: ENV }).ok, false);
  });
  test('client không cấu hình mật khẩu → đăng nhập không cần mật khẩu như cũ', () => {
    const r = auth.checkLogin({ email: 'khach@lc.com', password: '', accounts: [], env: ENV });
    assert.equal(r.ok, true);
    assert.equal(r.memberId, 'M_CLIENT');
    assert.equal(r.accounts[0].password, '', 'không hash mật khẩu rỗng');
    // Lần sau: đã có bản ghi DB, vẫn vào được
    assert.equal(auth.checkLogin({ email: 'khach@lc.com', password: '', accounts: r.accounts, env: ENV }).ok, true);
    // Manager khoá → không vào được
    const locked = [{ ...r.accounts[0], active: false }];
    assert.equal(auth.checkLogin({ email: 'khach@lc.com', password: '', accounts: locked, env: ENV }).ok, false);
    // Manager đặt mật khẩu riêng → bắt buộc dùng mật khẩu đó
    const withPw = [{ ...r.accounts[0], password: auth.hashPassword('khach1') }];
    assert.equal(auth.checkLogin({ email: 'khach@lc.com', password: '', accounts: withPw, env: ENV }).ok, false);
    assert.equal(auth.checkLogin({ email: 'khach@lc.com', password: 'khach1', accounts: withPw, env: ENV }).ok, true);
  });
  test('client có CLIENT_PASS → bắt buộc mật khẩu', () => {
    const env = { ...ENV, ACCOUNT_CLIENT_PASS: 'cpass' };
    assert.equal(auth.checkLogin({ email: 'khach@lc.com', password: '', accounts: [], env }).ok, false);
    assert.equal(auth.checkLogin({ email: 'khach@lc.com', password: 'cpass', accounts: [], env }).ok, true);
  });
  test('người không phải khách vẫn bắt buộc mật khẩu', () => {
    const accs = [{ memberId: 'M9', email: 'x@lc.com', password: '', active: true }];
    assert.equal(auth.checkLogin({ email: 'x@lc.com', password: '', accounts: accs, env: ENV }).ok, false);
    assert.equal(auth.checkLogin({ email: 'boss@lc.com', password: '', accounts: [], env: ENV }).ok, false);
  });
});

describe('resolveSession', () => {
  const members = [{ id: 'M1', name: 'An', role: 'Leader' }];
  const token = auth.createSessionToken('M1', SECRET);
  test('vai trò lấy từ member mới nhất', () => {
    const s = auth.resolveSession({ token, secret: SECRET, accounts: [{ memberId: 'M1', email: 'a', active: true }], members, env: {} });
    assert.equal(s.role, 'Leader');
    assert.equal(s.user.name, 'An');
  });
  test('account bị khoá / bị xoá → hết phiên ngay', () => {
    assert.equal(auth.resolveSession({ token, secret: SECRET, accounts: [{ memberId: 'M1', active: false }], members, env: {} }), null);
    assert.equal(auth.resolveSession({ token, secret: SECRET, accounts: [], members, env: {} }), null);
  });
  test('member bị xoá và không phải tài khoản env → null', () => {
    assert.equal(auth.resolveSession({ token, secret: SECRET, accounts: [{ memberId: 'M1', active: true }], members: [], env: {} }), null);
  });
});

describe('phân quyền ghi store', () => {
  test('không ai ghi được tài khoản qua /api/store; key lạ bị chặn', () => {
    assert.ok(auth.checkStoreWrite('Manager', 'hcms_accounts', 'overwrite'));
    assert.ok(auth.checkStoreWrite('Manager', 'hcms_current_user', 'delete'));
    assert.ok(auth.checkStoreWrite('Manager', 'evil_key', 'overwrite'));
  });
  test('chỉ Manager xoá cả key / sửa cấu hình', () => {
    assert.equal(auth.checkStoreWrite('Manager', 'hcms_submissions', 'delete'), null);
    assert.ok(auth.checkStoreWrite('Leader', 'hcms_submissions', 'delete'));
    assert.equal(auth.checkStoreWrite('Manager', 'hcms_scale_config', 'overwrite'), null);
    assert.ok(auth.checkStoreWrite('Member', 'hcms_scale_config', 'overwrite'));
    assert.ok(auth.checkStoreWrite('Leader', 'hcms_members', 'update'));
  });
  test('Member/Leader vẫn làm việc bình thường', () => {
    assert.equal(auth.checkStoreWrite('Member', 'hcms_submissions', 'append'), null);
    assert.equal(auth.checkStoreWrite('Leader', 'hcms_kpi_targets', 'update'), null);
    assert.equal(auth.checkStoreWrite('Member', 'hcms_notifications', 'overwrite'), null);
  });
  test('Client chỉ duyệt sản phẩm, thông báo, to-do', () => {
    assert.equal(auth.checkStoreWrite('Client', 'hcms_contents', 'update'), null);
    assert.ok(auth.checkStoreWrite('Client', 'hcms_contents', 'remove'));
    assert.ok(auth.checkStoreWrite('Client', 'hcms_submissions', 'append'));
    assert.equal(auth.checkStoreWrite('Client', 'hcms_todos', 'append'), null);
  });
  test('GET trả tài khoản không kèm mật khẩu', () => {
    const out = auth.sanitizeAccounts([{ memberId: 'M1', email: 'a@b.c', password: 'secret', active: true }]);
    assert.deepEqual(out, [{ memberId: 'M1', email: 'a@b.c', active: true }]);
  });
});

describe('link chia sẻ', () => {
  test('chữ ký đúng loại + tham số', () => {
    const sig = auth.shareSignature('weekly', 'wr_1', SECRET);
    assert.equal(auth.verifyShareSignature('weekly', 'wr_1', sig, SECRET), true);
    assert.equal(auth.verifyShareSignature('weekly', 'wr_2', sig, SECRET), false, 'đổi id → sai');
    assert.equal(auth.verifyShareSignature('periodic', 'wr_1', sig, SECRET), false, 'đổi loại → sai');
    assert.equal(auth.verifyShareSignature('weekly', 'wr_1', '', SECRET), false);
    assert.equal(auth.verifyShareSignature('bogus', 'wr_1', sig, SECRET), false);
  });
});
