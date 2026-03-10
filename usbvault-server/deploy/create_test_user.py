#!/usr/bin/env python3
"""
Generate SQL to create a test user in the USBVault database.
Uses SRP-6a protocol matching the server's implementation.

Usage:
  python3 create_test_user.py | docker compose exec -T postgres psql -U usbvault -d usbvault
"""
import hashlib
import os
import uuid

email = "test@yahoo.com"
password = "test123"

# SRP-6a parameters from Go server (3072-bit group)
srpN_hex = "FFFFFFFFFFFFFFFFD0C52B70D29606C1E0DB00F6FFF002BACA73E0E3C36C2F0F4BCD4A989A3D3B0E99CC6B7C84ED89A23A76FBB6A1DB6F9E7C4C8C5C9B5E7D4F8C7E3D9B1A5F0E2D4C6B8A9F1D3E5C7B9A1D3F5E7D9C1B3A5F7E9D1C3B5A7C9E1D3F5E7C9B1A3D5F7E9D1C3B5A7C9E1D3F5E7C9B1A3D5F7E9D1C3B5A7C9E1D3F5E7C9B1A3D5F7E9D1C3B5A7C9E1D3F5E7C9B1A3FFFFFFFFFFFFFFFF"
N = int(srpN_hex, 16)
g = 2

# 1. email_hash = SHA256(email)
email_hash = hashlib.sha256(email.encode()).hexdigest()

# 2. Random 32-byte salt
salt = os.urandom(32)

# 3. SRP verifier: x = H(salt | H(email:password)), v = g^x mod N
inner = hashlib.sha256(f"{email}:{password}".encode()).digest()
x = int.from_bytes(hashlib.sha256(salt + inner).digest(), 'big')
v = pow(g, x, N)
verifier_bytes = v.to_bytes((v.bit_length() + 7) // 8, 'big')

# 4. Dummy public key (32 bytes)
pub_key = os.urandom(32)

user_id = str(uuid.uuid4())

# Output SQL matching the ACTUAL schema from 001_initial.sql
sql = f"""INSERT INTO users (id, email_hash, srp_salt, srp_verifier, public_key, role, created_at, updated_at)
VALUES (
  '{user_id}',
  '{email_hash}',
  '\\x{salt.hex()}',
  '\\x{verifier_bytes.hex()}',
  '\\x{pub_key.hex()}',
  'user',
  NOW(),
  NOW()
)
ON CONFLICT (email_hash) DO UPDATE SET
  srp_salt = EXCLUDED.srp_salt,
  srp_verifier = EXCLUDED.srp_verifier,
  updated_at = NOW();"""

print(sql)
