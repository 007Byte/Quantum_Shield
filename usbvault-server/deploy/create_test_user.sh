#!/bin/bash
# Create a test user in Quantum_Shield database
# Run from the deploy/ directory: ./create_test_user.sh

# This generates an SRP-compatible user and inserts it directly
python3 -c "
import hashlib, os, uuid

email = 'test@yahoo.com'
password = 'test123'

# SRP-6a params matching Go server
srpN_hex = 'FFFFFFFFFFFFFFFFD0C52B70D29606C1E0DB00F6FFF002BACA73E0E3C36C2F0F4BCD4A989A3D3B0E99CC6B7C84ED89A23A76FBB6A1DB6F9E7C4C8C5C9B5E7D4F8C7E3D9B1A5F0E2D4C6B8A9F1D3E5C7B9A1D3F5E7D9C1B3A5F7E9D1C3B5A7C9E1D3F5E7C9B1A3D5F7E9D1C3B5A7C9E1D3F5E7C9B1A3D5F7E9D1C3B5A7C9E1D3F5E7C9B1A3D5F7E9D1C3B5A7C9E1D3F5E7C9B1A3FFFFFFFFFFFFFFFF'
N = int(srpN_hex, 16)
g = 2

email_hash = hashlib.sha256(email.encode()).hexdigest()
salt = os.urandom(32)
inner = hashlib.sha256(f'{email}:{password}'.encode()).digest()
x = int.from_bytes(hashlib.sha256(salt + inner).digest(), 'big')
v = pow(g, x, N)
vb = v.to_bytes((v.bit_length() + 7) // 8, 'big')
pk = os.urandom(32)
uid = str(uuid.uuid4())

print(f\"\"\"INSERT INTO users (id, email_hash, srp_salt, srp_verifier, public_key, role, created_at, updated_at)
VALUES (
  '{uid}',
  '{email_hash}',
  '\\\\x{salt.hex()}',
  '\\\\x{vb.hex()}',
  '\\\\x{pk.hex()}',
  'user',
  NOW(),
  NOW()
)
ON CONFLICT (email_hash) DO UPDATE SET
  srp_salt = EXCLUDED.srp_salt,
  srp_verifier = EXCLUDED.srp_verifier,
  updated_at = NOW();\"\"\")
" | docker compose exec -T postgres psql -U usbvault -d usbvault

echo ""
echo "Test user created!"
echo "  Email: test@yahoo.com"
echo "  Password: test123"
