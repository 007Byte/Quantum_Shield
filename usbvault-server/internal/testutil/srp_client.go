//go:build integration

package testutil

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math/big"

	"golang.org/x/crypto/argon2"
)

// srp_client.go is a REAL SRP-6a client for the integration test fixtures.
//
// It mirrors, byte-for-byte, the canonical convention shared by the Go server
// (internal/auth/srp.go), the Rust client (usbvault-crypto/src/srp_client.rs)
// and the TS client (usbvault-app/src/crypto/srpClient.ts):
//
//	Group  = RFC 7919 ffdhe3072, g = 2, len(N) = 384 bytes.
//	PAD(x) = left-zero-pad big-endian to 384 bytes.
//	Hash   = SHA-256.
//	x      = Argon2id(password, H("srp-verifier" || salt || username))  (KEK params)
//	v      = g^x mod N
//	k      = H(PAD(N) || PAD(g))
//	A      = g^a mod N
//	u      = H(PAD(A) || PAD(B))
//	S      = (B - k*g^x)^(a + u*x) mod N
//	K      = H(PAD(S))
//	M1     = H(PAD(A) || PAD(B) || K)
//	M2     = H(PAD(A) || M1 || K)
//
// This replaces the previous plaintext {email,password} POSTs in fixtures.go,
// which targeted a nonexistent /auth/login endpoint and directly contradicted
// the zero-knowledge SRP-6a model. The integration tests now exercise the SAME
// SRP handshake a real client performs — no plaintext password ever leaves the
// fixture.

// srpN is the ffdhe3072 prime, identical to internal/auth/srp.go srpN and the
// Rust/TS clients' N_HEX.
const srpNHex = "FFFFFFFFFFFFFFFFADF85458A2BB4A9AAFDC5620273D3CF1" +
	"D8B9C583CE2D3695A9E13641146433FBCC939DCE249B3EF9" +
	"7D2FE363630C75D8F681B202AEC4617AD3DF1ED5D5FD6561" +
	"2433F51F5F066ED0856365553DED1AF3B557135E7F57C935" +
	"984F0C70E0E68B77E2A689DAF3EFE8721DF158A136ADE735" +
	"30ACCA4F483A797ABC0AB182B324FB61D108A94BB2C8E3FB" +
	"B96ADAB760D7F4681D4F42A3DE394DF4AE56EDE76372BB19" +
	"0B07A7C8EE0A6D709E02FCE1CDF7E2ECC03404CD28342F61" +
	"9172FE9CE98583FF8E4F1232EEF28183C3FE3B1B4C6FAD73" +
	"3BB5FCBC2EC22005C58EF1837D1683B2C6F34A26C1B2EFFA" +
	"886B4238611FCFDCDE355B3B6519035BBC34F4DEF99C0238" +
	"61B46FC9D6E6C9077AD91D2691F7F7EE598CB0FAC186D91C" +
	"AEFE130985139270B4130C93BC437944F4FD4452E2D74DD3" +
	"64F2E21E71F54BFF5CAE82AB9C9DF69EE86D2BC522363A0D" +
	"ABC521979B0DEADA1DBF9A42D5C4484E0ABCD06BFA53DDEF" +
	"3C1B20EE3FD59D7C25E41D2B66C62E37FFFFFFFFFFFFFFFF"

const srpPadLen = 384 // len(N) in bytes (3072 bits)

// Argon2id KEK parameters — must match internal/auth/srp.go and the clients.
const (
	srpArgon2Memory      = 65536 // 64 MiB
	srpArgon2Time        = 3
	srpArgon2Parallelism = 4
	srpArgon2KeyLen      = 32
)

func srpN() *big.Int {
	n := new(big.Int)
	n.SetString(srpNHex, 16)
	return n
}

func srpPad(x *big.Int) []byte {
	xb := x.Bytes()
	out := make([]byte, srpPadLen)
	if len(xb) <= srpPadLen {
		copy(out[srpPadLen-len(xb):], xb)
	} else {
		copy(out, xb[len(xb)-srpPadLen:])
	}
	return out
}

func srpHash(parts ...[]byte) []byte {
	h := sha256.New()
	for _, p := range parts {
		h.Write(p)
	}
	return h.Sum(nil)
}

// deriveSrpX derives the SRP private key x from (salt, username, password),
// matching the server/Rust/TS derivation exactly.
func deriveSrpX(salt []byte, username, password string) *big.Int {
	// Domain-separate the salt: srp_salt = SHA-256("srp-verifier" || salt || username)
	srpSalt := srpHash([]byte("srp-verifier"), salt, []byte(username))
	xBytes := argon2.IDKey([]byte(password), srpSalt,
		srpArgon2Time, srpArgon2Memory, srpArgon2Parallelism, srpArgon2KeyLen)
	return new(big.Int).SetBytes(xBytes)
}

// SRPCredentials are the registration artifacts a real client computes locally
// and sends to /auth/register. The password is NEVER part of this struct.
type SRPCredentials struct {
	SaltHex     string // hex-encoded 32-byte salt
	VerifierHex string // hex-encoded verifier v = g^x mod N
}

// ComputeSRPRegistration derives the salt + verifier for registration. A random
// 32-byte salt is generated; v = g^(x) mod N where x = Argon2id(password, ...).
func ComputeSRPRegistration(username, password string) (*SRPCredentials, error) {
	salt := make([]byte, 32)
	if _, err := rand.Read(salt); err != nil {
		return nil, fmt.Errorf("generate srp salt: %w", err)
	}
	x := deriveSrpX(salt, username, password)
	v := new(big.Int).Exp(big.NewInt(2), x, srpN())
	return &SRPCredentials{
		SaltHex:     hex.EncodeToString(salt),
		VerifierHex: hex.EncodeToString(v.Bytes()),
	}, nil
}

// SRPClientSession holds the per-login client ephemeral state.
type SRPClientSession struct {
	a *big.Int // client private ephemeral
	A *big.Int // client public ephemeral A = g^a mod N
	x *big.Int // SRP private key
}

// StartSRPLogin derives x from the salt the server returned and generates a
// fresh client ephemeral (a, A). Returns A as a base-10 string (the wire format
// the server's /auth/srp/verify expects).
func StartSRPLogin(saltHex, username, password string) (*SRPClientSession, string, error) {
	salt, err := hex.DecodeString(saltHex)
	if err != nil {
		return nil, "", fmt.Errorf("decode srp salt: %w", err)
	}
	x := deriveSrpX(salt, username, password)

	N := srpN()
	g := big.NewInt(2)

	// Random 256-bit client ephemeral a; reject trivial A.
	for {
		aBytes := make([]byte, 32)
		if _, err := rand.Read(aBytes); err != nil {
			return nil, "", fmt.Errorf("generate srp ephemeral: %w", err)
		}
		a := new(big.Int).SetBytes(aBytes)
		if a.Cmp(big.NewInt(1)) <= 0 {
			continue
		}
		A := new(big.Int).Exp(g, a, N)
		if A.Sign() == 0 || A.Cmp(big.NewInt(1)) == 0 {
			continue
		}
		return &SRPClientSession{a: a, A: A, x: x}, A.String(), nil
	}
}

// ProcessChallenge computes the shared session key K and client proof M1 from
// the server's B (base-10 string). Returns M1 as a lowercase hex string (the
// wire format /auth/srp/verify expects) and K for M2 verification.
func (s *SRPClientSession) ProcessChallenge(bStr string) (m1Hex string, K []byte, err error) {
	N := srpN()
	g := big.NewInt(2)

	B := new(big.Int)
	if _, ok := B.SetString(bStr, 10); !ok {
		return "", nil, fmt.Errorf("invalid server B: %q", bStr)
	}
	if B.Sign() == 0 || new(big.Int).Mod(B, N).Sign() == 0 {
		return "", nil, fmt.Errorf("invalid server B (zero mod N)")
	}

	// k = H(PAD(N) || PAD(g))
	k := new(big.Int).SetBytes(srpHash(srpPad(N), srpPad(g)))

	// u = H(PAD(A) || PAD(B))
	u := new(big.Int).SetBytes(srpHash(srpPad(s.A), srpPad(B)))

	// S = (B - k*g^x)^(a + u*x) mod N
	gx := new(big.Int).Exp(g, s.x, N)
	kgx := new(big.Int).Mul(k, gx)
	kgx.Mod(kgx, N)
	base := new(big.Int).Sub(B, kgx)
	base.Mod(base, N)
	if base.Sign() < 0 {
		base.Add(base, N)
	}
	exp := new(big.Int).Add(s.a, new(big.Int).Mul(u, s.x))
	S := new(big.Int).Exp(base, exp, N)

	// K = H(PAD(S))
	Kbytes := srpHash(srpPad(S))

	// M1 = H(PAD(A) || PAD(B) || K)
	M1 := srpHash(srpPad(s.A), srpPad(B), Kbytes)

	return hex.EncodeToString(M1), Kbytes, nil
}

// VerifyServerM2 confirms the server's proof M2 = H(PAD(A) || M1 || K),
// providing mutual authentication. m1Hex/m2Hex are lowercase hex.
func (s *SRPClientSession) VerifyServerM2(m1Hex, m2Hex string, K []byte) bool {
	m1, err := hex.DecodeString(m1Hex)
	if err != nil {
		return false
	}
	expected := srpHash(srpPad(s.A), m1, K)
	return hex.EncodeToString(expected) == m2Hex
}
