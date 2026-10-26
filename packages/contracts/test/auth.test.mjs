import { test } from 'node:test';
import assert from 'node:assert/strict';
import contracts from '../dist/index.js';

const {
  AuthCredentialsSchema,
  AuthPhoneSchema,
  AuthPasswordSchema,
  AuthUserSchema,
} = contracts;

test('RU phone representations share one canonical identity without accepting other countries or ambiguous strings', () => {
  for (const phone of [
    '+79991234567',
    '+7 999 123-45-67',
    '8 (999) 123-45-67',
    '+7 (999) 123 45 67',
  ]) {
    assert.equal(AuthPhoneSchema.parse(phone), '+79991234567');
  }
  for (const phone of [
    '79991234567',
    '+18005551234',
    '+7x9991234567',
    '8 ))999(( 1234567',
    ['+79991234567'],
  ]) {
    assert.equal(AuthPhoneSchema.safeParse(phone).success, false);
  }
});

test('password preserves spaces and enforces Unicode and byte boundaries; client cannot set a role', () => {
  const password = '  preserve these spaces  ';
  assert.equal(
    AuthCredentialsSchema.parse({ phone: '+79991234567', password }).password,
    password,
  );
  for (const password of [
    'x'.repeat(14),
    'x'.repeat(129),
    '\ud800'.repeat(15),
  ]) {
    assert.equal(AuthPasswordSchema.safeParse(password).success, false);
  }
  assert.equal(AuthPasswordSchema.safeParse('🚗'.repeat(128)).success, true);
  assert.equal(AuthPasswordSchema.safeParse('x'.repeat(15)).success, true);
  for (const extra of [
    { role: 'admin' },
    { commercialAccessStatus: 'approved' },
    { managerId: '11111111-1111-4111-8111-111111111111' },
    { phoneVerified: true },
    { customerType: 'business' },
  ]) {
    assert.equal(
      AuthCredentialsSchema.safeParse({
        phone: '+79991234567',
        password,
        ...extra,
      }).success,
      false,
    );
  }
  assert.equal(
    AuthUserSchema.safeParse({
      id: '11111111-1111-4111-8111-111111111111',
      phone: '+79991234567',
      role: 'admin',
      phoneVerified: true,
    }).success,
    false,
  );
});

test('commercial access is explicit and independent of phone verification or staff role', () => {
  const base = {
    id: '11111111-1111-4111-8111-111111111111',
    phone: '+79991234567',
    role: 'customer',
    phoneVerified: false,
  };
  for (const commercialAccessStatus of [
    'pending',
    'approved',
    'rejected',
    'revoked',
  ]) {
    assert.equal(
      AuthUserSchema.parse({ ...base, commercialAccessStatus })
        .commercialAccessStatus,
      commercialAccessStatus,
    );
  }
  assert.equal(AuthUserSchema.safeParse(base).success, false);
  assert.equal(
    AuthUserSchema.safeParse({ ...base, commercialAccessStatus: 'unknown' })
      .success,
    false,
  );
  assert.equal(
    AuthUserSchema.parse({
      ...base,
      role: 'manager',
      commercialAccessStatus: 'pending',
    }).commercialAccessStatus,
    'pending',
  );
});
